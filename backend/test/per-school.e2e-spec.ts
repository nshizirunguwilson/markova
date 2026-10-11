import { existsSync, rmSync } from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/password';
import { diskPathFor } from '../src/common/uploads';

/**
 * Everything outside the database keeps schools apart too.
 *
 * Step 3, part 4 of docs/MULTI-SCHOOL-DESIGN.md. Through the real API, with
 * the seeded Markova Academy and the seeded second school, G.S. Umucyo, each
 * with an admin of its own:
 *
 *   - a card scanned at a gate is checked inside the school that issued it,
 *     and says which school that is;
 *   - each school's analytics are its own, even straight after the other
 *     school asked the same question (they used to share a cache);
 *   - an upload is stored in the uploader's school's folder.
 */
const PASSWORD = 'Password123!';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('each school keeps its own (e2e)', () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;
  const tag = `ps${Date.now()}`;
  let umucyo: string;
  let umucyoAdmin: string;
  let umucyoAdminLogin: string;
  let kezaCard: string;
  let kezaStudent: string;

  const api = () => request(app.getHttpServer());

  const signIn = async (login: { email?: string; phone?: string }) => {
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

    owner = new PrismaClient({
      datasourceUrl:
        process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
    });
    await owner.$connect();

    const school = await owner.school.findFirst({
      where: { slug: 'gs-umucyo' },
    });
    if (!school) {
      throw new Error('Needs the seeded second school: npx prisma db seed');
    }
    umucyo = school.id;

    umucyoAdminLogin = `admin.${tag}@markova.edu`;
    const account = await owner.account.create({
      data: {
        email: umucyoAdminLogin,
        passwordHash: await hashPassword(PASSWORD),
        forcePasswordChange: false,
      },
    });
    umucyoAdmin = (
      await owner.user.create({
        data: {
          schoolId: umucyo,
          accountId: account.id,
          role: 'ADMIN',
          email: umucyoAdminLogin,
          firstName: 'Claudine',
          lastName: 'Mukeshimana',
        },
      })
    ).id;

    const keza = await owner.student.findFirstOrThrow({
      where: { schoolId: umucyo },
    });
    kezaStudent = keza.id;
    kezaCard = `UMU-${tag.slice(-4)}-TEST`;
    await owner.student.update({
      where: { id: keza.id },
      data: { cardCode: kezaCard, cardIssuedAt: new Date() },
    });
  });

  afterAll(async () => {
    await owner.student.update({
      where: { id: kezaStudent },
      data: { cardCode: null, cardIssuedAt: null },
    });
    await owner.auditLog.updateMany({
      where: { userId: umucyoAdmin },
      data: { userId: null },
    });
    const admin = await owner.user.findUniqueOrThrow({
      where: { id: umucyoAdmin },
    });
    if (admin.photoUrl) rmSync(diskPathFor(admin.photoUrl), { force: true });
    await owner.userSession.deleteMany({
      where: { accountId: admin.accountId },
    });
    await owner.user.delete({ where: { id: umucyoAdmin } });
    await owner.account.delete({ where: { id: admin.accountId } });
    await owner.$disconnect();
    await app.close();
  });

  it('checks a card inside the school that issued it, and names it', async () => {
    const res = await api().get(`/api/verify/card/${kezaCard}`).expect(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.issuedBy).toBe('G.S. Umucyo');
    expect(res.body.student.name).toBe('Keza Habimana');
  });

  it('names no school for a card nobody issued', async () => {
    const res = await api().get('/api/verify/card/NONE-SUCH-CODE').expect(200);
    expect(res.body.valid).toBe(false);
    expect(res.body).not.toHaveProperty('issuedBy');
  });

  /*
    The library figures were cached under one key for every school, so the
    second school to ask got the first school's answer for a minute.
  */
  it('answers each school with its own analytics, one straight after the other', async () => {
    const academyAdmin = await signIn({ email: 'wilsonshizirungu@gmail.com' });
    const umucyoAdminToken = await signIn({ email: umucyoAdminLogin });

    const academy = await api()
      .get('/api/analytics/admin/library')
      .set('Authorization', `Bearer ${academyAdmin}`)
      .expect(200);
    const second = await api()
      .get('/api/analytics/admin/library')
      .set('Authorization', `Bearer ${umucyoAdminToken}`)
      .expect(200);

    const [books] = await owner.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM books WHERE school_id = ${umucyo}`;
    expect(JSON.stringify(second.body)).not.toEqual(
      JSON.stringify(academy.body),
    );
    expect(Number(books.n)).toBe(0);
  });

  it("stores an upload in the uploader's school's folder", async () => {
    const token = await signIn({ email: umucyoAdminLogin });
    const res = await api()
      .post(`/api/users/${umucyoAdmin}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', PNG, { filename: 'me.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.photoUrl).toMatch(
      new RegExp(`^/uploads/schools/${umucyo}/photos/`),
    );
    expect(existsSync(diskPathFor(res.body.photoUrl))).toBe(true);
  });

  it('cannot reach a person in the other school, however it asks', async () => {
    const academyAdmin = await signIn({ email: 'wilsonshizirungu@gmail.com' });
    await api()
      .get(`/api/users/${umucyoAdmin}`)
      .set('Authorization', `Bearer ${academyAdmin}`)
      .expect(404);
    await api()
      .post(`/api/users/${umucyoAdmin}/reset-login`)
      .set('Authorization', `Bearer ${academyAdmin}`)
      .send({})
      .expect(404);
  });
});
