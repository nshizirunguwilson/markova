import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * No child alone in a chat with an adult (docs/BLIND-SPOTS.md, B4).
 *
 * Through the real API and the seeded schools. Markova Academy has named its
 * patron and matron safeguarding leads; G.S. Umucyo has named nobody, so its
 * principal watches instead.
 */
const PASSWORD = 'Password123!';

describe('no child alone in a chat (e2e)', () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;
  const made: string[] = [];

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

  /** The seeded person signing in with this email, in this school. */
  const person = async (email: string, slug: string) =>
    owner.user.findFirstOrThrow({
      where: { account: { email }, school: { slug } },
      select: { id: true },
    });

  const startChat = async (token: string, withUserId: string, status = 201) => {
    const res = await api()
      .post('/api/messaging/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'ONE_ON_ONE', participantUserIds: [withUserId] })
      .expect(status);
    if (res.body?.id) made.push(res.body.id);
    return res;
  };

  const watchersIn = async (conversationId: string) =>
    (
      await owner.conversationParticipant.findMany({
        where: { conversationId, watching: true },
        select: { userId: true },
      })
    )
      .map((p) => p.userId)
      .sort();

  let teacher: string;
  let student: string;
  let patron: string;
  let matron: string;
  let teacherId: string;
  let studentId: string;
  let parentToken: string;
  let studentLogin: { id: string; forcePasswordChange: boolean };

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

    const academy = 'markova-academy';
    teacherId = (await person('aline.uwase@markova.edu', academy)).id;
    /* student2, not student1: the seed already has student1 asking Aline
       something, and that chat would be found rather than made. student2
       signs in without being made to change their password first, for as
       long as this runs. */
    studentId = (await person('student2@markova.edu', academy)).id;
    studentLogin = await owner.account.findFirstOrThrow({
      where: { email: 'student2@markova.edu' },
      select: { id: true, forcePasswordChange: true },
    });
    await owner.account.update({
      where: { id: studentLogin.id },
      data: { forcePasswordChange: false },
    });
    patron = (await person('patron@markova.edu', academy)).id;
    matron = (await person('matron@markova.edu', academy)).id;
    if (!patron || !matron) {
      throw new Error('Needs the seeded leads: npx prisma db seed');
    }
    teacher = await signIn({ email: 'aline.uwase@markova.edu' });
    student = await signIn({ email: 'student2@markova.edu' });
    parentToken = await signIn({ phone: '+250788100000' });
  });

  afterAll(async () => {
    await owner.conversation.deleteMany({ where: { id: { in: made } } });
    await owner.account.update({
      where: { id: studentLogin.id },
      data: { forcePasswordChange: studentLogin.forcePasswordChange },
    });
    await owner.$disconnect();
    await app.close();
  });

  it('brings both leads into a teacher’s new chat with a student', async () => {
    const res = await startChat(teacher, studentId);
    expect(await watchersIn(res.body.id)).toEqual([patron, matron].sort());
  });

  it('shows the student who is watching', async () => {
    const res = await api()
      .get('/api/messaging/conversations')
      .set('Authorization', `Bearer ${student}`)
      .expect(200);
    const chat = res.body.find((c: any) => c.id === made[0]);
    const watching = chat.participants
      .filter((p: any) => p.watching)
      .map((p: any) => p.user.firstName)
      .sort();
    expect(watching).toEqual(['Beatrice', 'Emmanuel']);
  });

  it('finds the same chat again when the student starts one with the teacher', async () => {
    const res = await startChat(student, teacherId);
    expect(res.body.id).toBe(made[0]);
  });

  it('keeps the watchers out of the badge, and in the thread', async () => {
    await api()
      .post('/api/messaging/messages')
      .set('Authorization', `Bearer ${teacher}`)
      .send({ conversationId: made[0], content: 'Bring your book tomorrow' })
      .expect(201);

    const matronToken = await signIn({ email: 'matron@markova.edu' });
    const thread = await api()
      .get(`/api/messaging/conversations/${made[0]}/messages`)
      .set('Authorization', `Bearer ${matronToken}`)
      .expect(200);
    expect(thread.body.map((m: any) => m.content)).toContain(
      'Bring your book tomorrow',
    );

    const before = await owner.message.count({
      where: {
        conversationId: made[0],
        senderUserId: { not: matron },
        reads: { none: { userId: matron } },
      },
    });
    expect(before).toBeGreaterThan(0);
    const badge = await api()
      .get('/api/messaging/unread')
      .set('Authorization', `Bearer ${matronToken}`)
      .expect(200);
    const inOwnChats = await owner.message.count({
      where: {
        conversation: {
          participants: { some: { userId: matron, watching: false } },
        },
        senderUserId: { not: matron },
        reads: { none: { userId: matron } },
      },
    });
    expect(badge.body.unreadCount).toBe(inOwnChats);
  });

  it('will not let a watcher walk out of it', async () => {
    const matronToken = await signIn({ email: 'matron@markova.edu' });
    await api()
      .delete(`/api/messaging/conversations/${made[0]}/participants/${patron}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(400);
    // One of two may leave; the last one may not.
    await api()
      .delete(`/api/messaging/conversations/${made[0]}/participants/${matron}`)
      .set('Authorization', `Bearer ${matronToken}`)
      .expect(200);
    const patronToken = await signIn({ email: 'patron@markova.edu' });
    const last = await api()
      .delete(`/api/messaging/conversations/${made[0]}/participants/${patron}`)
      .set('Authorization', `Bearer ${patronToken}`)
      .expect(400);
    expect(last.body.message).toMatch(/watching over it stays/);
    expect(await watchersIn(made[0])).toEqual([patron]);
  });

  it('refuses a parent opening a chat with somebody else’s child', async () => {
    await startChat(parentToken, studentId, 403);
  });

  it('brings a watcher into an older chat that has none, before anything more is said', async () => {
    const schoolId = (
      await owner.school.findFirstOrThrow({
        where: { slug: 'markova-academy' },
      })
    ).id;
    const old = await owner.conversation.create({
      data: {
        schoolId,
        type: 'GROUP',
        name: 'Science fair',
        createdByUserId: teacherId,
        participants: {
          create: [
            { schoolId, userId: teacherId, isAdmin: true },
            { schoolId, userId: studentId },
          ],
        },
      },
    });
    made.push(old.id);
    await api()
      .post('/api/messaging/messages')
      .set('Authorization', `Bearer ${teacher}`)
      .send({ conversationId: old.id, content: 'Posters are due Friday' })
      .expect(201);
    expect(await watchersIn(old.id)).toEqual([patron, matron].sort());
  });

  describe('a school that has named nobody', () => {
    let principal: string;
    let principalId: string;
    let headTeacher: string;
    let headTeacherId: string;
    let pupil: string;

    beforeAll(async () => {
      principalId = (await person('c.mukeshimana@markova.edu', 'gs-umucyo')).id;
      headTeacherId = (await person('j.hakizimana@markova.edu', 'gs-umucyo'))
        .id;
      pupil = (
        await owner.student.findFirstOrThrow({
          where: { school: { slug: 'gs-umucyo' }, status: 'ACTIVE' },
          select: { userId: true },
        })
      ).userId;
      principal = await signIn({ email: 'c.mukeshimana@markova.edu' });
      headTeacher = await signIn({ email: 'j.hakizimana@markova.edu' });
    });

    it('has the principal watch over the head teacher’s chat with a student', async () => {
      const res = await startChat(headTeacher, pupil);
      expect(await watchersIn(res.body.id)).toEqual([principalId]);
    });

    it('has the head teacher watch over the principal’s', async () => {
      const res = await startChat(principal, pupil);
      expect(await watchersIn(res.body.id)).toEqual([headTeacherId]);
    });

    it('lets the principal name a lead, who then watches the next chat', async () => {
      await api()
        .put(`/api/users/${headTeacherId}/safeguarding-lead`)
        .set('Authorization', `Bearer ${principal}`)
        .send({ lead: true })
        .expect(200);
      try {
        const another = (
          await owner.student.findFirstOrThrow({
            where: {
              school: { slug: 'gs-umucyo' },
              status: 'ACTIVE',
              userId: { not: pupil },
            },
            select: { userId: true },
          })
        ).userId;
        const res = await startChat(principal, another);
        expect(await watchersIn(res.body.id)).toEqual([headTeacherId]);
      } finally {
        await owner.user.update({
          where: { id: headTeacherId },
          data: { safeguardingLead: false },
        });
      }
    });

    it('refuses to make a student a lead', async () => {
      await api()
        .put(`/api/users/${pupil}/safeguarding-lead`)
        .set('Authorization', `Bearer ${principal}`)
        .send({ lead: true })
        .expect(400);
    });

    it('cannot name a lead in another school', async () => {
      await api()
        .put(`/api/users/${patron}/safeguarding-lead`)
        .set('Authorization', `Bearer ${principal}`)
        .send({ lead: false })
        .expect(404);
    });

    it('keeps naming a lead to the principal', async () => {
      await api()
        .put(`/api/users/${principalId}/safeguarding-lead`)
        .set('Authorization', `Bearer ${headTeacher}`)
        .send({ lead: true })
        .expect(403);
    });
  });
});
