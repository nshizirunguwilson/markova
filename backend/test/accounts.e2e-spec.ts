import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { hashPassword, verifyPassword } from '../src/common/password';
import { PrismaService } from '../src/prisma/prisma.service';
import { withSchool } from '../src/prisma/request-context';

/**
 * One login, many schools, through the real API and the real database.
 *
 * Step 3, part 3 of docs/MULTI-SCHOOL-DESIGN.md. Jean teaches at the seeded
 * school (Markova Academy) and is a parent at a second school made here,
 * Lycee. He signs in once, sees both, switches between them, and is held to
 * whichever one he is in. A stranger who belongs only to Lycee is invisible
 * from Markova Academy, down to their login.
 *
 * The owner connection builds the people and the second school and removes
 * them afterwards. Everything judged goes through the API.
 */
const PASSWORD = 'Password123!';

describe('one login, many schools (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: PrismaClient;
  const tag = `acct${Date.now()}`;

  let academy: string;
  let lycee: string;
  let jean: string;
  let jeanAtAcademy: string;
  let jeanAtLycee: string;
  let stranger: string;
  let strangerAtLycee: string;
  const jeanEmail = `jean.${tag}@markova.edu`;
  const strangerPhone = `+25078${String(Date.now()).slice(-7)}`;

  const api = () => request(app.getHttpServer());

  /** Through the two steps, with the code the API returns outside production. */
  const signIn = async (login: { email?: string; phone?: string }) => {
    const first = await api()
      .post('/api/auth/login')
      .send({ ...login, password: PASSWORD })
      .expect(201);
    if (!first.body.requiresOtp) return first.body;
    const done = await api()
      .post('/api/auth/verify-otp')
      .send({ sessionId: first.body.sessionId, otp: first.body.devOtp })
      .expect(201);
    return done.body;
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
    await app.init();
    prisma = app.get(PrismaService);

    owner = new PrismaClient({
      datasourceUrl:
        process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    await owner.$connect();

    academy = (
      await owner.school.findFirstOrThrow({
        where: { slug: 'markova-academy' },
      })
    ).id;
    lycee = (
      await owner.school.create({
        data: { name: `Lycee ${tag}`, slug: `lycee-${tag}` },
      })
    ).id;

    const passwordHash = await hashPassword(PASSWORD);
    jean = (
      await owner.account.create({
        data: { email: jeanEmail, passwordHash, forcePasswordChange: false },
      })
    ).id;
    const record = (
      schoolId: string,
      accountId: string,
      role: 'TEACHER' | 'PARENT',
    ) =>
      owner.user.create({
        data: {
          schoolId,
          accountId,
          role,
          email: jeanEmail,
          firstName: 'Jean',
          lastName: 'Habimana',
        },
      });
    jeanAtAcademy = (await record(academy, jean, 'TEACHER')).id;
    jeanAtLycee = (await record(lycee, jean, 'PARENT')).id;

    stranger = (
      await owner.account.create({
        data: {
          phone: strangerPhone,
          passwordHash,
          forcePasswordChange: false,
        },
      })
    ).id;
    strangerAtLycee = (
      await owner.user.create({
        data: {
          schoolId: lycee,
          accountId: stranger,
          role: 'PARENT',
          phone: strangerPhone,
          firstName: 'Ange',
          lastName: 'Mukamana',
        },
      })
    ).id;
  });

  afterAll(async () => {
    const people = await owner.user.findMany({
      where: { accountId: { in: [jean, stranger] } },
      select: { id: true },
    });
    const ids = people.map((p) => p.id);
    await owner.parentStudent.deleteMany({
      where: { parentUserId: { in: ids } },
    });
    await owner.notification.deleteMany({ where: { userId: { in: ids } } });
    await owner.userSession.deleteMany({
      where: { accountId: { in: [jean, stranger] } },
    });
    await owner.user.deleteMany({ where: { id: { in: ids } } });
    await owner.account.deleteMany({ where: { id: { in: [jean, stranger] } } });
    await owner.school.delete({ where: { id: lycee } });
    await owner.$disconnect();
    await app.close();
  });

  describe('signing in', () => {
    it('signs in once and lists both schools', async () => {
      const body = await signIn({ email: jeanEmail });
      expect(body.accessToken).toBeTruthy();
      const names = body.schools.map(
        (s: { school: { name: string }; role: string }) =>
          `${s.school.name}, ${s.role}`,
      );
      expect(names).toEqual(
        expect.arrayContaining([
          `Markova Academy, TEACHER`,
          `Lycee ${tag}, PARENT`,
        ]),
      );
      expect(names).toHaveLength(2);
    });

    it('asks which school the first time', async () => {
      await owner.account.update({
        where: { id: jean },
        data: { lastUserId: null },
      });
      const body = await signIn({ email: jeanEmail });
      expect(body.chooseSchool).toBe(true);
    });

    it('opens the school used last, after that', async () => {
      await owner.account.update({
        where: { id: jean },
        data: { lastUserId: jeanAtLycee },
      });
      const body = await signIn({ email: jeanEmail });
      expect(body.chooseSchool).toBe(false);
      expect(body.user.id).toBe(jeanAtLycee);
      expect(body.user.school.id).toBe(lycee);
    });
  });

  describe('the school list and switching', () => {
    let academyTokens: { accessToken: string; refreshToken: string };

    beforeAll(async () => {
      await owner.account.update({
        where: { id: jean },
        data: { lastUserId: jeanAtAcademy },
      });
      academyTokens = await signIn({ email: jeanEmail });
    });

    it('lists the schools, marking the one open', async () => {
      const res = await api()
        .get('/api/auth/schools')
        .set('Authorization', `Bearer ${academyTokens.accessToken}`)
        .expect(200);
      const current = res.body.filter((s: { current: boolean }) => s.current);
      expect(current).toHaveLength(1);
      expect(current[0].userId).toBe(jeanAtAcademy);
      expect(res.body[0]).toHaveProperty('unreadMessages');
    });

    it('switches without the password, into the other school', async () => {
      const res = await api()
        .post('/api/auth/switch')
        .set('Authorization', `Bearer ${academyTokens.accessToken}`)
        .send({
          userId: jeanAtLycee,
          refreshToken: academyTokens.refreshToken,
        })
        .expect(201);

      const profile = await api()
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      expect(profile.body.role).toBe('PARENT');
      expect(profile.body.school.id).toBe(lycee);

      /* The session moved: the old refresh token is spent. */
      await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: academyTokens.refreshToken })
        .expect(401);
    });

    it("refuses to switch into somebody else's record", async () => {
      const tokens = await signIn({ email: jeanEmail });
      await api()
        .post('/api/auth/switch')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ userId: strangerAtLycee, refreshToken: tokens.refreshToken })
        .expect(404);
    });

    it("cannot read the other school's record of the same person", async () => {
      await owner.account.update({
        where: { id: jean },
        data: { lastUserId: jeanAtAcademy },
      });
      const tokens = await signIn({ email: jeanEmail });
      const res = await api()
        .get(`/api/users/${jeanAtLycee}`)
        .set('Authorization', `Bearer ${tokens.accessToken}`);
      expect(res.status).not.toBe(200);
    });
  });

  describe('a suspended school', () => {
    afterEach(() =>
      owner.school.update({ where: { id: lycee }, data: { status: 'ACTIVE' } }),
    );

    it('closes for everybody in it at once, and leaves the list', async () => {
      await owner.account.update({
        where: { id: jean },
        data: { lastUserId: jeanAtLycee },
      });
      const inLycee = await signIn({ email: jeanEmail });
      await owner.school.update({
        where: { id: lycee },
        data: { status: 'SUSPENDED' },
      });

      await api()
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${inLycee.accessToken}`)
        .expect(401);

      const again = await signIn({ email: jeanEmail });
      expect(again.user.school.id).toBe(academy);
      expect(again.schools).toHaveLength(1);
    });

    it('lets nobody in whose only school it is', async () => {
      await owner.school.update({
        where: { id: lycee },
        data: { status: 'SUSPENDED' },
      });
      await api()
        .post('/api/auth/login')
        .send({ phone: strangerPhone, password: PASSWORD })
        .expect(403);
    });
  });

  /*
    The wall for logins. A school sees the login of somebody it holds a
    record for, and no other, through the application's own connection.
  */
  describe('the wall for logins', () => {
    it('hides a login from a school that has no record of the person', async () => {
      const seen = await withSchool(academy, () =>
        prisma.account.findMany({
          where: { id: { in: [jean, stranger] } },
          select: { id: true },
        }),
      );
      expect(seen.map((a) => a.id)).toEqual([jean]);
    });

    it('shows each school exactly the logins of its own people', async () => {
      for (const school of [academy, lycee]) {
        const [{ n: expected }] = await owner.$queryRaw<{ n: bigint }[]>`
          SELECT count(DISTINCT account_id) AS n FROM users
          WHERE school_id = ${school}`;
        const seen = await withSchool(school, () => prisma.account.count());
        expect(BigInt(seen)).toBe(expected);
      }
    });

    it('cannot change a login it cannot see', async () => {
      const { count } = await withSchool(academy, () =>
        prisma.account.updateMany({
          where: { id: stranger },
          data: { forcePasswordChange: true },
        }),
      );
      expect(count).toBe(0);
    });

    it('sees no login at all without a school', async () => {
      await expect(prisma.account.count()).resolves.toBe(0);
    });
  });

  describe('a school adding somebody who already uses Markova', () => {
    let admin: string;

    beforeAll(async () => {
      admin = (await signIn({ email: 'wilsonshizirungu@gmail.com' }))
        .accessToken;
    });

    it('joins them to their login, keeping their password', async () => {
      const res = await api()
        .post('/api/users')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          role: 'PARENT',
          firstName: 'Ange',
          lastName: 'Mukamana',
          phone: strangerPhone,
          password: 'Another123!',
        })
        .expect(201);

      const record = await owner.user.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(record.accountId).toBe(stranger);
      expect(record.schoolId).toBe(academy);
      const login = await owner.account.findUniqueOrThrow({
        where: { id: stranger },
      });
      /* Still their own password: the admin's never reached the login. */
      await expect(verifyPassword(PASSWORD, login.passwordHash!)).resolves.toBe(
        true,
      );
    });

    it('refuses the same person in the same role twice', async () => {
      await api()
        .post('/api/users')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          role: 'PARENT',
          firstName: 'Ange',
          lastName: 'Mukamana',
          phone: strangerPhone,
          password: 'Another123!',
        })
        .expect(409);
    });

    /* Now in two schools, so only she can change how she signs in. */
    it('may not reset the sign in of somebody in another school too', async () => {
      const here = await owner.user.findFirstOrThrow({
        where: { accountId: stranger, schoolId: academy },
      });
      await api()
        .post(`/api/users/${here.id}/reset-login`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ phone: '+250788999111' })
        .expect(403);
    });
  });

  describe('changing how you sign in', () => {
    it('changes the login after the code, and the new one works', async () => {
      const tokens = await signIn({ email: jeanEmail });
      const newEmail = `jean.new.${tag}@markova.edu`;
      const started = await api()
        .post('/api/auth/login-details')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ email: newEmail })
        .expect(201);

      await api()
        .post('/api/auth/login-details/confirm')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ sessionId: started.body.sessionId, code: started.body.devOtp })
        .expect(201);

      const body = await signIn({ email: newEmail });
      expect(body.accessToken).toBeTruthy();
      /* Both schools' contact details moved with it. */
      const records = await owner.user.findMany({ where: { accountId: jean } });
      expect(records.every((r) => r.email === newEmail)).toBe(true);
      await api()
        .post('/api/auth/login')
        .send({ email: jeanEmail, password: PASSWORD })
        .expect(401);
    });
  });
});
