import { PrismaService } from '../src/prisma/prisma.service';
import { withRequestContext } from '../src/prisma/request-context';

/**
 * The client extension that tells Postgres who is asking.
 *
 * This suite exists because the first version of that extension threw
 * `$transaction is not a function` on every authenticated request, and nothing
 * caught it. Every unit test in the codebase builds its service with a stub
 * client, so the extension never ran; it only ran in a deployment, where it
 * broke every route that reads the database while leaving the health check,
 * which reads nothing, reporting the instance as healthy.
 *
 * So these tests use a real client against a real database. They are about the
 * plumbing rather than the policies: that a query still returns what it should
 * with an identity attached, that a transaction stays one transaction, and
 * that the settings the policies read are actually present on the connection
 * the query runs on.
 */
describe('setting the request identity on the connection', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /*
    `await fn()` rather than `fn`, and the difference is not cosmetic. A Prisma
    call returns a lazy promise: the query runs when it is awaited, not when it
    is written. Handing this helper `() => prisma.user.count()` builds the
    promise inside the identity and then awaits it outside, by which time the
    async context is gone and the query runs with no identity at all. Awaiting
    in here keeps the whole thing inside the scope.

    It is worth stating because it fails quietly. Nothing throws; the query
    simply runs unrestricted, which is the one outcome this file exists to
    prevent.
  */
  const asAdmin = <T>(fn: () => Promise<T>) =>
    withRequestContext({ userId: 'e2e-user', role: 'ADMIN' }, async () =>
      fn(),
    );

  /* The failure that started this. A plain read, with a context in scope. */
  it('runs an ordinary query when a request is in scope', async () => {
    const count = await asAdmin(() => prisma.user.count());
    expect(typeof count).toBe('number');
  });

  it('runs the same query with no request in scope', async () => {
    const count = await prisma.user.count();
    expect(typeof count).toBe('number');
  });

  /*
    The settings have to be visible to the query itself, not merely sent. They
    are transaction local, so a query that landed on a different connection
    from the `set_config` would read them back empty and every policy would
    treat it as unrestricted.
  */
  it('puts the identity on the connection the query runs on', async () => {
    const [row] = await asAdmin(() =>
      prisma.$queryRaw<{ role: string; id: string }[]>`
        SELECT current_setting('app.role', true) AS role,
               current_setting('app.user_id', true) AS id`,
    );
    expect(row.role).toBe('ADMIN');
    expect(row.id).toBe('e2e-user');
  });

  it('leaves the settings unset when nothing is in scope', async () => {
    const [row] = await prisma.$queryRaw<{ role: string | null }[]>`
      SELECT current_setting('app.role', true) AS role`;
    expect(row.role ?? '').toBe('');
  });

  /*
    A service that opens a transaction gets one transaction. If the query
    extension wrapped each statement separately they would run on different
    connections, the rollback below would leave the write behind, and the
    atomicity the service asked for would be silently gone.
  */
  it('keeps an interactive transaction atomic', async () => {
    const before = await asAdmin(() => prisma.user.count());

    await expect(
      asAdmin(() =>
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT 1`;
          throw new Error('deliberate rollback');
        }),
      ),
    ).rejects.toThrow('deliberate rollback');

    expect(await asAdmin(() => prisma.user.count())).toBe(before);
  });

  /* And the identity reaches the statements inside it. */
  it('sets the identity once for a whole transaction', async () => {
    const rows = await asAdmin(() =>
      prisma.$transaction(async (tx) => {
        const a = await tx.$queryRaw<{ role: string }[]>`
          SELECT current_setting('app.role', true) AS role`;
        const b = await tx.$queryRaw<{ role: string }[]>`
          SELECT current_setting('app.role', true) AS role`;
        return [a[0].role, b[0].role];
      }),
    );
    expect(rows).toEqual(['ADMIN', 'ADMIN']);
  });

  /* The batch form is used in a handful of places and must keep working. */
  it('runs a batch transaction', async () => {
    const [a, b] = await asAdmin(() =>
      prisma.$transaction([prisma.user.count(), prisma.user.count()]),
    );
    expect(a).toBe(b);
  });

  /*
    Concurrency is the reason this uses AsyncLocalStorage rather than a field
    on the service. Two requests in flight at once must not read each other's
    identity, and a single shared variable would give both whichever wrote last.
  */
  it('keeps two concurrent requests apart', async () => {
    const read = (role: string, userId: string) =>
      withRequestContext({ userId, role }, async () => {
        const [row] = await prisma.$queryRaw<{ role: string; id: string }[]>`
          SELECT current_setting('app.role', true) AS role,
                 current_setting('app.user_id', true) AS id`;
        return `${row.role}:${row.id}`;
      });

    expect(
      await Promise.all([
        read('PARENT', 'parent-a'),
        read('TEACHER', 'teacher-b'),
        read('STUDENT', 'student-c'),
      ]),
    ).toEqual(['PARENT:parent-a', 'TEACHER:teacher-b', 'STUDENT:student-c']);
  });
});
