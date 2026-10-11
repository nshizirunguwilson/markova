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

  /*
    Links between schools. The wall decides which rows a school sees, but a
    foreign key is checked by Postgres without it: naming another school's id
    in a request used to tie the two schools' records together. Every foreign
    key between two school tables now refuses a row of another school.
  */
  describe('links between schools', () => {
    type Link = { child: string; col: string; parent: string; pcol: string };
    let links: Link[];

    beforeAll(async () => {
      links = await owner.$queryRaw<Link[]>`
        SELECT tc.table_name AS child, kcu.column_name AS col,
               ccu.table_name AS parent, ccu.column_name AS pcol
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND ccu.table_name <> 'schools'
          AND EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema = 'public'
                        AND c.table_name = tc.table_name
                        AND c.column_name = 'school_id')
          AND EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema = 'public'
                        AND c.table_name = ccu.table_name
                        AND c.column_name = 'school_id')`;
    });

    it('checks every link between two school tables', async () => {
      expect(links.length).toBeGreaterThanOrEqual(100);
      const triggers = await owner.$queryRaw<{ child: string; args: string }[]>`
        SELECT c.relname AS child,
               encode(t.tgargs, 'escape') AS args
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname IN ('same_school_insert', 'same_school_update')`;
      const missing: string[] = [];
      for (const l of links) {
        const own = triggers.filter((t) => t.child === l.child);
        const args = own.map((t) => t.args.split('\\000'));
        const covered =
          own.length === 2 &&
          args.every((a) =>
            a.some(
              (_, i) =>
                i % 3 === 0 &&
                a[i] === l.col &&
                a[i + 1] === l.parent &&
                a[i + 2] === l.pcol,
            ),
          );
        if (!covered) missing.push(`${l.child}.${l.col} -> ${l.parent}`);
      }
      expect(missing).toEqual([]);
    });

    it("refuses a row pointing at another school's row, through the application", async () => {
      await expect(
        inFirst(() =>
          app.classSection.create({
            data: { classLevelId: secondLevelId, name: `${tag} Across` },
          }),
        ),
      ).rejects.toThrow(/another school/);
      await expect(
        owner.classSection.count({ where: { name: `${tag} Across` } }),
      ).resolves.toBe(0);
    });

    /*
      Every link, both ways between the seeded schools, wherever both have a
      row to try it with: an existing row is pointed at the other school's
      row, and has to be refused. Inside one transaction that is rolled back,
      so nothing is changed.
    */
    it("refuses every link to another school's row, wherever there is data to try it", async () => {
      const schools = await owner.school.findMany({
        where: { slug: { in: ['markova-academy', 'gs-umucyo'] } },
        select: { id: true },
      });
      expect(schools).toHaveLength(2);
      const tried = new Set<string>();
      const accepted: string[] = [];

      await owner
        .$transaction(
          async (tx) => {
            for (const l of links) {
              for (const [here, there] of [
                [schools[0].id, schools[1].id],
                [schools[1].id, schools[0].id],
              ]) {
                const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
                  `SELECT id::text FROM "${l.child}" WHERE school_id = $1 LIMIT 1`,
                  here,
                );
                const [target] = await tx.$queryRawUnsafe<{ v: string }[]>(
                  `SELECT "${l.pcol}"::text AS v FROM "${l.parent}" WHERE school_id = $1 LIMIT 1`,
                  there,
                );
                if (!row || !target) continue;
                tried.add(`${l.child}.${l.col}`);
                await tx.$executeRawUnsafe('SAVEPOINT across');
                try {
                  await tx.$executeRawUnsafe(
                    `UPDATE "${l.child}" SET "${l.col}" = $1 WHERE id::text = $2`,
                    target.v,
                    row.id,
                  );
                  accepted.push(`${l.child}.${l.col} -> ${l.parent}`);
                } catch (error) {
                  if (!/another school/.test(String(error))) {
                    /* Refused for another reason first (a unique rule, say).
                       Not proof either way, so not counted. */
                    tried.delete(`${l.child}.${l.col}`);
                  }
                }
                await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT across');
              }
            }
            throw new Error('roll back');
          },
          { timeout: 120_000 },
        )
        .catch((error: Error) => {
          if (error.message !== 'roll back') throw error;
        });

      expect(accepted).toEqual([]);
      /* 93 of the 118 links with the three-school demo seed; the rest are
         tables one of the two schools has no rows in yet. */
      expect(tried.size).toBeGreaterThanOrEqual(90);
    }, 180_000);
  });
});
