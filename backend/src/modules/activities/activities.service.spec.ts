import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

/**
 * Clubs, matches, assemblies, visiting day and trips.
 *
 * The tests worth having here are the safety ones. A trip is thirty children
 * leaving the premises on a bus, so who is on the list and whether a parent
 * agreed are not administrative details.
 */
describe('ActivitiesService', () => {
  let service: ActivitiesService;

  const prisma: any = {
    activity: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    activityParticipant: {
      create: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    student: { findUnique: jest.fn(), findMany: jest.fn() },
    parentStudent: { findFirst: jest.fn() },
  };

  const base = {
    kind: 'TRIP' as const,
    title: 'Nyungwe forest trip',
    startsAt: '2026-09-10T07:00:00.000Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.activity.create.mockResolvedValue({ id: 'act-1' });
    prisma.activityParticipant.findUnique.mockResolvedValue(null);
    prisma.activityParticipant.create.mockResolvedValue({ id: 'p-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ActivitiesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ActivitiesService);
  });

  describe('putting something on the calendar', () => {
    it('records what it is, when, and who made it', async () => {
      await service.create(base, 'user-1');
      expect(prisma.activity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'TRIP',
            title: 'Nyungwe forest trip',
            createdByUserId: 'user-1',
          }),
        }),
      );
    });

    // An event that ends before it starts breaks every calendar reading it.
    it('refuses an end before the start', async () => {
      await expect(
        service.create(
          { ...base, endsAt: '2026-09-09T07:00:00.000Z' },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is aimed at the whole school unless told otherwise', async () => {
      await service.create(base, 'user-1');
      expect(prisma.activity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ audience: 'WHOLE_SCHOOL' }),
        }),
      );
    });

    // "All of Senior 1" with no levels named is an event aimed at nobody.
    it('refuses a level audience with no levels chosen', async () => {
      await expect(
        service.create({ ...base, audience: 'LEVELS' as any }, 'user-1'),
      ).rejects.toThrow(/at least one year level/i);
    });

    it('refuses a class audience with no classes chosen', async () => {
      await expect(
        service.create({ ...base, audience: 'CLASSES' as any }, 'user-1'),
      ).rejects.toThrow(/at least one class/i);
    });

    it('attaches the chosen levels', async () => {
      await service.create(
        { ...base, audience: 'LEVELS' as any, classLevelIds: ['level-1', 'level-2'] },
        'user-1',
      );
      const data = prisma.activity.create.mock.calls[0][0].data;
      expect(data.classLevels.create).toHaveLength(2);
    });

    // Consent is off unless asked for, because most things do not need it and
    // asking for a slip per assembly trains everyone to ignore them.
    it('asks for no consent unless the organiser says so', async () => {
      await service.create(base, 'user-1');
      expect(prisma.activity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresConsent: false }),
        }),
      );
    });
  });

  /**
   * A cancelled trip is a thing that happened. Families who already signed a
   * slip need to see why it is off.
   */
  describe('calling something off', () => {
    it('marks it cancelled with the reason, rather than deleting it', async () => {
      prisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
      prisma.activity.update.mockResolvedValue({});

      await service.cancel('act-1', 'The bus broke down');

      expect(prisma.activity.delete).not.toHaveBeenCalled();
      expect(prisma.activity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isCancelled: true, cancelledReason: 'The bus broke down' },
        }),
      );
    });

    it('refuses to delete one students have signed up for', async () => {
      prisma.activity.findUnique.mockResolvedValue({
        id: 'act-1',
        _count: { participants: 12 },
      });
      await expect(service.remove('act-1')).rejects.toThrow(/cancel it instead/i);
      expect(prisma.activity.delete).not.toHaveBeenCalled();
    });

    it('deletes one nobody signed up for', async () => {
      prisma.activity.findUnique.mockResolvedValue({
        id: 'act-1',
        _count: { participants: 0 },
      });
      await service.remove('act-1');
      expect(prisma.activity.delete).toHaveBeenCalled();
    });
  });

  describe('the list of who is going', () => {
    beforeEach(() => {
      prisma.activity.findUnique.mockResolvedValue({
        id: 'act-1',
        isCancelled: false,
        capacity: null,
        _count: { participants: 0 },
      });
    });

    it('adds a student', async () => {
      await service.addParticipant('act-1', 'student-1');
      expect(prisma.activityParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { activityId: 'act-1', studentId: 'student-1' },
        }),
      );
    });

    // Signing up twice would put one child on the bus list twice and make the
    // headcount wrong.
    it('does not add the same student twice', async () => {
      prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'p-1' });
      await service.addParticipant('act-1', 'student-1');
      expect(prisma.activityParticipant.create).not.toHaveBeenCalled();
    });

    it('refuses to add anyone to a cancelled activity', async () => {
      prisma.activity.findUnique.mockResolvedValue({
        id: 'act-1',
        isCancelled: true,
        capacity: null,
        _count: { participants: 0 },
      });
      await expect(
        service.addParticipant('act-1', 'student-1'),
      ).rejects.toThrow(/cancelled/i);
    });

    // A bus has a fixed number of seats.
    it('refuses to go past the capacity', async () => {
      prisma.activity.findUnique.mockResolvedValue({
        id: 'act-1',
        isCancelled: false,
        capacity: 30,
        _count: { participants: 30 },
      });
      await expect(
        service.addParticipant('act-1', 'student-1'),
      ).rejects.toThrow(/full at 30 places/i);
    });

    it('signs up a whole class at once', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 'student-1' },
        { id: 'student-2' },
        { id: 'student-3' },
      ]);
      const result = await service.addClass('act-1', 'section-1');
      expect(result.added).toBe(3);
    });

    it('skips students already on the list', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 'student-1' }, { id: 'student-2' }]);
      prisma.activityParticipant.findUnique
        .mockResolvedValueOnce({ id: 'p-1' })
        .mockResolvedValueOnce(null);

      const result = await service.addClass('act-1', 'section-1');
      expect(result.added).toBe(1);
      expect(result.alreadyOn).toBe(1);
    });
  });

  /**
   * Consent is the one that matters after an accident. "I never signed that"
   * has to be answerable.
   */
  describe('a parent answering', () => {
    it('records the answer against the person who gave it', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue({ id: 'ps-1' });
      prisma.activityParticipant.upsert.mockResolvedValue({});

      await service.recordConsent(
        'act-1',
        'student-1',
        'GIVEN' as any,
        'Happy for him to go',
        'user-1',
        'PARENT' as any,
      );

      expect(prisma.activityParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            consent: 'GIVEN',
            consentByUserId: 'user-1',
            consentNote: 'Happy for him to go',
          }),
        }),
      );
    });

    it('stamps the time it was given', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue({ id: 'ps-1' });
      prisma.activityParticipant.upsert.mockResolvedValue({});
      await service.recordConsent('act-1', 'student-1', 'GIVEN' as any, undefined, 'user-1', 'PARENT' as any);

      const call = prisma.activityParticipant.upsert.mock.calls[0][0];
      expect(call.update.consentAt).toBeInstanceOf(Date);
    });

    it('records a refusal as clearly as an agreement', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue({ id: 'ps-1' });
      prisma.activityParticipant.upsert.mockResolvedValue({});
      await service.recordConsent('act-1', 'student-1', 'REFUSED' as any, 'He is unwell', 'user-1', 'PARENT' as any);

      expect(prisma.activityParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ consent: 'REFUSED' }),
        }),
      );
    });

    // Consent for a child who is not yours is not consent at all.
    it('stops a parent answering for another family', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue(null);
      await expect(
        service.recordConsent('act-1', 'student-9', 'GIVEN' as any, undefined, 'user-1', 'PARENT' as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // The office records answers given on paper or over the phone.
    it('lets the office record an answer given elsewhere', async () => {
      prisma.activityParticipant.upsert.mockResolvedValue({});
      await service.recordConsent('act-1', 'student-9', 'GIVEN' as any, 'Signed slip', 'user-1', 'ADMIN' as any);
      expect(prisma.activityParticipant.upsert).toHaveBeenCalled();
      expect(prisma.parentStudent.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('the day before a trip', () => {
    it('splits the list into agreed, refused and not answered', async () => {
      const student = (id: string, first: string) => ({
        student: { id, studentIdNumber: `STD-${id}`, user: { firstName: first, lastName: 'Uwase' } },
      });
      prisma.activity.findUnique.mockResolvedValue({
        id: 'act-1',
        requiresConsent: true,
        participants: [
          { consent: 'GIVEN', ...student('s1', 'Divine') },
          { consent: 'REFUSED', ...student('s2', 'Keza') },
          { consent: 'PENDING', ...student('s3', 'Aline') },
          { consent: 'PENDING', ...student('s4', 'Eric') },
        ],
      });

      const summary = await service.consentSummary('act-1');
      expect(summary.total).toBe(4);
      expect(summary.given).toHaveLength(1);
      expect(summary.refused).toHaveLength(1);
      // The list a head teacher actually works from.
      expect(summary.pending).toHaveLength(2);
      expect(summary.pending[0].name).toBe('Aline Uwase');
    });
  });

  /**
   * A club that never checks who came is a club that quietly stops existing.
   */
  describe('taking the register', () => {
    it('records who came and who did not', async () => {
      prisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
      prisma.activityParticipant.upsert.mockResolvedValue({});

      const result = await service.markAttendance('act-1', [
        { studentId: 'student-1', attended: true },
        { studentId: 'student-2', attended: false },
      ]);

      expect(result.marked).toBe(2);
      expect(prisma.activityParticipant.upsert).toHaveBeenCalledTimes(2);
    });

    it('stamps when the register was taken', async () => {
      prisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
      prisma.activityParticipant.upsert.mockResolvedValue({});
      await service.markAttendance('act-1', [{ studentId: 'student-1', attended: true }]);

      const call = prisma.activityParticipant.upsert.mock.calls[0][0];
      expect(call.update.attendedAt).toBeInstanceOf(Date);
    });

    // Somebody who turned up without signing up still gets marked present,
    // because the register is a record of what happened.
    it('marks a student who was never on the list', async () => {
      prisma.activity.findUnique.mockResolvedValue({ id: 'act-1' });
      prisma.activityParticipant.upsert.mockResolvedValue({});
      await service.markAttendance('act-1', [{ studentId: 'walk-in', attended: true }]);

      const call = prisma.activityParticipant.upsert.mock.calls[0][0];
      expect(call.create.studentId).toBe('walk-in');
    });
  });

  /**
   * A student's own view. An activity aimed at the whole school concerns them
   * without any row existing, so this is not simply "what I signed up for".
   */
  describe("what one student is concerned by", () => {
    it('includes anything aimed at their level or class, signed up or not', async () => {
      prisma.student.findUnique.mockResolvedValue({
        classSectionId: 'section-1',
        classSection: { classLevelId: 'level-1' },
      });
      prisma.activity.findMany.mockResolvedValue([]);

      await service.forStudent('student-1');

      const where = prisma.activity.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { audience: 'WHOLE_SCHOOL' },
          expect.objectContaining({ audience: 'LEVELS' }),
          expect.objectContaining({ audience: 'CLASSES' }),
          { participants: { some: { studentId: 'student-1' } } },
        ]),
      );
    });

    it('leaves cancelled activities out', async () => {
      prisma.student.findUnique.mockResolvedValue({
        classSectionId: 'section-1',
        classSection: { classLevelId: 'level-1' },
      });
      prisma.activity.findMany.mockResolvedValue([]);
      await service.forStudent('student-1');
      expect(prisma.activity.findMany.mock.calls[0][0].where.isCancelled).toBe(false);
    });

    // "Am I on the list and did my parent agree" is one question from the
    // student's side, so it arrives as one field.
    it('flattens their own place onto each activity', async () => {
      prisma.student.findUnique.mockResolvedValue({
        classSectionId: 'section-1',
        classSection: { classLevelId: 'level-1' },
      });
      prisma.activity.findMany.mockResolvedValue([
        { id: 'act-1', participants: [{ id: 'p-1', consent: 'GIVEN', attended: null }] },
        { id: 'act-2', participants: [] },
      ]);

      const result = await service.forStudent('student-1');
      expect(result[0].myPlace).toEqual({ id: 'p-1', consent: 'GIVEN', attended: null });
      expect(result[1].myPlace).toBeNull();
    });

    // The reply carries the student's own consent state, so it has to be
    // scoped the same way marks are.
    it('refuses a student asking about somebody else', async () => {
      prisma.student.findUnique.mockResolvedValue({
        userId: 'user-other',
        classSectionId: 'section-1',
        classSection: { classLevelId: 'level-1' },
      });

      await expect(
        service.forStudent('student-1', undefined, {
          userId: 'user-me',
          role: Role.STUDENT,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.activity.findMany).not.toHaveBeenCalled();
    });

    it('lets a student ask about themselves', async () => {
      prisma.student.findUnique.mockResolvedValue({
        userId: 'user-me',
        classSectionId: 'section-1',
        classSection: { classLevelId: 'level-1' },
      });
      prisma.activity.findMany.mockResolvedValue([]);

      await expect(
        service.forStudent('student-1', undefined, {
          userId: 'user-me',
          role: Role.STUDENT,
        }),
      ).resolves.toEqual([]);
    });

    it('refuses a parent asking about a child that is not theirs', async () => {
      prisma.student.findUnique.mockResolvedValue({
        userId: 'user-kid',
        classSectionId: 'section-1',
        classSection: { classLevelId: 'level-1' },
      });
      prisma.parentStudent.findFirst.mockResolvedValue(null);

      await expect(
        service.forStudent('student-1', undefined, {
          userId: 'parent-1',
          role: Role.PARENT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a parent ask about their own child', async () => {
      prisma.student.findUnique.mockResolvedValue({
        userId: 'user-kid',
        classSectionId: 'section-1',
        classSection: { classLevelId: 'level-1' },
      });
      prisma.parentStudent.findFirst.mockResolvedValue({ id: 'link-1' });
      prisma.activity.findMany.mockResolvedValue([]);

      await expect(
        service.forStudent('student-1', undefined, {
          userId: 'parent-1',
          role: Role.PARENT,
        }),
      ).resolves.toEqual([]);
    });

    // A matron checking who is on the bus is not asking about her own child.
    it('lets staff ask about anyone', async () => {
      prisma.student.findUnique.mockResolvedValue({
        userId: 'user-kid',
        classSectionId: 'section-1',
        classSection: { classLevelId: 'level-1' },
      });
      prisma.activity.findMany.mockResolvedValue([]);

      await expect(
        service.forStudent('student-1', undefined, {
          userId: 'matron-1',
          role: Role.MATRON,
        }),
      ).resolves.toEqual([]);
      expect(prisma.parentStudent.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('the calendar', () => {
    it('hides cancelled activities by default', async () => {
      prisma.activity.count.mockResolvedValue(0);
      prisma.activity.findMany.mockResolvedValue([]);
      await service.findAll({});
      expect(prisma.activity.findMany.mock.calls[0][0].where.isCancelled).toBe(false);
    });

    it('shows them when asked', async () => {
      prisma.activity.count.mockResolvedValue(0);
      prisma.activity.findMany.mockResolvedValue([]);
      await service.findAll({ includeCancelled: true });
      expect(
        prisma.activity.findMany.mock.calls[0][0].where.isCancelled,
      ).toBeUndefined();
    });

    // A calendar reads forwards, unlike every other list in the system.
    it('is ordered soonest first', async () => {
      prisma.activity.count.mockResolvedValue(0);
      prisma.activity.findMany.mockResolvedValue([]);
      await service.findAll({});
      expect(prisma.activity.findMany.mock.calls[0][0].orderBy).toEqual({
        startsAt: 'asc',
      });
    });

    it('narrows to a date range', async () => {
      prisma.activity.count.mockResolvedValue(0);
      prisma.activity.findMany.mockResolvedValue([]);
      await service.findAll({ from: '2026-09-01', to: '2026-09-30' });
      const where = prisma.activity.findMany.mock.calls[0][0].where;
      expect(where.startsAt.gte).toBeInstanceOf(Date);
      expect(where.startsAt.lte).toBeInstanceOf(Date);
    });
  });

  describe('what is coming up', () => {
    it('looks only forwards', async () => {
      prisma.activity.findMany.mockResolvedValue([]);
      await service.upcoming();
      const where = prisma.activity.findMany.mock.calls[0][0].where;
      expect(where.startsAt.gte).toBeInstanceOf(Date);
      expect(where.isCancelled).toBe(false);
    });

    // A term's worth of events on a dashboard is a list nobody reads.
    it('keeps the list short', async () => {
      prisma.activity.findMany.mockResolvedValue([]);
      await service.upcoming(500);
      expect(prisma.activity.findMany.mock.calls[0][0].take).toBe(20);
    });
  });
});
