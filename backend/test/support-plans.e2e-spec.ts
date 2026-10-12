import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Support plans for students with special needs (B7 in docs/BLIND-SPOTS.md),
 * through the real API and the seeded Markova Academy. Everything made here is
 * removed afterwards.
 */
const PASSWORD = 'Password123!';

describe('support plans (e2e)', () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;
  const relaxed: { id: string; forcePasswordChange: boolean }[] = [];

  let studentId: string;
  let sectionId: string;
  let examId: string | null = null;
  let madeExam = false;
  let dos: string;
  let nurse: string;
  let principal: string;
  let theirTeacher: string;
  let otherTeacher: string;
  let parent: string;
  let librarian: string;

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

  const as = (token: string) => ({
    get: (url: string) =>
      api().get(url).set('Authorization', `Bearer ${token}`),
    put: (url: string, body: object) =>
      api().put(url).set('Authorization', `Bearer ${token}`).send(body),
  });

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
    // A student with no plan yet, a parent, and a teacher of their class.
    const student = await owner.student.findFirstOrThrow({
      where: {
        schoolId: school.id,
        status: 'ACTIVE',
        supportPlan: null,
        parentStudents: { some: { parent: { isActive: true } } },
        classSection: { teacherSubjectClasses: { some: {} } },
      },
      select: {
        id: true,
        classSectionId: true,
        parentStudents: {
          take: 1,
          select: { parent: { select: { account: true } } },
        },
      },
    });
    studentId = student.id;
    sectionId = student.classSectionId;
    const theirs = await owner.teacherSubjectClass.findFirstOrThrow({
      where: { classSectionId: sectionId },
      select: {
        teacher: {
          select: { id: true, user: { select: { account: true } } },
        },
      },
    });
    const other = await owner.teacher.findFirstOrThrow({
      where: {
        schoolId: school.id,
        teacherSubjectClasses: { none: { classSectionId: sectionId } },
        roles: { none: { classSectionId: sectionId } },
        user: { isActive: true, account: { email: { not: null } } },
      },
      select: { user: { select: { account: true } } },
    });

    const exam = await owner.examSchedule.findFirst({
      where: { classSectionId: sectionId },
      select: { id: true },
    });
    if (exam) {
      examId = exam.id;
    } else {
      const subject = await owner.teacherSubjectClass.findFirstOrThrow({
        where: { classSectionId: sectionId },
        select: { subjectId: true },
      });
      const term = await owner.term.findFirstOrThrow({
        where: { schoolId: school.id, isCurrent: true },
      });
      examId = (
        await owner.examSchedule.create({
          data: {
            schoolId: school.id,
            classSectionId: sectionId,
            subjectId: subject.subjectId,
            termId: term.id,
            examDate: new Date(),
            startTime: '08:00',
            endTime: '10:00',
          },
        })
      ).id;
      madeExam = true;
    }

    dos = await signIn({ email: 'headteacher@markova.edu' });
    nurse = await signIn({ email: 'nurse@markova.edu' });
    principal = await signIn({ email: 'wilsonshizirungu@gmail.com' });
    librarian = await signIn({ email: 'librarian@markova.edu' });
    theirTeacher = await signIn({
      email: theirs.teacher.user.account.email!,
    });
    otherTeacher = await signIn({ email: other.user.account.email! });
    const p = student.parentStudents[0].parent.account;
    parent = await signIn(p.email ? { email: p.email } : { phone: p.phone! });
  });

  afterAll(async () => {
    await owner.supportPlan.deleteMany({ where: { studentId } });
    await owner.auditLog.deleteMany({
      where: { entityType: 'support-plan', entityId: studentId },
    });
    if (madeExam && examId) {
      await owner.examSchedule.delete({ where: { id: examId } });
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

  const url = () => `/api/students/${studentId}/support-plan`;
  const plan = {
    needs: ['SEEING'],
    needNote: 'Low vision in both eyes',
    arrangements: ['EXTRA_TIME', 'LARGE_PRINT'],
    extraTimePercent: 25,
    agreedWith: 'The family',
  };

  it('lets the Director of Studies make a plan', async () => {
    const res = await as(dos).put(url(), plan).expect(200);
    expect(res.body.plan.arrangements).toEqual([
      '25% extra time',
      'Large print',
    ]);
  });

  it('lets the nurse change it too', async () => {
    await as(nurse)
      .put(url(), { ...plan, extraTimePercent: 50 })
      .expect(200);
    await as(dos).put(url(), plan).expect(200);
  });

  it('refuses a plan with extra time but no amount', async () => {
    await as(dos)
      .put(url(), { ...plan, extraTimePercent: undefined })
      .expect(400);
  });

  it('gives the principal the whole plan to read, and writes the opening down', async () => {
    const before = await owner.auditLog.count({
      where: { entityType: 'support-plan', entityId: studentId },
    });
    const res = await as(principal).get(url()).expect(200);
    expect(res.body.plan.needNote).toBe('Low vision in both eyes');
    expect(res.body.mayChange).toBe(false);
    expect(
      await owner.auditLog.count({
        where: { entityType: 'support-plan', entityId: studentId },
      }),
    ).toBe(before + 1);
    await as(principal).put(url(), plan).expect(403);
  });

  it('tells a teacher of the class what to do, never why', async () => {
    const res = await as(theirTeacher).get(url()).expect(200);
    expect(res.body).toMatchObject({
      teacherView: true,
      plan: { arrangements: ['25% extra time', 'Large print'] },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/vision|SEEING|Seeing/);
  });

  it('tells a teacher of another class nothing', async () => {
    await as(otherTeacher).get(url()).expect(403);
    await as(otherTeacher)
      .get(`/api/support/class/${sectionId}`)
      .expect(403);
  });

  it('shows the family their child’s plan, to read', async () => {
    const res = await as(parent).get(url()).expect(200);
    expect(res.body.plan.needWords).toEqual(['Seeing']);
    await as(parent).put(url(), plan).expect(403);
  });

  it('refuses everybody else at the school', async () => {
    await as(librarian).get(url()).expect(403);
  });

  it('gives the class list its arrangements, without the need', async () => {
    const res = await as(theirTeacher)
      .get(`/api/support/class/${sectionId}`)
      .expect(200);
    const row = res.body.find((r: any) => r.studentId === studentId);
    expect(row.arrangements).toEqual(['25% extra time', 'Large print']);
    expect(row).not.toHaveProperty('needs');
  });

  it('prints an exam sheet with the extra minutes worked out', async () => {
    const res = await as(dos)
      .get(`/api/support/exams/${examId}/sheet`)
      .expect(200);
    const row = res.body.students.find((r: any) => r.studentId === studentId);
    expect(row.extraMinutes).toBeGreaterThan(0);
    expect(res.body.exam).toHaveProperty('subject');
  });

  it('lists the plan for the national exam registration', async () => {
    const res = await as(dos).get('/api/support/register').expect(200);
    expect(res.body.map((r: any) => r.studentId)).toContain(studentId);
    await as(theirTeacher).get('/api/support/register').expect(403);
  });

  it('lets the Director of Studies remove it', async () => {
    await api()
      .delete(url())
      .set('Authorization', `Bearer ${dos}`)
      .expect(200);
    const res = await as(dos).get(url()).expect(200);
    expect(res.body.plan).toBeNull();
  });
});
