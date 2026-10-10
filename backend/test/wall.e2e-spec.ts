import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  withPlatform,
  withRequestContext,
  withSchool,
} from '../src/prisma/request-context';

/**
 * The wall between schools, proved against the real database.
 *
 * Step 3, part 2 of docs/MULTI-SCHOOL-DESIGN.md. Postgres itself refuses to
 * show the application one school's rows while it is working for another,
 * and refuses to let it write a row into a school it is not in. These tests
 * hold that from both sides:
 *
 *   - every table a school owns has the rule, checked table by table;
 *   - for every one of those tables, what the application sees inside a
 *     school is exactly that school's rows, and inside a school that owns
 *     nothing it sees nothing;
 *   - a second school's row cannot be read, changed, deleted or written by
 *     the first, through the ordinary application connection;
 *   - with no school at all, the application sees nothing and writes nothing;
 *   - only the one named platform pass sees across schools.
 *
 * The owner connection (the role migrations and the seed use) sets up a
 * second school and cleans it away afterwards. Everything being judged goes
 * through PrismaService, the restricted role the application uses.
 */
describe('the wall between schools', () => {
  let app: PrismaService;
  let owner: PrismaClient;
  let first: string;
  let second: string;
  let secondLevelId: string;
  const tag = `wall-${Date.now()}`;

  /* Every table that carries a school, read from the database itself. */
  let schoolTables: string[];

  beforeAll(async () => {
    app = new PrismaService();
    await app.$connect();
    owner = new PrismaClient({
      datasourceUrl:
        process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    await owner.$connect();

    first = (await owner.school.findFirst({
      where: { slug: 'markova-academy' },
      select: { id: true },
    }))!.id;
    second = (
      await owner.school.create({
        data: { name: `Lycee ${tag}`, slug: `lycee-${tag}` },
      })
    ).id;
    secondLevelId = (
      await owner.classLevel.create({
        data: {
          name: `${tag} Senior 1`,
          order: 1,
          stage: 'O_LEVEL',
          schoolId: second,
        },
      })
    ).id;

    const rows = await owner.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'school_id'
      ORDER BY table_name`;
    schoolTables = rows.map((r) => r.table_name);
  });

  afterAll(async () => {
    await owner.classLevel.deleteMany({ where: { schoolId: second } });
    await owner.school.delete({ where: { id: second } });
    await owner.$disconnect();
    await app.$disconnect();
  });

  const inFirst = <T>(fn: () => Promise<T>) => withSchool(first, fn);

  it('has the rule on every table a school owns', async () => {
    expect(schoolTables.length).toBeGreaterThanOrEqual(58);
    const withRule = await owner.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_policies
      WHERE schemaname = 'public' AND policyname = 'school_wall'`;
    const covered = new Set(withRule.map((r) => r.tablename));
    expect(schoolTables.filter((t) => !covered.has(t))).toEqual([]);
  });

  /*
    The broad check. For every school table: inside the first school, the
    application sees exactly the first school's rows; inside the second, only
    the second's. A missing or wrong rule on any one table shows up here as a
    count that does not match.
  */
  it('shows each school exactly its own rows, on every table', async () => {
    const mismatches: string[] = [];
    for (const table of schoolTables) {
      for (const school of [first, second]) {
        const [{ n: expected }] = await owner.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM "${table}" WHERE school_id = $1`,
          school,
        );
        const [{ n: seen }] = await withSchool(school, () =>
          app.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM "${table}"`,
          ),
        );
        if (seen !== expected) {
          mismatches.push(`${table}: saw ${seen}, owns ${expected}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('shows a school that owns nothing nothing at all, on every table', async () => {
    const leaks: string[] = [];
    for (const table of schoolTables) {
      const [{ n }] = await withSchool('a-school-that-does-not-exist', () =>
        app.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM "${table}"`,
        ),
      );
      if (n !== BigInt(0)) leaks.push(`${table}: ${n}`);
    }
    expect(leaks).toEqual([]);
  });

  describe("one school reaching for another's row", () => {
    it('cannot list it', async () => {
      const names = await inFirst(() =>
        app.classLevel.findMany({ select: { id: true } }),
      );
      expect(names.map((l) => l.id)).not.toContain(secondLevelId);
    });

    it('cannot read it by its id', async () => {
      await expect(
        inFirst(() =>
          app.classLevel.findUnique({ where: { id: secondLevelId } }),
        ),
      ).resolves.toBeNull();
    });

    it('cannot change it', async () => {
      await expect(
        inFirst(() =>
          app.classLevel.update({
            where: { id: secondLevelId },
            data: { name: 'Taken over' },
          }),
        ),
      ).rejects.toThrow();
      const row = await owner.classLevel.findUnique({
        where: { id: secondLevelId },
      });
      expect(row?.name).toBe(`${tag} Senior 1`);
    });

    it('cannot change it in bulk either', async () => {
      const { count } = await inFirst(() =>
        app.classLevel.updateMany({
          where: { id: secondLevelId },
          data: { name: 'Taken over' },
        }),
      );
      expect(count).toBe(0);
    });

    it('cannot delete it', async () => {
      await expect(
        inFirst(() => app.classLevel.delete({ where: { id: secondLevelId } })),
      ).rejects.toThrow();
      await expect(
        owner.classLevel.findUnique({ where: { id: secondLevelId } }),
      ).resolves.not.toBeNull();
    });

    it('cannot write a row into it', async () => {
      await expect(
        inFirst(() =>
          app.classLevel.create({
            data: {
              name: `${tag} Smuggled`,
              order: 2,
              stage: 'O_LEVEL',
              schoolId: second,
            },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        owner.classLevel.count({ where: { name: `${tag} Smuggled` } }),
      ).resolves.toBe(0);
    });

    it('cannot move its own row into it', async () => {
      const mine = await inFirst(() =>
        app.classLevel.create({
          data: { name: `${tag} Mine`, order: 3, stage: 'O_LEVEL' },
        }),
      );
      await expect(
        inFirst(() =>
          app.classLevel.update({
            where: { id: mine.id },
            data: { schoolId: second },
          }),
        ),
      ).rejects.toThrow();
      await owner.classLevel.delete({ where: { id: mine.id } });
    });
  });

  describe('with no school at all', () => {
    it('sees nothing', async () => {
      expect(await app.student.count()).toBe(0);
      expect(await app.mark.count()).toBe(0);
      expect(await app.feePayment.count()).toBe(0);
    });

    it('writes nothing', async () => {
      await expect(
        app.classLevel.create({
          data: { name: `${tag} Nowhere`, order: 4, stage: 'O_LEVEL' },
        }),
      ).rejects.toThrow();
    });

    /* A signed-in person with no school is still no school. */
    it('sees nothing for a person whose school is missing', async () => {
      const count = await withRequestContext(
        { userId: 'someone', role: 'ADMIN' },
        async () => app.student.count(),
      );
      expect(count).toBe(0);
    });
  });

  describe('the platform pass', () => {
    it('sees every school', async () => {
      const levels = await withPlatform(() =>
        app.classLevel.findMany({ where: { id: secondLevelId } }),
      );
      expect(levels).toHaveLength(1);
    });

    it('cannot be switched on by a request', async () => {
      /* The bypass comes only from withPlatform. A person in context, with
         any role, does not get it. */
      const [row] = await withRequestContext(
        { userId: 'someone', role: 'ADMIN', schoolId: first },
        async () =>
          app.$queryRaw<{ bypass: string }[]>`
            SELECT current_setting('app.bypass', true) AS bypass`,
      );
      expect(row.bypass).toBe('');
    });
  });
});
