import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MeritsService } from './merits.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The other half of behaviour.
 *
 * The tests that matter are about what the points mean. A merit has to be a
 * way back to a clean sheet without becoming a currency a student can bank
 * against future trouble, and the recognition has to survive either way.
 */
describe('MeritsService', () => {
  let service: MeritsService;

  const prisma: any = {
    meritAward: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    disciplineIncident: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    student: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    parentStudent: { findMany: jest.fn() },
    notification: { create: jest.fn() },
    schoolConfig: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const merit = {
    studentId: 'student-1',
    termId: 'term-1',
    category: 'HELPING_OTHERS' as any,
    description: 'Stayed behind to help clear the science lab',
    points: 5,
    date: '2026-08-20',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.schoolConfig.findFirst.mockResolvedValue({ value: '100' });
    prisma.parentStudent.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((work: any) =>
      typeof work === 'function' ? work(prisma) : Promise.all(work),
    );
    prisma.meritAward.create.mockResolvedValue({ id: 'merit-1' });
    prisma.student.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [MeritsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MeritsService);
  });

  describe('awarding a merit', () => {
    it('records what it was for and who gave it', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 80,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });

      await service.award(merit, 'teacher-1');

      expect(prisma.meritAward.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: 'HELPING_OTHERS',
            description: 'Stayed behind to help clear the science lab',
            awardedByUserId: 'teacher-1',
          }),
        }),
      );
    });

    it('restores the points to the conduct score', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 80,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });

      const result = await service.award(merit, 'teacher-1');

      expect(result.pointsRestored).toBe(5);
      expect(result.newDisciplinePoints).toBe(85);
      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { disciplinePoints: 85 } }),
      );
    });

    // 100 has to keep meaning "nothing against you", or a student can bank
    // merits against trouble they have not caused yet.
    it('never takes a student above a clean sheet', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 100,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });

      const result = await service.award(merit, 'teacher-1');

      expect(result.pointsRestored).toBe(0);
      expect(result.newDisciplinePoints).toBe(100);
    });

    it('restores only the gap when the merit is bigger than it', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 97,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });

      const result = await service.award(merit, 'teacher-1');

      expect(result.pointsRestored).toBe(3);
      expect(result.newDisciplinePoints).toBe(100);
    });

    // The award is the part worth keeping. "She was thanked for this" stands
    // whether or not there were points left to give back.
    it('still records the merit when there is nothing to restore', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 100,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });

      await service.award(merit, 'teacher-1');

      expect(prisma.meritAward.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ points: 5 }),
        }),
      );
    });

    it('reads the clean sheet from the school config', async () => {
      prisma.schoolConfig.findFirst.mockResolvedValue({ value: '50' });
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 48,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });

      const result = await service.award(merit, 'teacher-1');
      expect(result.newDisciplinePoints).toBe(50);
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.award(merit, 'teacher-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    // A family that only ever hears from the school when something is wrong
    // learns to dread the message.
    it('tells the family, the same way trouble is told', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 80,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parent: { id: 'parent-1', firstName: 'Claudine' },
          student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
        },
      ]);

      await service.award(merit, 'teacher-1');

      const message = prisma.notification.create.mock.calls[0][0].data.message;
      expect(message).toContain('Divine Niyonkuru');
      expect(message).toContain('Stayed behind to help clear the science lab');
    });

    it('does not lose the award when the message fails to send', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 80,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parent: { id: 'parent-1', firstName: 'Claudine' },
          student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
        },
      ]);
      prisma.notification.create.mockRejectedValue(
        new Error('SMS gateway down'),
      );

      await expect(service.award(merit, 'teacher-1')).resolves.toBeDefined();
    });
  });

  /**
   * The number a student on a warning actually wants: how far back to a clean
   * sheet, which is otherwise a thing they have to work out for themselves.
   */
  describe('one student, both sides', () => {
    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        studentIdNumber: 'STD-2025-231419-167',
        disciplinePoints: 82,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      prisma.meritAward.findMany.mockResolvedValue([]);
      prisma.disciplineIncident.findMany.mockResolvedValue([]);
    });

    it('says how many points back to a clean sheet', async () => {
      const result = await service.standing('student-1');
      expect(result.pointsToCleanSheet).toBe(18);
    });

    it('says zero rather than a negative for a spotless record', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        studentIdNumber: 'STD-2025-231419-167',
        disciplinePoints: 100,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      const result = await service.standing('student-1');
      expect(result.pointsToCleanSheet).toBe(0);
    });

    it('counts both sides', async () => {
      prisma.meritAward.findMany.mockResolvedValue([
        { id: 'm-1', category: 'SPORT' },
        { id: 'm-2', category: 'SPORT' },
        { id: 'm-3', category: 'HONESTY' },
      ]);
      prisma.disciplineIncident.findMany.mockResolvedValue([{ id: 'i-1' }]);

      const result = await service.standing('student-1');
      expect(result.meritCount).toBe(3);
      expect(result.incidentCount).toBe(1);
      expect(result.byCategory).toEqual({ SPORT: 2, HONESTY: 1 });
    });

    it('narrows to one term when asked', async () => {
      await service.standing('student-1', 'term-1');
      expect(prisma.meritAward.findMany.mock.calls[0][0].where.termId).toBe(
        'term-1',
      );
      expect(
        prisma.disciplineIncident.findMany.mock.calls[0][0].where.termId,
      ).toBe('term-1');
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.standing('nobody')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * Not "who has the fewest points", which is the same names all year. This is
   * about movement: who is picking up incidents now with nothing on the other
   * side of the ledger.
   */
  describe('the watch list', () => {
    it('is empty when nothing concerning happened', async () => {
      prisma.disciplineIncident.groupBy.mockResolvedValue([]);
      const result = await service.watchList(30);
      expect(result.students).toEqual([]);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    });

    // One incident in a month is a bad day, not a pattern.
    it('ignores a student with a single small incident', async () => {
      prisma.disciplineIncident.groupBy.mockResolvedValue([
        {
          studentId: 'student-1',
          _count: { _all: 1 },
          _sum: { pointsDeducted: 5 },
        },
      ]);
      const result = await service.watchList(30);
      expect(result.students).toEqual([]);
    });

    it('flags a student with two incidents', async () => {
      prisma.disciplineIncident.groupBy.mockResolvedValue([
        {
          studentId: 'student-1',
          _count: { _all: 2 },
          _sum: { pointsDeducted: 8 },
        },
      ]);
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-2025-231419-167',
          disciplinePoints: 92,
          classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
        },
      ]);
      prisma.meritAward.groupBy.mockResolvedValue([]);

      const result = await service.watchList(30);
      expect(result.students).toHaveLength(1);
      expect(result.students[0].incidents).toBe(2);
    });

    // A single serious incident is worth a look even without a second one.
    it('flags one heavy incident on points alone', async () => {
      prisma.disciplineIncident.groupBy.mockResolvedValue([
        {
          studentId: 'student-1',
          _count: { _all: 1 },
          _sum: { pointsDeducted: 20 },
        },
      ]);
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-2025-231419-167',
          disciplinePoints: 80,
          classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
        },
      ]);
      prisma.meritAward.groupBy.mockResolvedValue([]);

      const result = await service.watchList(30);
      expect(result.students).toHaveLength(1);
      expect(result.students[0].pointsLost).toBe(20);
    });

    // Nothing on the credit side is what turns a rough patch into a
    // reputation, and it is the cheapest thing for a school to fix.
    it('says plainly when a flagged student has had nothing positive', async () => {
      prisma.disciplineIncident.groupBy.mockResolvedValue([
        {
          studentId: 'student-1',
          _count: { _all: 3 },
          _sum: { pointsDeducted: 12 },
        },
        {
          studentId: 'student-2',
          _count: { _all: 2 },
          _sum: { pointsDeducted: 6 },
        },
      ]);
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'A',
          disciplinePoints: 88,
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
        },
        {
          id: 'student-2',
          studentIdNumber: 'B',
          disciplinePoints: 94,
          classSection: { name: 'B', classLevel: { name: 'S1' } },
          user: { firstName: 'Keza', lastName: 'Mutesi' },
        },
      ]);
      prisma.meritAward.groupBy.mockResolvedValue([
        { studentId: 'student-2', _count: { _all: 2 } },
      ]);

      const result = await service.watchList(30);
      const divine = result.students.find((s: any) => s.id === 'student-1')!;
      const keza = result.students.find((s: any) => s.id === 'student-2')!;
      expect(divine.nothingPositive).toBe(true);
      expect(keza.nothingPositive).toBe(false);
      expect(keza.merits).toBe(2);
    });

    it('puts the heaviest losses first', async () => {
      prisma.disciplineIncident.groupBy.mockResolvedValue([
        {
          studentId: 'student-1',
          _count: { _all: 2 },
          _sum: { pointsDeducted: 6 },
        },
        {
          studentId: 'student-2',
          _count: { _all: 2 },
          _sum: { pointsDeducted: 18 },
        },
      ]);
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'A',
          disciplinePoints: 94,
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
        },
        {
          id: 'student-2',
          studentIdNumber: 'B',
          disciplinePoints: 82,
          classSection: { name: 'B', classLevel: { name: 'S1' } },
          user: { firstName: 'Keza', lastName: 'Mutesi' },
        },
      ]);
      prisma.meritAward.groupBy.mockResolvedValue([]);

      const result = await service.watchList(30);
      expect(result.students[0].id).toBe('student-2');
    });
  });

  /**
   * A school that awards nothing but sport is telling every non-sporting
   * student where they stand.
   */
  describe('what the school recognises', () => {
    beforeEach(() => {
      prisma.meritAward.count.mockResolvedValue(0);
      prisma.disciplineIncident.count.mockResolvedValue(0);
      prisma.meritAward.groupBy.mockResolvedValue([]);
      prisma.student.findMany.mockResolvedValue([]);
    });

    it('lists every category, including the ones at zero', async () => {
      prisma.meritAward.groupBy.mockResolvedValue([
        { category: 'SPORT', _count: { _all: 12 } },
      ]);
      const result = await service.summary();
      expect(result.byCategory.SPORT).toBe(12);
      expect(result.byCategory.ACADEMIC_EFFORT).toBe(0);
      expect(result.byCategory.IMPROVEMENT).toBe(0);
    });

    // Below 1 means the school writes down more of what goes wrong than what
    // goes right, which is the state most schools are in and never see.
    it('gives the ratio of praise to trouble', async () => {
      prisma.meritAward.count.mockResolvedValue(30);
      prisma.disciplineIncident.count.mockResolvedValue(60);
      const result = await service.summary();
      expect(result.ratio).toBe(0.5);
    });

    it('gives no ratio rather than dividing by zero', async () => {
      prisma.meritAward.count.mockResolvedValue(4);
      prisma.disciplineIncident.count.mockResolvedValue(0);
      const result = await service.summary();
      expect(result.ratio).toBeNull();
    });

    it('scopes to a term when one is named', async () => {
      await service.summary('term-1');
      expect(prisma.meritAward.count.mock.calls[0][0].where).toEqual({
        termId: 'term-1',
      });
    });

    it('falls back to a recent window with no term', async () => {
      await service.summary(undefined, 7);
      expect(
        prisma.meritAward.count.mock.calls[0][0].where.date.gte,
      ).toBeInstanceOf(Date);
    });
  });

  describe('the list of merits awarded', () => {
    beforeEach(() => {
      prisma.meritAward.findMany.mockResolvedValue([]);
      prisma.meritAward.count.mockResolvedValue(0);
    });

    it('narrows by student, term, category and class', async () => {
      await service.find({
        studentId: 'student-1',
        termId: 'term-1',
        category: 'HONESTY',
        classSectionId: 'section-1',
      });
      expect(prisma.meritAward.findMany.mock.calls[0][0].where).toEqual({
        studentId: 'student-1',
        termId: 'term-1',
        category: 'HONESTY',
        student: { classSectionId: 'section-1' },
      });
    });

    it('narrows to nothing at all when nothing was asked for', async () => {
      await service.find({});
      expect(prisma.meritAward.findMany.mock.calls[0][0].where).toEqual({});
    });

    // Recognition reads like a newsfeed: the most recent thing first.
    it('reads the most recent first', async () => {
      await service.find({});
      expect(prisma.meritAward.findMany.mock.calls[0][0].orderBy).toEqual({
        date: 'desc',
      });
    });

    it('pages', async () => {
      prisma.meritAward.count.mockResolvedValue(45);
      const result = await service.find({ page: 3, limit: 20 });
      expect(prisma.meritAward.findMany.mock.calls[0][0].skip).toBe(40);
      expect(result.meta).toEqual({
        total: 45,
        page: 3,
        limit: 20,
        totalPages: 3,
      });
    });

    it('takes twenty a page unless told otherwise', async () => {
      await service.find({});
      expect(prisma.meritAward.findMany.mock.calls[0][0].take).toBe(20);
    });
  });

  describe('who has been recognised most', () => {
    beforeEach(() => {
      prisma.meritAward.count.mockResolvedValue(0);
      prisma.disciplineIncident.count.mockResolvedValue(0);
      prisma.meritAward.groupBy.mockResolvedValue([]);
    });

    it('names them with their count', async () => {
      prisma.meritAward.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { studentId: 'student-1', _count: { _all: 4 } },
        ]);
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-2026-001',
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
          classSection: { name: 'A' },
        },
      ]);

      const result = await service.summary();
      expect(result.mostRecognised).toEqual([
        {
          id: 'student-1',
          studentIdNumber: 'STD-2026-001',
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
          classSection: { name: 'A' },
          merits: 4,
        },
      ]);
    });

    it('names nobody when nothing has been awarded', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      const result = await service.summary();
      expect(result.mostRecognised).toEqual([]);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    });
  });
});

/**
 * A school that has not set its own clean-sheet score, and lists whose rows
 * have outlived the students on them.
 *
 * The watch list and the recognition summary both join a grouped count back
 * to a roll of students. A student who left between the two queries is not on
 * the roll any more, and the count has to land on nought rather than on
 * undefined.
 */
describe('the merits service on a partly set-up school', () => {
  let service: MeritsService;

  const prisma: any = {
    meritAward: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    disciplineIncident: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    student: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    parentStudent: { findMany: jest.fn() },
    notification: { create: jest.fn() },
    schoolConfig: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.parentStudent.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((work: any) =>
      typeof work === 'function' ? work(prisma) : Promise.all(work),
    );
    prisma.meritAward.create.mockResolvedValue({ id: 'merit-1' });
    prisma.student.update.mockResolvedValue({});
    prisma.meritAward.groupBy.mockResolvedValue([]);
    prisma.disciplineIncident.groupBy.mockResolvedValue([]);
    prisma.student.findMany.mockResolvedValue([]);
    prisma.meritAward.count.mockResolvedValue(0);
    prisma.disciplineIncident.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [MeritsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MeritsService);
  });

  // A hundred is the score the Rwandan conduct scheme starts everyone on.
  // Forty a term is the default now, not a hundred for the whole year.
  it('starts everyone on forty when the school set nothing', async () => {
    prisma.schoolConfig.findFirst.mockResolvedValue(null);
    prisma.student.findUnique.mockResolvedValue({
      id: 'student-1',
      disciplinePoints: 30,
    });

    await service.award(
      {
        studentId: 'student-1',
        termId: 'term-1',
        category: 'HELPING_OTHERS',
        description: 'Stayed behind to help clear the science lab',
        points: 5,
        date: '2026-08-20',
      } as never,
      'user-1',
    );

    // 30 plus 5 is 35, still under the clean sheet, so all five land.
    const update = prisma.student.update.mock.calls[0][0];
    expect(update.data.disciplinePoints).toBe(35);
  });

  it('takes the schools own score when it has set one', async () => {
    prisma.schoolConfig.findFirst.mockResolvedValue({ value: '50' });
    prisma.student.findUnique.mockResolvedValue({
      id: 'student-1',
      disciplinePoints: 48,
    });

    await service.award(
      {
        studentId: 'student-1',
        termId: 'term-1',
        category: 'HELPING_OTHERS',
        description: 'Stayed behind to help clear the science lab',
        points: 5,
        date: '2026-08-20',
      } as never,
      'user-1',
    );

    // Capped at the school's own clean sheet rather than inflating past it.
    expect(prisma.student.update.mock.calls[0][0].data.disciplinePoints).toBe(
      50,
    );
  });

  it('looks back a month by default', async () => {
    const result = await service.watchList();
    expect(result.days).toBe(30);
  });

  it('counts nought for a watch-list student the roll no longer has', async () => {
    prisma.disciplineIncident.groupBy.mockResolvedValue([
      {
        studentId: 'student-1',
        _count: { _all: 3 },
        _sum: { pointsDeducted: 20 },
      },
    ]);
    prisma.student.findMany.mockResolvedValue([
      {
        id: 'student-1',
        studentIdNumber: 'STD-2026-001',
        disciplinePoints: 80,
        classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      },
    ]);
    // No merits at all for them in the window.
    prisma.meritAward.groupBy.mockResolvedValue([]);

    const result = await service.watchList(30);
    expect(result.students[0].merits).toBe(0);
    expect(result.students[0].nothingPositive).toBe(true);
  });

  it('counts nought for a points total the group query left off', async () => {
    prisma.disciplineIncident.groupBy.mockResolvedValue([
      {
        studentId: 'student-1',
        _count: { _all: 3 },
        _sum: { pointsDeducted: null },
      },
    ]);
    prisma.student.findMany.mockResolvedValue([
      {
        id: 'student-1',
        studentIdNumber: 'STD-2026-001',
        disciplinePoints: 80,
        classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      },
    ]);

    const result = await service.watchList(30);
    expect(result.students[0].pointsLost).toBe(0);
  });

  it('counts nought for a recognised student the roll no longer has', async () => {
    prisma.meritAward.groupBy.mockResolvedValue([
      { studentId: 'student-1', _count: { _all: 6 } },
    ]);
    prisma.student.findMany.mockResolvedValue([
      {
        id: 'student-9',
        studentIdNumber: 'STD-2026-009',
        user: { firstName: 'Keza', lastName: 'Uwimana' },
        classSection: { name: 'A' },
      },
    ]);

    const result = await service.summary();
    expect(result.mostRecognised[0].merits).toBe(0);
  });
});
