import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { withSchool } from '../src/prisma/request-context';

/**
 * Many schools in one database, part 1: every row belongs to a school.
 *
 * Run against the real database, because what is being proved lives there:
 * the column on every table, the default that fills it, and the unique rules
 * that now hold within a school rather than across all of them. A mocked
 * client would agree with anything.
 *
 * The owner connection sets up a second school and cleans up after itself.
 * The application connection (PrismaService, the restricted role) is the one
 * whose behaviour is being checked.
 */
describe('every row belongs to a school', () => {
  let app: PrismaService;
  let owner: PrismaClient;
  let firstSchoolId: string;
  const tag = `e2e-${Date.now()}`;
  let secondSchoolId: string;

  beforeAll(async () => {
    app = new PrismaService();
    await app.$connect();
    owner = new PrismaClient({
      datasourceUrl:
        process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    await owner.$connect();
    const first = await owner.school.findFirst({
      where: { slug: 'markova-academy' },
      select: { id: true },
    });
    firstSchoolId = first!.id;
    const second = await owner.school.create({
      data: { name: `Second School ${tag}`, slug: `second-${tag}` },
    });
    secondSchoolId = second.id;
  });

  afterAll(async () => {
    await owner.classLevel.deleteMany({ where: { name: { startsWith: tag } } });
    await owner.student.updateMany({
      where: { cardCode: { startsWith: tag } },
      data: { cardCode: null },
    });
    await owner.school.deleteMany({
      where: { slug: { startsWith: 'second-e2e-' } },
    });
    await owner.$disconnect();
    await app.$disconnect();
  });

  /* Writes from the application always happen inside a school. */
  const inFirst = <T>(fn: () => Promise<T>) => withSchool(firstSchoolId, fn);

  /*
    The whole design rests on this: a table without the column is a table the
    wall between schools cannot cover. Sign in sessions and push tokens are
    the two deliberate exceptions; they belong to the login, not a school.
  */
  it('puts a school on every table a school owns', async () => {
    const rows = await owner.$queryRaw<{ table_name: string }[]>`
      SELECT t.table_name
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT IN
          ('_prisma_migrations', 'schools', 'user_sessions', 'push_tokens')
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = t.table_name
            AND c.column_name = 'school_id'
        )
    `;
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it('leaves no row without a school', async () => {
    for (const table of ['users', 'students', 'marks', 'fee_payments']) {
      const [{ missing }] = await owner.$queryRawUnsafe<{ missing: bigint }[]>(
        `SELECT count(*) AS missing FROM "${table}" WHERE school_id IS NULL`,
      );
      expect(Number(missing)).toBe(0);
    }
  });

  it('knows which school it is running in', async () => {
    const school = await owner.school.findUnique({
      where: { id: firstSchoolId },
    });
    expect(school?.status).toBe('ACTIVE');
  });

  /* Nothing in the application names the school when it writes a row. */
  it('puts a new row in the current school without being told', async () => {
    const level = await inFirst(() =>
      app.classLevel.create({
        data: { name: `${tag} Senior 1`, stage: 'O_LEVEL', order: 900 },
      }),
    );
    expect(level.schoolId).toBe(firstSchoolId);
  });

  /* Every school has a "Senior 1". That used to be one row for the world. */
  it('lets two schools use the same class name', async () => {
    const name = `${tag} Senior 2`;
    await inFirst(() =>
      app.classLevel.create({
        data: { name, stage: 'O_LEVEL', order: 901 },
      }),
    );
    await expect(
      owner.classLevel.create({
        data: {
          name,
          stage: 'O_LEVEL',
          order: 901,
          schoolId: secondSchoolId,
        },
      }),
    ).resolves.toMatchObject({ name, schoolId: secondSchoolId });
  });

  it('still refuses the same class name twice in one school', async () => {
    const name = `${tag} Senior 3`;
    await inFirst(() =>
      app.classLevel.create({
        data: { name, stage: 'O_LEVEL', order: 902 },
      }),
    );
    await expect(
      inFirst(() =>
        app.classLevel.create({
          data: { name, stage: 'O_LEVEL', order: 902 },
        }),
      ),
    ).rejects.toThrow();
  });

  /*
    A card is checked by scanning its code, by anybody, with no school chosen,
    so the code alone has to find exactly one card in the whole system.
  */
  it('keeps an ID card code unique across every school', async () => {
    const students = await owner.student.findMany({
      take: 1,
      select: { id: true },
    });
    expect(students).toHaveLength(1);
    await owner.student.update({
      where: { id: students[0].id },
      data: { cardCode: `${tag}-CARD` },
    });
    const [{ count }] = await owner.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_indexes
      WHERE tablename = 'students'
        AND indexdef LIKE 'CREATE UNIQUE INDEX%(card_code)'
    `;
    expect(Number(count)).toBe(1);
  });
});
