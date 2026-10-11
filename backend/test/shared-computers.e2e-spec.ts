import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Signing in on a shared computer, and signing out for real (B5 in
 * docs/BLIND-SPOTS.md), through the real API and the seeded accounts.
 */
const PASSWORD = 'Password123!';

describe('shared computers and signing out (e2e)', () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;

  const api = () => request(app.getHttpServer());

  const signIn = async (
    login: { email?: string; phone?: string },
    sharedDevice?: boolean,
  ) => {
    const first = await api()
      .post('/api/auth/login')
      .send({
        ...login,
        password: PASSWORD,
        ...(sharedDevice !== undefined && { sharedDevice }),
      })
      .expect(201);
    if (!first.body.requiresOtp) return first.body;
    const done = await api()
      .post('/api/auth/verify-otp')
      .send({ sessionId: first.body.sessionId, otp: first.body.devOtp })
      .expect(201);
    return done.body;
  };

  const sessionOf = (refreshToken: string) =>
    owner.userSession.findFirstOrThrow({ where: { token: refreshToken } });

  const refresh = (refreshToken: string) =>
    api().post('/api/auth/refresh').send({ refreshToken });

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
  });

  afterAll(async () => {
    await owner.$disconnect();
    await app.close();
  });

  describe('who is on a shared computer', () => {
    it('a student, always', async () => {
      const body = await signIn({ email: 'student1@markova.edu' });
      expect(body.sharedDevice).toBe(true);
      expect((await sessionOf(body.refreshToken)).shared).toBe(true);
    });

    it('a teacher, when they say so, and only then', async () => {
      const shared = await signIn({ email: 'aline.uwase@markova.edu' }, true);
      expect(shared.sharedDevice).toBe(true);
      expect((await sessionOf(shared.refreshToken)).shared).toBe(true);

      const own = await signIn({ email: 'aline.uwase@markova.edu' });
      expect(own.sharedDevice).toBe(false);
      expect((await sessionOf(own.refreshToken)).shared).toBe(false);
    });

    it('keeps being shared, and keeps its start, from refresh to refresh', async () => {
      const body = await signIn({ email: 'student1@markova.edu' });
      const first = await sessionOf(body.refreshToken);
      const next = await refresh(body.refreshToken).expect(201);
      expect(next.body.sharedDevice).toBe(true);
      const second = await sessionOf(next.body.refreshToken);
      expect(second.shared).toBe(true);
      expect(second.startedAt.getTime()).toBe(first.startedAt.getTime());
    });

    it('keeps being shared when the person changes school', async () => {
      const body = await signIn({ email: 'p.habimana@markova.edu' }, true);
      const schools = await api()
        .get('/api/auth/schools')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      const other = schools.body.find((s: any) => s.userId !== body.user.id);
      const moved = await api()
        .post('/api/auth/switch')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ userId: other.userId, refreshToken: body.refreshToken })
        .expect(201);
      expect(moved.body.sharedDevice).toBe(true);
    });
  });

  describe('a shared computer nobody is using', () => {
    it('cannot be renewed after a while without use', async () => {
      const body = await signIn({ email: 'student1@markova.edu' });
      const session = await sessionOf(body.refreshToken);
      await owner.userSession.update({
        where: { id: session.id },
        data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
      });
      const res = await refresh(body.refreshToken).expect(401);
      expect(res.body.message).toMatch(/without use/);
    });

    it('cannot be renewed past the end of the day, however busy', async () => {
      const body = await signIn({ email: 'student1@markova.edu' });
      const session = await sessionOf(body.refreshToken);
      await owner.userSession.update({
        where: { id: session.id },
        data: { startedAt: new Date(Date.now() - 13 * 60 * 60 * 1000) },
      });
      const res = await refresh(body.refreshToken).expect(401);
      expect(res.body.message).toMatch(/end of the day/);
    });

    it('leaves somebody’s own computer alone for days', async () => {
      const body = await signIn({ email: 'aline.uwase@markova.edu' });
      const session = await sessionOf(body.refreshToken);
      await owner.userSession.update({
        where: { id: session.id },
        data: {
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });
      await refresh(body.refreshToken).expect(201);
    });
  });

  describe('signing out', () => {
    /* The bug this fixes: the server was given the access token, which no
       session is kept under, so signing out ended nothing and the refresh
       token in the browser stayed good for a week. */
    it('ends this computer’s session on the server', async () => {
      const body = await signIn({ email: 'student1@markova.edu' });
      await api()
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ refreshToken: body.refreshToken })
        .expect(201);
      await refresh(body.refreshToken).expect(401);
    });

    it('leaves the person’s other devices signed in', async () => {
      const phone = await signIn({ email: 'aline.uwase@markova.edu' });
      const lab = await signIn({ email: 'aline.uwase@markova.edu' }, true);
      await api()
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${lab.accessToken}`)
        .send({ refreshToken: lab.refreshToken })
        .expect(201);
      await refresh(phone.refreshToken).expect(201);
    });

    it('ends every session, everywhere, when asked', async () => {
      const lab = await signIn({ email: 'student1@markova.edu' });
      const home = await signIn({ email: 'student1@markova.edu' });
      const res = await api()
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${home.accessToken}`)
        .send({ everywhere: true })
        .expect(201);
      expect(res.body.ended).toBeGreaterThanOrEqual(2);
      await refresh(lab.refreshToken).expect(401);
      await refresh(home.refreshToken).expect(401);
    });

    it('cannot end somebody else’s session', async () => {
      const student = await signIn({ email: 'student1@markova.edu' });
      const teacher = await signIn({ email: 'aline.uwase@markova.edu' });
      const res = await api()
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ refreshToken: student.refreshToken })
        .expect(201);
      expect(res.body.ended).toBe(0);
      await refresh(student.refreshToken).expect(201);
    });
  });
});
