import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { HttpExceptionFilter } from '../src/common/filters';

/**
 * No way across: every route in the API, as every role, aimed at another
 * school. Step 3, part 5 of docs/MULTI-SCHOOL-DESIGN.md.
 *
 * A school made for this test (the attacker) has one person in each role.
 * Each of them calls every route the API has, read from its own OpenAPI
 * description so a route added tomorrow is swept too, with Markova Academy's
 * ids wherever an id goes: in the path, in the query, and in every documented
 * field of the body. Then:
 *
 *   - no answer may contain any id of Markova Academy's records;
 *   - Markova Academy's data must be exactly as it was, table by table.
 *
 * Routes that are public by design and answer anybody with the right secret
 * (signing in, a reset link, a verification code) are left out: reaching
 * another school through them needs that school's secret, which is the point.
 */

const PASSWORD = 'Password123!';
const ROLES = [
  'ADMIN',
  'HEAD_TEACHER',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'LIBRARIAN',
  'BURSAR',
  'NURSE',
  'PATRON',
  'MATRON',
] as const;

/**
 * Routes that answer whoever holds a secret, or anybody at all, by design:
 * signing in, a reset link, a verification code, and the public pages
 * (admissions, the sign in screen's branding), which serve the install's own
 * school to anybody who opens them.
 */
const PUBLIC_BY_SECRET = [
  /\/public(\/|$)/,
  /^\/api\/auth\/(login|verify-otp|resend-otp|refresh|request-reset|reset-password)$/,
  /^\/api\/verify\//,
  /^\/api\/health/,
];

/** Which table a `:id` belongs to, by the words in front of it. */
const RESOURCE: [RegExp, string][] = [
  [/assessment-types$/, 'assessment_types'],
  [/assignments$/, 'teacher_subject_classes'],
  [/class-levels$/, 'class_levels'],
  [/exams$/, 'exam_schedules'],
  [/sections$|classes$/, 'class_sections'],
  [/subjects$/, 'subjects'],
  [/terms$/, 'terms'],
  [/timetable$/, 'timetables'],
  [/trades$/, 'trades'],
  [/years$/, 'academic_years'],
  [/activities$/, 'activities'],
  [/applications$/, 'applications'],
  [/documents$/, 'application_documents'],
  [/intakes$/, 'admission_intakes'],
  [/offers$/, 'admission_offers'],
  [/visits$/, 'clinic_visits'],
  [/appeals$/, 'discipline_appeals'],
  [/incidents$/, 'discipline_incidents'],
  [/merits$/, 'merit_awards'],
  [/item$|items$/, 'fee_items'],
  [/invoices$/, 'fee_invoices'],
  [/payments$/, 'fee_payments'],
  [/waivers$/, 'fee_waivers'],
  [/faqs$/, 'faq_articles'],
  [/tickets$/, 'support_tickets'],
  [/submissions$/, 'homework_submissions'],
  [/homework$/, 'homeworks'],
  [/books$/, 'books'],
  [/loans$/, 'book_loans'],
  [/term-results$/, 'term_results'],
  [/marks$/, 'marks'],
  [/conversations$/, 'conversations'],
  [/messages$/, 'messages'],
  [/notifications$/, 'notifications'],
  [/pocket-money(\/accounts)?$/, 'pocket_money_accounts'],
  [/transactions$/, 'pocket_money_transactions'],
  [/health(\/records)?$/, 'student_health_records'],
  [/teachers$/, 'teachers'],
  [/students$/, 'students'],
  [/users$/, 'users'],
];

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe('no way across to another school (e2e)', () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;
  const tag = `sweep${Date.now()}`;
  let attacker: string;
  let victim: string;
  /** A few of the victim's ids, per table. */
  const victimIds = new Map<string, string[]>();
  /** Every id the victim's records have, for spotting one in an answer. */
  const victimAll = new Set<string>();
  const tokens = new Map<string, string>();
  /* Each role's refresh token, and when its access token was last renewed.
     The sweep runs for many minutes and a student's access token lasts five
     (they are always on a shared computer), so tokens are renewed as it goes
     rather than quietly expiring half way through. */
  const refreshTokens = new Map<string, string>();
  const renewedAt = new Map<string, number>();
  let schoolTables: string[];

  const idsFor = (table: string) =>
    victimIds.get(table) ?? victimIds.get('users')!;

  const tableForParam = (param: string, before: string): string => {
    if (param !== 'id') {
      const t = `${snake(param.replace(/Id$/, ''))}s`;
      if (victimIds.has(t)) return t;
      if (/user|parent|borrower|recipient/i.test(param)) return 'users';
      return 'users';
    }
    for (const [pattern, table] of RESOURCE) {
      if (pattern.test(before)) return table;
    }
    return 'users';
  };

  /** A value for one documented field: a victim id wherever an id goes. */
  const valueFor = (
    name: string,
    schema: Record<string, any>,
    components: Record<string, any>,
    depth = 0,
  ): unknown => {
    if (schema.$ref) {
      return valueFor(
        name,
        components[schema.$ref.split('/').pop()] ?? {},
        components,
        depth,
      );
    }
    if (/Ids?$/.test(name) && !/^(national|rssb|nfc)/i.test(name)) {
      const id = idsFor(tableForParam(name.replace(/s$/, ''), ''))[0];
      return /Ids$/.test(name) ? [id] : id;
    }
    if (schema.enum) return schema.enum[0];
    switch (schema.type) {
      case 'integer':
      case 'number':
        return 1;
      case 'boolean':
        return false;
      case 'array':
        return schema.items && depth < 2
          ? [valueFor(name, schema.items, components, depth + 1)]
          : [];
      case 'object':
        return depth < 2 ? bodyFrom(schema, components, depth + 1) : {};
      default:
        if (schema.format === 'date-time' || /date|At$/i.test(name)) {
          return new Date().toISOString();
        }
        if (schema.format === 'email' || /email/i.test(name)) {
          return `x.${tag}@example.rw`;
        }
        return 'x';
    }
  };

  const bodyFrom = (
    schema: Record<string, any>,
    components: Record<string, any>,
    depth = 0,
  ): Record<string, unknown> => {
    const body: Record<string, unknown> = {};
    for (const [name, prop] of Object.entries(
      (schema.properties ?? {}) as Record<string, any>,
    )) {
      body[name] = valueFor(name, prop, components, depth);
    }
    return body;
  };

  /** A fingerprint of everything the victim holds, table by table. */
  const fingerprint = async () => {
    const out: Record<string, string> = {};
    for (const table of schoolTables) {
      const [row] = await owner.$queryRawUnsafe<{ n: bigint; h: string }[]>(
        `SELECT count(*) AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h
         FROM "${table}" t WHERE school_id = $1`,
        victim,
      );
      out[table] = `${row.n}:${row.h}`;
    }
    return out;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () => ({
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
        getRecord: () => [],
        addRecord: () => undefined,
      })
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    /* As main.ts does: the answers judged are the ones a client gets. */
    app.useGlobalFilters(new HttpExceptionFilter());
    /* Listening once, on a port of its own. Left to supertest, every one of
       several thousand requests starts and stops a server of its own, and
       now and then the operating system drops one of those connections,
       which reads as a server that did not answer. */
    await app.listen(0);

    owner = new PrismaClient({
      datasourceUrl:
        process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    await owner.$connect();

    victim = (
      await owner.school.findFirstOrThrow({
        where: { slug: 'markova-academy' },
      })
    ).id;
    attacker = (
      await owner.school.create({
        data: { name: `Attacker ${tag}`, slug: tag },
      })
    ).id;

    schoolTables = (
      await owner.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'school_id'
        ORDER BY table_name`
    ).map((r) => r.table_name);

    for (const table of schoolTables) {
      const rows = await owner.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text AS id FROM "${table}" WHERE school_id = $1 LIMIT 2`,
        victim,
      );
      if (rows.length)
        victimIds.set(
          table,
          rows.map((r) => r.id),
        );
      const [{ n }] = await owner.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table}" WHERE school_id = $1`,
        victim,
      );
      /* The very large tables (marks, attendance) are left out of the set:
         an answer leaking one of their rows carries the student's, subject's
         and class's ids too, which are in it. */
      if (Number(n) <= 60_000) {
        const all = await owner.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id::text AS id FROM "${table}" WHERE school_id = $1`,
          victim,
        );
        for (const r of all) victimAll.add(r.id);
      }
    }

    /* The attacker school: one person in each role, a class for the
       student, a teacher record for the teacher. */
    await owner.$executeRaw`SELECT set_config('app.school_id', ${attacker}, false)`;
    const level = await owner.classLevel.create({
      data: { schoolId: attacker, name: 'Senior 1', order: 1 },
    });
    const section = await owner.classSection.create({
      data: { schoolId: attacker, classLevelId: level.id, name: 'A' },
    });
    const passwordHash = await hashPassword(PASSWORD);
    for (const role of ROLES) {
      const email = `${role.toLowerCase()}.${tag}@markova.edu`;
      const account = await owner.account.create({
        data: { email, passwordHash, forcePasswordChange: false },
      });
      const user = await owner.user.create({
        data: {
          schoolId: attacker,
          accountId: account.id,
          role,
          email,
          firstName: 'Sweep',
          lastName: role,
        },
      });
      if (role === 'TEACHER') {
        await owner.teacher.create({
          data: { schoolId: attacker, userId: user.id },
        });
      }
      if (role === 'STUDENT') {
        await owner.student.create({
          data: {
            schoolId: attacker,
            userId: user.id,
            studentIdNumber: `STD-SWEEP-${tag}`,
            classSectionId: section.id,
          },
        });
      }
      const first = await request(app.getHttpServer() as never)
        .post('/api/auth/login')
        .send({ email, password: PASSWORD });
      const done = first.body.accessToken
        ? first
        : await request(app.getHttpServer() as never)
            .post('/api/auth/verify-otp')
            .send({ sessionId: first.body.sessionId, otp: first.body.devOtp });
      tokens.set(role, done.body.accessToken as string);
      refreshTokens.set(role, done.body.refreshToken as string);
      renewedAt.set(role, Date.now());
    }
  }, 300_000);

  afterAll(async () => {
    /* Everything the sweep left in the attacker school, removed table by
       table until nothing is left; the order the foreign keys need is found
       by trying. */
    for (let pass = 0; pass < 12; pass++) {
      let left = 0;
      for (const table of schoolTables) {
        try {
          await owner.$executeRawUnsafe(
            `DELETE FROM "${table}" WHERE school_id = $1`,
            attacker,
          );
        } catch {
          left += 1;
        }
      }
      if (left === 0) break;
    }
    await owner.$executeRawUnsafe(
      `DELETE FROM accounts WHERE email LIKE $1`,
      `%.${tag}@markova.edu`,
    );
    await owner.school.delete({ where: { id: attacker } });
    await owner.$disconnect();
    await app.close();
  });

  it('reaches nothing of another school through any route, as any role', async () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const components = (document.components?.schemas ?? {}) as Record<
      string,
      any
    >;
    const before = await fingerprint();

    const leaks: string[] = [];
    /* Every victim id the sweep puts into a request. */
    const sent = new Set([...victimIds.values()].flat());
    const crashes: string[] = [];
    /* A call refused as not signed in tested nothing. Counted, so a sweep
       whose tokens ran out cannot pass by proving nothing. */
    const signedOut: string[] = [];
    let calls = 0;
    const freshToken = async (role: string) => {
      if (Date.now() - (renewedAt.get(role) ?? 0) > 3 * 60 * 1000) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: refreshTokens.get(role) });
        if (res.status === 201) {
          tokens.set(role, res.body.accessToken as string);
          refreshTokens.set(role, res.body.refreshToken as string);
          renewedAt.set(role, Date.now());
        }
      }
      return tokens.get(role);
    };
    let routes = 0;

    for (const [path, item] of Object.entries(document.paths)) {
      if (PUBLIC_BY_SECRET.some((p) => p.test(path))) continue;
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const op = (item as Record<string, any>)[method];
        if (!op) continue;
        routes += 1;

        /* The address, with the victim's ids in it. */
        const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const variants = params.length
          ? idsFor(
              tableForParam(
                params[params.length - 1],
                path.slice(
                  0,
                  path.indexOf(`{${params[params.length - 1]}}`) - 1,
                ),
              ),
            )
          : [''];
        for (const variant of variants) {
          let url = path;
          for (const p of params) {
            const before = url.slice(0, url.indexOf(`{${p}}`) - 1);
            const value =
              p === 'key'
                ? 'school_name'
                : p === 'role'
                  ? 'TEACHER'
                  : p === params[params.length - 1]
                    ? variant
                    : idsFor(tableForParam(p, before))[0];
            url = url.replace(`{${p}}`, value);
          }

          /* The query: every documented id, the victim's. */
          const fullQuery: Record<string, string> = {};
          for (const prm of (op.parameters ?? []) as Record<string, any>[]) {
            if (prm.in === 'query' && /Id$/.test(prm.name)) {
              fullQuery[prm.name] = idsFor(tableForParam(prm.name, ''))[0];
            }
          }

          /* The body: every documented field, ids the victim's. */
          const schema =
            op.requestBody?.content?.['application/json']?.schema ?? null;
          const fullBody = schema
            ? (valueFor('body', schema, components) as object)
            : undefined;

          /* Twice: once plainly, with only the ids the address needs, which
             is how a list that ignores the school shows itself; and once with
             the victim's ids in every query and body field, which is how a
             write that crosses over shows itself. */
          for (const [query, body] of [
            [{}, undefined],
            [fullQuery, fullBody],
          ] as const) {
            for (const role of ROLES) {
              calls += 1;
              const token = await freshToken(role);
              const req = request(app.getHttpServer())
                [method](url)
                .query(query)
                .set('Authorization', `Bearer ${token}`)
                .timeout(20_000);
              const res = await (body ? req.send(body) : req).catch(
                (e: Error) => ({ status: 0, text: e.message }) as const,
              );
              if (res.status >= 500 || res.status === 0) {
                crashes.push(
                  `${role} ${method.toUpperCase()} ${url} -> ${res.status}`,
                );
                continue;
              }
              // The sign in routes answer 401 for a wrong code or password.
              if (res.status === 401 && !url.startsWith('/api/auth/')) {
                signedOut.push(`${role} ${method.toUpperCase()} ${url}`);
                continue;
              }
              if (res.status >= 200 && res.status < 300) {
                const found = (res.text ?? '').match(
                  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
                );
                /* The audit log is the attacker's own record of its own
                 requests, so it repeats the ids the sweep sent. Those, and
                 only those, are not a leak there: the attacker typed them. */
                const echoed = (id: string) =>
                  url === '/api/audit' && sent.has(id);
                const theirs = (found ?? []).filter(
                  (id) => victimAll.has(id) && !echoed(id),
                );
                if (theirs.length) {
                  leaks.push(
                    `${role} ${method.toUpperCase()} ${url} -> ${res.status} carries ${theirs[0]}`,
                  );
                }
              }
            }
          }
        }
      }
    }

    const after = await fingerprint();
    const changed = schoolTables.filter((t) => before[t] !== after[t]);

    console.log(
      `Swept ${routes} routes with ${calls} calls as ${ROLES.length} roles; ` +
        `${leaks.length} leaks, ${changed.length} tables changed, ${crashes.length} server errors, ` +
        `${signedOut.length} refused as signed out.`,
    );
    expect(leaks).toEqual([]);
    expect(changed).toEqual([]);
    expect(crashes).toEqual([]);
    expect(signedOut).toEqual([]);
    expect(routes).toBeGreaterThan(250);
  }, 1_800_000);
});
