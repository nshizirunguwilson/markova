import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Bringing people in from a spreadsheet, through the app's own pipe.
 *
 * The pipe converts a body by its declared types, and it turned every row of
 * a file into an empty array: the import refused each spreadsheet before it
 * read a single row, and nothing noticed because no test sent one.
 */
describe('bulk import (e2e)', () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;
  let admin: string;
  const tag = `Imp${Date.now() % 1_000_000}`;
  const api = () => request(app.getHttpServer());

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

    const first = await api()
      .post('/api/auth/login')
      .send({ email: 'wilsonshizirungu@gmail.com', password: 'Password123!' })
      .expect(201);
    admin = first.body.requiresOtp
      ? (
          await api()
            .post('/api/auth/verify-otp')
            .send({ sessionId: first.body.sessionId, otp: first.body.devOtp })
            .expect(201)
        ).body.accessToken
      : first.body.accessToken;
  });

  afterAll(async () => {
    const made = await owner.user.findMany({
      where: { lastName: tag },
      select: { id: true, accountId: true },
    });
    await owner.teacher.deleteMany({
      where: { userId: { in: made.map((u) => u.id) } },
    });
    await owner.user.deleteMany({ where: { lastName: tag } });
    await owner.account.deleteMany({
      where: { id: { in: made.map((u) => u.accountId).filter(Boolean) } },
    });
    await owner.$disconnect();
    await app.close();
  });

  const send = (rows: object[]) =>
    api()
      .post('/api/users/bulk-import')
      .set('Authorization', `Bearer ${admin}`)
      .send({ role: 'TEACHER', rows });

  const olivier = {
    firstName: 'Olivier',
    lastName: tag,
    email: `o.${tag.toLowerCase()}@markova.edu`,
  };
  const diane = {
    firstName: 'Diane',
    lastName: tag,
    email: `d.${tag.toLowerCase()}@markova.edu`,
  };

  it('names the row without a name, and saves nothing from that file', async () => {
    const res = await send([olivier, { firstName: 'Nobody' }]).expect(400);
    expect(res.body.message).toBe('Row 2: a last name is needed');
    expect(await owner.user.count({ where: { lastName: tag } })).toBe(0);
  });

  it('brings in every row of a good file, each with a password of its own', async () => {
    const res = await send([olivier, diane]).expect(201);
    expect(res.body.created).toBe(2);
    expect(res.body.errors).toEqual([]);
    expect(res.body.credentials).toHaveLength(2);
    expect(res.body.credentials[0].password).not.toBe(
      res.body.credentials[1].password,
    );
    expect(
      await owner.user.count({ where: { lastName: tag, role: 'TEACHER' } }),
    ).toBe(2);
  });

  it('refuses the same people again by name', async () => {
    const res = await send([olivier]).expect(409);
    expect(res.body.message).toBe(
      `Row 1: Olivier ${tag} is already a teacher here`,
    );
  });

  it('hands each role its own sheet, and refuses a role that does not exist', async () => {
    const get = (role: string) =>
      api()
        .get(`/api/users/import-template/${role}`)
        .set('Authorization', `Bearer ${admin}`);
    const nurse = await get('NURSE').expect(200);
    expect(nurse.text).toBe('email,phone,firstName,lastName,nationalId');
    await get('WIZARD').expect(400);
  });
});
