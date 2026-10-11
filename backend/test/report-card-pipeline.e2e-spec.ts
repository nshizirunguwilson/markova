import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { withPlatform, withSchool } from '../src/prisma/request-context';

/**
 * The report card pipeline, walked by the people who actually walk it.
 *
 * Every unit test here mocks the actor. This one signs three real people in
 * and has each do their own part in order, because the bugs this pipeline has
 * produced were never inside one service: they were at the seams. The marks
 * page and the report cards page disagreed about who was holding a class up;
 * the DOS was sent to a confirm button the API refuses; the principal was
 * handed a page whose every request came back 403.
 *
 * None of those were visible from inside a single module, and all of them were
 * obvious the moment somebody walked the whole thing.
 *
 * Needs the demo seed. Run `npx prisma db seed` first.
 */
const SEED_PASSWORD = 'Password123!';

let academy: string;
const inAcademy = <T>(fn: () => T | PromiseLike<T>) => withSchool(academy, fn);

describe('The report card pipeline, end to end', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let dosToken: string;
  let teacherToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      /* The rate limits are real and correct, and they are not what this is
         testing: several sign-ins in a row would trip the login cap. */
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
    await app.init();
    prisma = app.get(PrismaService);
    /* Every record this test reads is Markova Academy's: the demo has other
       schools now, each with a current term and people of its own. */
    academy = (
      await withPlatform(() =>
        prisma.school.findFirstOrThrow({ where: { slug: 'markova-academy' } }),
      )
    ).id;

    dosToken = await signIn('headteacher@markova.edu');
    adminToken = await signIn('wilsonshizirungu@gmail.com');

    const classTeacher = await inAcademy(() =>
      prisma.user.findFirst({
        where: { role: 'TEACHER', isActive: true, email: { not: null } },
        orderBy: { email: 'asc' },
      }),
    );
    if (!classTeacher) {
      throw new Error('This needs seeded data. Run `npx prisma db seed`.');
    }
    teacherToken = await signIn(classTeacher.email!);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  /** Signs somebody in, through the OTP step when their role has one. */
  async function signIn(email: string): Promise<string> {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: SEED_PASSWORD });

    if (login.body.accessToken) return login.body.accessToken;

    /* Staff get an OTP. Outside production the code comes back in the
       response, which is the only reason this is runnable without a phone. */
    const verified = await request(app.getHttpServer())
      .post('/api/auth/verify-otp')
      .send({ sessionId: login.body.sessionId, otp: login.body.devOtp });

    return verified.body.accessToken;
  }

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('who may reach what', () => {
    /*
      The division this system turns on: the principal runs the institution and
      the DOS runs academic delivery. It has been got wrong in both directions,
      and each time the symptom was a page that loaded and then refused every
      request on it.
    */
    it('refuses the principal the mark book', async () => {
      await request(app.getHttpServer())
        .get('/api/marks/head-teacher/overview')
        .set(as(adminToken))
        .expect(403);
    });

    it('gives the DOS their own overview', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/marks/head-teacher/overview')
        .set(as(dosToken))
        .expect(200);
      expect(Array.isArray(res.body.classes)).toBe(true);
    });

    /* The letters are the principal's and the report cards are the DOS's, on
       one shared page. Both must reach it. */
    it('lets the principal generate a transfer letter', async () => {
      const student = await inAcademy(() =>
        prisma.student.findFirst({
          where: { status: 'ACTIVE' },
          select: { id: true },
        }),
      );

      await request(app.getHttpServer())
        .post('/api/reports/document')
        .set(as(adminToken))
        .send({ studentId: student!.id, type: 'transfer_letter' })
        .expect(201);
    });

    it('refuses the DOS that same document route', async () => {
      const student = await inAcademy(() =>
        prisma.student.findFirst({
          where: { status: 'ACTIVE' },
          select: { id: true },
        }),
      );

      await request(app.getHttpServer())
        .post('/api/reports/document')
        .set(as(dosToken))
        .send({ studentId: student!.id, type: 'transfer_letter' })
        .expect(403);
    });
  });

  describe('the gates, in the order they run', () => {
    /**
     * The bug this exists to catch.
     *
     * The DOS cannot confirm a class until every card carries a class
     * teacher's comment, and they cannot write those comments themselves: the
     * API refuses a class teacher's comment from anybody whose role is not
     * TEACHER. A screen that offered them the confirm button anyway sent them
     * to a request that could only be refused.
     */
    it('refuses to confirm a class whose comments are not written', async () => {
      const unwritten = await inAcademy(() =>
        prisma.termResult.findFirst({
          where: {
            isPublished: true,
            OR: [{ teacherComment: null }, { teacherComment: '' }],
          },
          select: { classSectionId: true, termId: true },
        }),
      );

      if (!unwritten) return; // Every class is written on; nothing to assert.

      const res = await request(app.getHttpServer())
        .post('/api/marks/report-cards/confirm')
        .set(as(dosToken))
        .send({
          classSectionId: unwritten.classSectionId,
          termId: unwritten.termId,
          isConfirmed: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/class teacher/i);
    });

    it('refuses to issue a class the DOS has not confirmed', async () => {
      const unconfirmed = await inAcademy(() =>
        prisma.termResult.findFirst({
          where: { isPublished: true, dosConfirmed: false },
          select: { classSectionId: true, termId: true },
        }),
      );

      if (!unconfirmed) return;

      const res = await request(app.getHttpServer())
        .post('/api/marks/report-cards/publish')
        .set(as(dosToken))
        .send({
          classSectionId: unconfirmed.classSectionId,
          termId: unconfirmed.termId,
          isPublished: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/confirm/i);
    });

    /* A teacher writes on their own class and nobody else's, and the head
       teacher's box is not theirs at all. Two people sign a card, and a
       signature has one author. */
    it("refuses a teacher the head teacher's comment box", async () => {
      const result = await inAcademy(() =>
        prisma.termResult.findFirst({
          select: { id: true },
        }),
      );

      const res = await request(app.getHttpServer())
        .put(`/api/marks/term-results/${result!.id}/comment`)
        .set(as(teacherToken))
        .send({ headmasterComment: 'Not mine to write.' });

      expect(res.status).toBe(403);
    });
  });

  /**
   * A family sees what has been released, not what exists.
   *
   * The gate is on the route rather than on the page, so the same document
   * cannot be fetched from somewhere else once one screen refuses it.
   */
  describe('what a family can reach', () => {
    it('refuses a student the report card of another family', async () => {
      const student = await inAcademy(() =>
        prisma.user.findFirst({
          where: { role: 'STUDENT', isActive: true, email: { not: null } },
          orderBy: { email: 'asc' },
        }),
      );
      const somebodyElse = await inAcademy(() =>
        prisma.student.findFirst({
          where: { userId: { not: student!.id }, status: 'ACTIVE' },
          select: { id: true },
        }),
      );

      const studentToken = await signIn(student!.email!);
      const term = await inAcademy(() =>
        prisma.term.findFirst({ where: { isCurrent: true } }),
      );

      const res = await request(app.getHttpServer())
        .get(`/api/reports/term/${somebodyElse!.id}/pdf?termId=${term!.id}`)
        .set(as(studentToken));

      expect([403, 404]).toContain(res.status);
    }, 30_000);
  });
});
