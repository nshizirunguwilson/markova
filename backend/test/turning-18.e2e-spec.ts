import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { schoolDay } from '../src/common/student-standing';

/**
 * A student of 18 deciding what their parents see (A8 in
 * docs/BLIND-SPOTS.md), through the real API and the seeded Markova Academy.
 * Everything changed here is put back afterwards.
 */
const PASSWORD = 'Password123!';

describe('a student turning 18 (e2e)', () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;
  const relaxed: { id: string; forcePasswordChange: boolean }[] = [];
  const sharingBefore: {
    id: string;
    sharesResults: boolean;
    sharesConduct: boolean;
    sharesHealth: boolean;
    sharingChangedAt: Date | null;
  }[] = [];

  let adult: { id: string; userId: string; email: string };
  let parentToken: string;
  let parentId: string;
  let studentToken: string;
  let minor: { id: string; userId: string; email: string };
  let termId: string;

  const api = () => request(app.getHttpServer());

  const signIn = async (login: { email?: string; phone?: string }) => {
    const account = await owner.account.findFirstOrThrow({
      where: login.email ? { email: login.email } : { phone: login.phone },
      select: { id: true, forcePasswordChange: true },
    });
    if (account.forcePasswordChange) {
      relaxed.push(account);
      await owner.account.update({
        where: { id: account.id },
        data: { forcePasswordChange: false },
      });
    }
    const first = await api()
      .post('/api/auth/login')
      .send({ ...login, password: PASSWORD })
      .expect(201);
    if (!first.body.requiresOtp) return first.body.accessToken as string;
    const done = await api()
      .post('/api/auth/verify-otp')
      .send({ sessionId: first.body.sessionId, otp: first.body.devOtp })
      .expect(201);
    return done.body.accessToken as string;
  };

  const asParent = (url: string) =>
    api().get(url).set('Authorization', `Bearer ${parentToken}`);

  const setSharing = (body: Record<string, boolean>) =>
    api()
      .put('/api/students/me/sharing')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(body);

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
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    owner = new PrismaClient({
      datasourceUrl:
        process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    await owner.$connect();

    const school = await owner.school.findFirstOrThrow({
      where: { slug: 'markova-academy' },
    });
    termId = (
      await owner.term.findFirstOrThrow({
        where: { schoolId: school.id, isCurrent: true },
        select: { id: true },
      })
    ).id;
    const eighteenYearsAgo = new Date(schoolDay());
    eighteenYearsAgo.setUTCFullYear(eighteenYearsAgo.getUTCFullYear() - 18);
    const withParent = {
      schoolId: school.id,
      status: 'ACTIVE' as const,
      pauses: { none: {} },
      // Not the demo adult the seed keeps private (adult@markova.edu).
      user: { account: { email: { not: null, notIn: ['adult@markova.edu'] } } },
      parentStudents: { some: { parent: { isActive: true } } },
    };
    const pick = async (dateOfBirth: object) => {
      const s = await owner.student.findFirstOrThrow({
        where: { ...withParent, dateOfBirth },
        select: {
          id: true,
          userId: true,
          user: { select: { account: { select: { email: true } } } },
          parentStudents: {
            select: { parent: { select: { id: true, account: true } } },
          },
        },
      });
      return s;
    };
    const a = await pick({ lte: eighteenYearsAgo });
    adult = { id: a.id, userId: a.userId, email: a.user.account.email! };
    const m = await pick({ gt: eighteenYearsAgo });
    minor = { id: m.id, userId: m.userId, email: m.user.account.email! };

    for (const id of [adult.id, minor.id]) {
      sharingBefore.push(
        await owner.student.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            sharesResults: true,
            sharesConduct: true,
            sharesHealth: true,
            sharingChangedAt: true,
          },
        }),
      );
    }

    const parent = a.parentStudents[0].parent;
    parentId = parent.id;
    parentToken = await signIn(
      parent.account.email
        ? { email: parent.account.email }
        : { phone: parent.account.phone! },
    );
    studentToken = await signIn({ email: adult.email });
  });

  afterAll(async () => {
    // Exactly as they were before.
    for (const before of sharingBefore) {
      const { id, ...data } = before;
      await owner.student.update({ where: { id }, data });
    }
    for (const a of relaxed) {
      await owner.account.update({
        where: { id: a.id },
        data: { forcePasswordChange: a.forcePasswordChange },
      });
    }
    await owner.$disconnect();
    await app.close();
  });

  it('shows an adult their switches, all on', async () => {
    const res = await api()
      .get('/api/students/me/sharing')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(res.body).toMatchObject({
      adult: true,
      results: true,
      conduct: true,
      health: true,
    });
  });

  it('shows the parent everything while nothing is turned off', async () => {
    await asParent(
      `/api/marks/term-results/student/${adult.id}?termId=${termId}`,
    ).expect(200);
    await asParent(
      `/api/attendance/student-summary?studentId=${adult.id}`,
    ).expect(200);
    await asParent(`/api/clinic/student/${adult.id}/visits`).expect(200);
  });

  describe('with results, attendance and health private', () => {
    beforeAll(async () => {
      await setSharing({
        results: false,
        conduct: false,
        health: false,
      }).expect(200);
    });

    it.each([
      ['marks', (id: string) => `/api/marks/term-results/student/${id}`],
      // No term on purpose: a family kept out hears that before anything else.
      ['the report card', (id: string) => `/api/marks/report-card/${id}`],
      ['homework', (id: string) => `/api/homework/student/${id}`],
      [
        'attendance',
        (id: string) => `/api/attendance/student-summary?studentId=${id}`,
      ],
      ['discipline', (id: string) => `/api/discipline/student/${id}`],
      ['the conduct score', (id: string) => `/api/discipline/standing/${id}`],
      ['health visits', (id: string) => `/api/clinic/student/${id}/visits`],
      ['medicines', (id: string) => `/api/clinic/student/${id}/medication`],
    ])('keeps %s from the parent, calmly', async (_what, url) => {
      const res = await asParent(url(adult.id)).expect(403);
      expect(res.body.reason).toBe('KEPT_PRIVATE');
      expect(res.body.message).toMatch(/has chosen to keep their .* private\./);
    });

    it('still shows the parent the fees', async () => {
      await asParent(`/api/finance/history/${adult.id}`).expect(200);
    });

    it("leaves the health notes out of the parent's own record", async () => {
      const res = await asParent(`/api/users/${parentId}`).expect(200);
      const child = res.body.parentStudents.find(
        (l: any) => l.student.id === adult.id,
      ).student;
      expect(child).toMatchObject({
        allergies: null,
        medicalConditions: null,
        healthKeptPrivate: true,
        disciplinePoints: null,
      });
    });

    it('sends the family no absence text', async () => {
      const before = await owner.notification.count({
        where: { userId: parentId },
      });
      const hd = await signIn({ email: 'headteacher@markova.edu' });
      const student = await owner.student.findUniqueOrThrow({
        where: { id: adult.id },
        select: { classSectionId: true },
      });
      const day = schoolDay().toISOString().slice(0, 10);
      await api()
        .post('/api/attendance/bulk')
        .set('Authorization', `Bearer ${hd}`)
        .send({
          classSectionId: student.classSectionId,
          date: day,
          type: 'daily',
          records: [{ studentId: adult.id, status: 'ABSENT' }],
        })
        .expect(201);
      expect(
        await owner.notification.count({ where: { userId: parentId } }),
      ).toBe(before);
      await owner.attendance.deleteMany({
        where: { studentId: adult.id, date: new Date(day) },
      });
    });

    it('gives the parent marks, but not attendance, when only that is private', async () => {
      await setSharing({ results: true }).expect(200);
      const res = await asParent(
        `/api/analytics/student/${adult.id}/profile`,
      ).expect(200);
      expect(res.body.attendanceKeptPrivate).toBe(true);
      expect(res.body.student.disciplinePoints).toBeNull();
    });
  });

  it('lets a student under 18 change nothing', async () => {
    const token = await signIn({ email: minor.email });
    const res = await api()
      .put('/api/students/me/sharing')
      .set('Authorization', `Bearer ${token}`)
      .send({ results: false })
      .expect(400);
    expect(res.body.message).toMatch(/From your 18th birthday/);
  });

  it('keeps the switches to the student: a parent cannot change them', async () => {
    await api()
      .put('/api/students/me/sharing')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ results: true })
      .expect(403);
  });
});
