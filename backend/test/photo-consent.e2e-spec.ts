import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PhotoAnswer, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * A student's photo and what the family agreed to (B6 in docs/BLIND-SPOTS.md),
 * through the real API and the seeded Markova Academy. Every answer changed
 * here is put back afterwards.
 */
const PASSWORD = 'Password123!';
type Answers = {
  id: string;
  photoForId: PhotoAnswer;
  photoInApp: PhotoAnswer;
  photoPublicity: PhotoAnswer;
};

describe('photo consent (e2e)', () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;
  const started = new Date();
  const relaxed: { id: string; forcePasswordChange: boolean }[] = [];
  const before: Answers[] = [];

  let student1: { token: string; userId: string };
  let classmate: {
    id: string;
    userId: string;
    photoUrl: string;
    firstName: string;
  };
  let conversationId: string;
  let admin: string;
  let teacher: string;
  let parent: string;
  let adultParent: string;
  let adultId: string;
  let card: { id: string; code: string; firstName: string; lastName: string };

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
    post: (url: string, body: object) =>
      api().post(url).set('Authorization', `Bearer ${token}`).send(body),
  });

  const remember = async (id: string) => {
    before.push(
      await owner.student.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          photoForId: true,
          photoInApp: true,
          photoPublicity: true,
        },
      }),
    );
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
    const me = await owner.student.findFirstOrThrow({
      where: {
        schoolId: school.id,
        user: { account: { email: 'student1@markova.edu' } },
      },
      select: { userId: true, classSectionId: true },
    });
    // A classmate with a photo, in a chat with student1, with a parent.
    const conversation = await owner.conversation.findFirstOrThrow({
      where: {
        schoolId: school.id,
        participants: { some: { userId: me.userId } },
        AND: {
          participants: {
            some: {
              user: {
                photoUrl: { not: null },
                student: {
                  classSectionId: me.classSectionId,
                  parentStudents: { some: { parent: { isActive: true } } },
                },
                id: { not: me.userId },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    conversationId = conversation.id;
    const mate = await owner.student.findFirstOrThrow({
      where: {
        classSectionId: me.classSectionId,
        userId: { not: me.userId },
        user: {
          photoUrl: { not: null },
          conversationMemberships: { some: { conversationId } },
        },
        parentStudents: { some: { parent: { isActive: true } } },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { photoUrl: true, firstName: true } },
        parentStudents: {
          take: 1,
          select: { parent: { select: { account: true } } },
        },
      },
    });
    classmate = {
      id: mate.id,
      userId: mate.userId,
      photoUrl: mate.user.photoUrl!,
      firstName: mate.user.firstName,
    };
    await remember(mate.id);
    await owner.student.update({
      where: { id: mate.id },
      data: { photoInApp: 'NO' },
    });

    const adult = await owner.student.findFirstOrThrow({
      where: { user: { account: { email: 'adult@markova.edu' } } },
      select: { id: true },
    });
    adultId = adult.id;

    // A student with a photo and no card yet; the card is issued below.
    const carded = await owner.student.findFirstOrThrow({
      where: {
        schoolId: school.id,
        nfcCardId: null,
        status: 'ACTIVE',
        pauses: { none: {} },
        id: { not: mate.id },
        user: { photoUrl: { not: null } },
      },
      select: {
        id: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    card = {
      id: carded.id,
      code: '',
      firstName: carded.user.firstName,
      lastName: carded.user.lastName,
    };
    await remember(card.id);

    student1 = {
      token: await signIn({ email: 'student1@markova.edu' }),
      userId: me.userId,
    };
    admin = await signIn({ email: 'wilsonshizirungu@gmail.com' });
    teacher = await signIn({ email: 'aline.uwase@markova.edu' });
    const p = mate.parentStudents[0].parent.account;
    parent = await signIn(p.email ? { email: p.email } : { phone: p.phone! });
    adultParent = await signIn({ phone: '+250788199999' });

    const issued = await as(admin)
      .post('/api/reports/id-cards/issue', { studentId: card.id })
      .expect(201);
    card.code = issued.body.cardCode;
  });

  afterAll(async () => {
    // The card issued here never existed.
    await owner.student.update({
      where: { id: card.id },
      data: {
        nfcCardId: null,
        cardCode: null,
        cardIssuedAt: null,
        cardSuspendedAt: null,
      },
    });
    for (const { id, ...data } of before) {
      await owner.student.update({ where: { id }, data });
    }
    await owner.photoConsentRecord.deleteMany({
      where: {
        studentId: { in: [...before.map((b) => b.id), adultId] },
        createdAt: { gte: started },
      },
    });
    for (const a of relaxed) {
      await owner.account.update({
        where: { id: a.id },
        data: { forcePasswordChange: a.forcePasswordChange },
      });
    }
    await owner.$disconnect();
    await app.close();
  });

  const photoOf = (body: unknown, userId: string) => {
    let found: string | null | undefined;
    JSON.stringify(body, (_k, v) => {
      if (v && typeof v === 'object' && v.id === userId && 'photoUrl' in v) {
        found = v.photoUrl;
      }
      return v;
    });
    return found;
  };

  describe('a family that said No to the app', () => {
    it('shows classmates no photo in the chat', async () => {
      const res = await as(student1.token)
        .get(`/api/messaging/conversations/${conversationId}/participants`)
        .expect(200);
      expect(photoOf(res.body, classmate.userId)).toBeNull();
      expect(JSON.stringify(res.body)).not.toContain(classmate.photoUrl);
    });

    it('nor in the list of conversations', async () => {
      const res = await as(student1.token)
        .get('/api/messaging/conversations')
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain(classmate.photoUrl);
    });

    it('still shows the photo to the staff', async () => {
      const res = await as(admin)
        .get(
          `/api/messaging/contacts?search=${encodeURIComponent(classmate.firstName)}`,
        )
        .expect(200);
      expect(JSON.stringify(res.body)).toContain(classmate.photoUrl);
    });

    it('shows the photo again once the family says Yes', async () => {
      await owner.student.update({
        where: { id: classmate.id },
        data: { photoInApp: 'YES' },
      });
      const res = await as(student1.token)
        .get(`/api/messaging/conversations/${conversationId}/participants`)
        .expect(200);
      expect(photoOf(res.body, classmate.userId)).toBe(classmate.photoUrl);
    });
  });

  describe('answering', () => {
    const answers = { forId: 'YES', inApp: 'NO', publicity: 'NO' };

    it('lets a parent answer for their child, and keeps who did', async () => {
      const res = await as(parent)
        .put(`/api/students/${classmate.id}/photo-consent`, answers)
        .expect(200);
      expect(res.body).toMatchObject({ inApp: 'NO', mayAnswer: true });
      expect(res.body.history[0]).toMatchObject({ how: 'IN_THE_APP' });
      expect(res.body.history[0].answeredBy).toMatch(/\(parent\)$/);
    });

    it('refuses another family', async () => {
      await as(adultParent)
        .put(`/api/students/${classmate.id}/photo-consent`, answers)
        .expect(403);
    });

    it('refuses the parent of a student of 18, and says who decides', async () => {
      const res = await as(adultParent)
        .put(`/api/students/${adultId}/photo-consent`, answers)
        .expect(403);
      expect(res.body.message).toMatch(/is 18 or over, so .* decides this now/);
    });

    it('lets the office copy a paper form in, naming who signed it', async () => {
      await as(admin)
        .put(`/api/students/${classmate.id}/photo-consent`, answers)
        .expect(400);
      const res = await as(admin)
        .put(`/api/students/${classmate.id}/photo-consent`, {
          ...answers,
          answeredBy: 'Marie Mukamana (mother)',
        })
        .expect(200);
      expect(res.body.history[0]).toMatchObject({
        how: 'PAPER_FORM',
        answeredBy: 'Marie Mukamana (mother)',
      });
    });

    it('keeps the office list to the office', async () => {
      const res = await as(admin)
        .get('/api/photo-consent/register')
        .expect(200);
      expect(res.body.counts.students).toBeGreaterThan(0);
      expect(res.body.students.map((s: any) => s.studentId)).toContain(
        classmate.id,
      );
      await as(teacher).get('/api/photo-consent/register').expect(403);
      await as(teacher)
        .get(`/api/students/${classmate.id}/photo-consent`)
        .expect(403);
    });
  });

  describe('a card at the gate', () => {
    it('shows the first name only', async () => {
      const res = await api().get(`/api/verify/card/${card.code}`).expect(200);
      expect(res.body.student.name).toBe(card.firstName);
      expect(JSON.stringify(res.body)).not.toContain(card.lastName);
    });

    it('shows no photo where the family said No to it on cards', async () => {
      await owner.student.update({
        where: { id: card.id },
        data: { photoForId: 'NO' },
      });
      const res = await api().get(`/api/verify/card/${card.code}`).expect(200);
      expect(res.body.student.photoUrl).toBeNull();
      const printed = await as(admin)
        .get(`/api/reports/id-card/${card.id}`)
        .expect(200);
      expect(printed.body.student.photoUrl).toBeNull();
    });
  });
});
