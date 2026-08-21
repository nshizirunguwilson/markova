import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * This booted the whole AppModule in `beforeEach` and never closed it, so every
 * test left behind a live Redis connection, a Prisma pool, BullMQ workers and
 * the cron scheduler. Jest finished its assertions and then sat there forever
 * waiting on handles nobody was going to release, which is why the e2e step in
 * CI hung rather than failed.
 *
 * One app for the file, and it gets closed.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
