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
 * A student's journey, through the real API (docs/STUDENT-LIFE-DESIGN.md,
 * B8 and A9).
 *
 * Uses the seeded Markova Academy: student27 is suspended this week, in
 * student1's class. Everything changed here is put back afterwards.
 */
const PASSWORD = 'Password123!';
const today = schoolDay().toISOString().slice(0, 10);

describe("a student's journey (e2e)", () => {
  let app: INestApplication<App>;
  let owner: PrismaClient;
  let schoolId: string;
  let admin: string;
  let headTeacher: string;
  let teacher: string;
  /** Logins whose forced password change was set aside, to put back. */
  const relaxed: { id: string; forcePasswordChange: boolean }[] = [];
  /** Student rows to restore exactly as they were. */
  const restore: { id: string; status: any; userActive: boolean }[] = [];

  const api = () => request(app.getHttpServer());

  const signIn = async (login: { email?: string; phone?: string }) => {
    const first = await api()
      .post('/api/auth/login')
      .send({ ...login, password: PASSWORD });
    if (first.status !== 201) return { status: first.status, token: '' };
    if (!first.body.requiresOtp) {
      return { status: 201, token: first.body.accessToken as string };
    }
    const done = await api()
      .post('/api/auth/verify-otp')
      .send({ sessionId: first.body.sessionId, otp: first.body.devOtp })
      .expect(201);
    return { status: 201, token: done.body.accessToken as string };
  };
  const tokenFor = async (email: string) => {
    const account = await owner.account.findFirstOrThrow({
      where: { email },
      select: { id: true, forcePasswordChange: true },
    });
    if (account.forcePasswordChange) {
      relaxed.push(account);
      await owner.account.update({
        where: { id: account.id },
        data: { forcePasswordChange: false },
      });
    }
    const { token } = await signIn({ email });
    return token;
  };

  /** A student on the roll, in the school, with a parent linked. */
  const freshStudent = async (skip: string[] = []) => {
    const s = await owner.student.findFirstOrThrow({
      where: {
        schoolId,
        status: 'ACTIVE',
        id: { notIn: skip },
        pauses: { none: {} },
        parentStudents: { some: { parent: { isActive: true } } },
        user: { account: { email: { not: null } } },
      },
      select: {
        id: true,
        status: true,
        classSectionId: true,
        user: {
          select: {
            id: true,
            isActive: true,
            account: { select: { email: true } },
          },
        },
        parentStudents: { select: { parentUserId: true } },
      },
    });
    restore.push({ id: s.id, status: s.status, userActive: s.user.isActive });
    return s;
  };

  const notesTo = (userIds: string[]) =>
    owner.notification.count({ where: { userId: { in: userIds } } });

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
    schoolId = (
      await owner.school.findFirstOrThrow({
        where: { slug: 'markova-academy' },
      })
    ).id;
    admin = await tokenFor('wilsonshizirungu@gmail.com');
    headTeacher = await tokenFor('headteacher@markova.edu');
    teacher = await tokenFor('aline.uwase@markova.edu');
  });

  afterAll(async () => {
    for (const r of restore) {
      const student = await owner.student.findUniqueOrThrow({
        where: { id: r.id },
        select: { userId: true },
      });
      await owner.studentPause.deleteMany({
        where: { studentId: r.id, createdAt: { gte: started } },
      });
      await owner.studentJourneyEntry.deleteMany({
        where: { studentId: r.id, createdAt: { gte: started } },
      });
      await owner.student.update({
        where: { id: r.id },
        data: { status: r.status },
      });
      await owner.user.update({
        where: { id: student.userId },
        data: { isActive: r.userActive, passedAwayOn: null },
      });
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
  const started = new Date();

  describe('the student suspended this week', () => {
    let suspended: {
      id: string;
      classSectionId: string;
      userId: string;
      parents: string[];
    };

    beforeAll(async () => {
      const s = await owner.student.findFirstOrThrow({
        where: { user: { account: { email: 'student27@markova.edu' } } },
        select: {
          id: true,
          classSectionId: true,
          userId: true,
          parentStudents: { select: { parentUserId: true } },
        },
      });
      suspended = {
        ...s,
        parents: s.parentStudents.map((p) => p.parentUserId),
      };
    });

    it('is on the class register as suspended, and in none of the counts', async () => {
      const res = await api()
        .get('/api/attendance/class')
        .query({ classSectionId: suspended.classSectionId, date: today })
        .set('Authorization', `Bearer ${headTeacher}`)
        .expect(200);
      const row = res.body.students.find(
        (s: any) => s.studentId === suspended.id,
      );
      expect(row.pause).toMatchObject({
        kind: 'SUSPENDED',
        label: 'Suspended',
      });
      expect(res.body.paused).toBeGreaterThanOrEqual(1);
      expect(res.body.total).toBe(res.body.students.length - res.body.paused);
    });

    it('is left off a register taken for the class, and the family is not texted', async () => {
      const before = await notesTo(suspended.parents);
      const res = await api()
        .post('/api/attendance/bulk')
        .set('Authorization', `Bearer ${headTeacher}`)
        .send({
          classSectionId: suspended.classSectionId,
          date: today,
          type: 'daily',
          records: [{ studentId: suspended.id, status: 'ABSENT' }],
        })
        .expect(201);
      expect(res.body.skipped).toEqual([
        { studentId: suspended.id, reason: 'Suspended' },
      ]);
      expect(await notesTo(suspended.parents)).toBe(before);
    });

    it('has a card the gate refuses, saying until when', async () => {
      const code = `JRN-${Date.now()}`;
      await owner.student.update({
        where: { id: suspended.id },
        data: { cardCode: code, cardIssuedAt: new Date() },
      });
      try {
        const res = await api().get(`/api/verify/card/${code}`).expect(200);
        expect(res.body.valid).toBe(false);
        expect(res.body.reason).toMatch(/suspended until/);
      } finally {
        await owner.student.update({
          where: { id: suspended.id },
          data: { cardCode: null, cardIssuedAt: null },
        });
      }
    });

    it('can sign in and read, and cannot post in the class chat', async () => {
      const token = await tokenFor('student27@markova.edu');
      const list = await api()
        .get('/api/messaging/conversations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const classGroup = list.body.find((c: any) => c.classSectionId);
      expect(classGroup).toBeTruthy();
      const post = await api()
        .post('/api/messaging/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ conversationId: classGroup.id, content: 'Hello class' })
        .expect(403);
      expect(post.body.message).toMatch(/You are suspended until/);
    });
  });

  describe('suspending and bringing back', () => {
    it('lets the Director of Studies suspend, and bring back early', async () => {
      const s = await freshStudent();
      await api()
        .post(`/api/students/${s.id}/journey/suspend`)
        .set('Authorization', `Bearer ${headTeacher}`)
        .send({ startsOn: today, endsOn: today, reason: 'Repeated lateness' })
        .expect(201);
      const mid = await api()
        .get(`/api/students/${s.id}/journey`)
        .set('Authorization', `Bearer ${headTeacher}`)
        .expect(200);
      expect(mid.body.pause.kind).toBe('SUSPENDED');
      expect(mid.body.stops.classChat).toBe('read-only');

      const back = await api()
        .post(`/api/students/${s.id}/journey/back`)
        .set('Authorization', `Bearer ${headTeacher}`)
        .send({ on: today })
        .expect(201);
      expect(back.body.pause).toBeNull();
      expect(back.body.entries.map((e: any) => e.step)).toEqual(
        expect.arrayContaining(['SUSPENDED', 'BACK']),
      );
    });

    it('refuses a teacher', async () => {
      const s = await freshStudent();
      await api()
        .post(`/api/students/${s.id}/journey/suspend`)
        .set('Authorization', `Bearer ${teacher}`)
        .send({ startsOn: today, endsOn: today, reason: 'Repeated lateness' })
        .expect(403);
    });

    it('keeps taking a student off the roll to the principal', async () => {
      const s = await freshStudent();
      await api()
        .post(`/api/students/${s.id}/journey/leave`)
        .set('Authorization', `Bearer ${headTeacher}`)
        .send({ status: 'WITHDRAWN', on: today, reason: 'Family moved' })
        .expect(403);
    });
  });

  describe('a student who leaves', () => {
    let gone: Awaited<ReturnType<typeof freshStudent>>;
    let token: string;

    beforeAll(async () => {
      gone = await freshStudent();
      token = await tokenFor(gone.user.account.email!);
      await api()
        .post(`/api/students/${gone.id}/journey/leave`)
        .set('Authorization', `Bearer ${admin}`)
        .send({
          status: 'WITHDRAWN',
          on: today,
          reason: 'Family moved to Rubavu',
        })
        .expect(201);
    });

    it('is off the roll, card revoked', async () => {
      const row = await owner.student.findUniqueOrThrow({
        where: { id: gone.id },
        select: { status: true, cardCode: true },
      });
      expect(row).toEqual({ status: 'WITHDRAWN', cardCode: null });
    });

    it('sees their report cards and nothing else', async () => {
      // A route every student may use, while on the roll.
      const chats = await api()
        .get('/api/messaging/conversations')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(chats.body.message).toMatch(/left the school/);
      const report = await api()
        .get(`/api/reports/term/${gone.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(report.status).not.toBe(403);
      await api()
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('cannot be marked on a register', async () => {
      const res = await api()
        .post('/api/attendance')
        .set('Authorization', `Bearer ${headTeacher}`)
        .send({
          studentId: gone.id,
          classSectionId: gone.classSectionId,
          date: today,
          type: 'daily',
          status: 'ABSENT',
        })
        .expect(400);
      expect(res.body.message).toMatch(/not on the roll \(withdrawn\)/);
    });

    it('comes back on readmission, to the class chosen', async () => {
      const res = await api()
        .post(`/api/students/${gone.id}/journey/readmit`)
        .set('Authorization', `Bearer ${admin}`)
        .send({
          on: today,
          classSectionId: gone.classSectionId,
          reason: 'Family came back',
        })
        .expect(201);
      expect(res.body.status).toBe('ACTIVE');
      await api()
        .get('/api/messaging/conversations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('a student who passed away', () => {
    let child: Awaited<ReturnType<typeof freshStudent>>;

    beforeAll(async () => {
      child = await freshStudent();
      await api()
        .post(`/api/students/${child.id}/journey/passed-away`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ on: today })
        .expect(201);
    });

    it('can no longer be signed in as', async () => {
      const { status } = await signIn({ email: child.user.account.email! });
      expect(status).not.toBe(201);
    });

    it('is never written to the family about again', async () => {
      const parents = child.parentStudents.map((p) => p.parentUserId);
      const before = await notesTo(parents);
      const term = await owner.term.findFirstOrThrow({
        where: { schoolId, isCurrent: true },
        select: { id: true },
      });
      // A discipline record written by mistake still reaches nobody.
      await api()
        .post('/api/discipline/incidents')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          studentId: child.id,
          termId: term.id,
          date: today,
          description: 'Recorded in error',
          pointsDeducted: 1,
          actionTaken: 'VERBAL_WARNING',
        });
      expect(await notesTo(parents)).toBe(before);
      await owner.disciplineIncident.deleteMany({
        where: { studentId: child.id, description: 'Recorded in error' },
      });
    });

    it('cannot be readmitted', async () => {
      await api()
        .post(`/api/students/${child.id}/journey/readmit`)
        .set('Authorization', `Bearer ${admin}`)
        .send({
          on: today,
          classSectionId: child.classSectionId,
          reason: 'x x x',
        })
        .expect(400);
    });
  });

  describe('a parent who passed away', () => {
    it('closes their account and puts a child left alone to the principal', async () => {
      // A parent who is the only one linked to their child.
      const link = await owner.parentStudent.findFirstOrThrow({
        where: {
          schoolId,
          parent: { isActive: true, passedAwayOn: null },
          student: {
            status: 'ACTIVE',
            parentStudents: { every: { parent: { isActive: true } } },
          },
        },
        select: {
          parentUserId: true,
          studentId: true,
          student: { select: { _count: { select: { parentStudents: true } } } },
        },
        orderBy: { student: { parentStudents: { _count: 'asc' } } },
      });
      const parentId = link.parentUserId;
      const principalNotes = () =>
        owner.notification.count({
          where: {
            relatedEntityType: 'STUDENT',
            relatedEntityId: link.studentId,
            title: { contains: 'no parent or guardian left' },
          },
        });
      const before = await principalNotes();
      try {
        const res = await api()
          .post(`/api/users/${parentId}/passed-away`)
          .set('Authorization', `Bearer ${admin}`)
          .send({ on: today })
          .expect(201);
        const parent = await owner.user.findUniqueOrThrow({
          where: { id: parentId },
          select: { isActive: true },
        });
        expect(parent.isActive).toBe(false);
        if (link.student._count.parentStudents === 1) {
          expect(res.body.childrenWithoutGuardian).toContain(link.studentId);
          expect(await principalNotes()).toBeGreaterThan(before);
        }
      } finally {
        await owner.user.update({
          where: { id: parentId },
          data: { isActive: true, passedAwayOn: null },
        });
        await owner.notification.deleteMany({
          where: {
            relatedEntityType: 'STUDENT',
            relatedEntityId: link.studentId,
            createdAt: { gte: started },
          },
        });
      }
    });
  });

  it("cannot read another school's student's journey", async () => {
    const umucyoAdmin = await tokenFor('c.mukeshimana@markova.edu');
    const s = await owner.student.findFirstOrThrow({
      where: { schoolId, status: 'ACTIVE' },
      select: { id: true },
    });
    await api()
      .get(`/api/students/${s.id}/journey`)
      .set('Authorization', `Bearer ${umucyoAdmin}`)
      .expect(404);
  });
});
