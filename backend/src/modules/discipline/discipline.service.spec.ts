import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DisciplineService } from './discipline.service';
import { OwnershipService } from '../../common/ownership.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * The discipline register.
 *
 * Every row here costs a student points and reaches a family, and an appeal is
 * the family's only way to answer back. The tests that matter are about the
 * points staying honest: an incident that is corrected, deleted or overturned
 * has to give back exactly what it took, or a student's standing drifts away
 * from the record that explains it.
 */
describe('DisciplineService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let ownership: { verifyStudentAccess: jest.Mock };
  let service: DisciplineService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ownership = { verifyStudentAccess: jest.fn().mockResolvedValue(undefined) };
    service = new DisciplineService(
      prisma,
      ownership as unknown as OwnershipService,
    );
    prisma.schoolConfig.findFirst.mockResolvedValue({ value: '100' });
    prisma.parentStudent.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({});
    prisma.disciplineIncident.update.mockResolvedValue({});
    prisma.disciplineIncident.delete.mockResolvedValue({});
    prisma.student.update.mockResolvedValue({});
  });

  const incident = {
    studentId: 'student-1',
    termId: 'term-1',
    date: '2026-08-18',
    description: 'Late to assembly three times this week',
    pointsDeducted: 5,
    actionTaken: 'VERBAL_WARNING',
  };

  describe('recording an incident', () => {
    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        status: 'ACTIVE',
        disciplinePoints: 100,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      prisma.disciplineIncident.create.mockResolvedValue({ id: 'inc-1' });
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.createIncident(incident as never, 'teacher-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('takes the points off the student’s standing', async () => {
      const result = await service.createIncident(
        incident as never,
        'teacher-1',
      );
      expect(result.newDisciplinePoints).toBe(95);
      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { disciplinePoints: 95 } }),
      );
    });

    /**
     * The score is a standing, not a debt. A student who has lost everything
     * cannot go below nothing, or the number stops meaning anything and no
     * amount of good behaviour reads as recovery.
     */
    it('never takes a student below zero', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 3,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      const result = await service.createIncident(
        { ...incident, pointsDeducted: 20 } as never,
        'teacher-1',
      );
      expect(result.newDisciplinePoints).toBe(0);
    });

    /**
     * The record and the score move together or not at all. A score that
     * dropped without an incident behind it is one a family cannot appeal.
     */
    it('writes the incident and the score in one transaction', async () => {
      await service.createIncident(incident as never, 'teacher-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('tells the family what happened and what it cost', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parent: { id: 'parent-1', firstName: 'Claudine', phone: '+250788' },
          student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
        },
      ]);
      await service.createIncident(incident as never, 'teacher-1');
      const message = prisma.notification.create.mock.calls[0][0].data.message;
      expect(message).toContain('Divine Niyonkuru');
      expect(message).toContain('Late to assembly');
      expect(message).toContain('5 points deducted');
      expect(message).toContain('Remaining: 95');
    });

    // A message that could not be sent is not a reason to lose the record of
    // what happened.
    it('records the incident even when the family cannot be reached', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parent: { id: 'parent-1', firstName: 'Claudine' },
          student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
        },
      ]);
      prisma.notification.create.mockRejectedValue(new Error('SMS down'));
      await expect(
        service.createIncident(incident as never, 'teacher-1'),
      ).resolves.toBeDefined();
    });
  });

  /**
   * A correction has to move the score by the difference, not by the new
   * figure. Re-applying the whole deduction would punish the student twice
   * for the same incident.
   */
  describe('correcting an incident', () => {
    beforeEach(() => {
      prisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 'student-1',
        pointsDeducted: 5,
      });
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 95,
      });
    });

    it('refuses an incident that does not exist', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue(null);
      await expect(service.updateIncident('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('takes only the extra when the deduction goes up', async () => {
      await service.updateIncident('inc-1', { pointsDeducted: 8 });
      expect(prisma.student.update.mock.calls[0][0].data).toEqual({
        disciplinePoints: 92,
      });
    });

    it('gives back the difference when the deduction goes down', async () => {
      await service.updateIncident('inc-1', { pointsDeducted: 2 });
      expect(prisma.student.update.mock.calls[0][0].data).toEqual({
        disciplinePoints: 98,
      });
    });

    it('leaves the score alone when only the wording changed', async () => {
      await service.updateIncident('inc-1', {
        description: 'Corrected wording',
      });
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('leaves the score alone when the points did not actually change', async () => {
      await service.updateIncident('inc-1', { pointsDeducted: 5 });
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('never takes a correction below zero either', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        disciplinePoints: 2,
      });
      await service.updateIncident('inc-1', { pointsDeducted: 50 });
      expect(prisma.student.update.mock.calls[0][0].data).toEqual({
        disciplinePoints: 0,
      });
    });

    it('changes the record even if the student has since left', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.updateIncident('inc-1', { pointsDeducted: 8 }),
      ).resolves.toBeDefined();
      expect(prisma.student.update).not.toHaveBeenCalled();
    });
  });

  /**
   * Striking an incident out has to give the points back. A student left
   * paying for an incident nobody can point at has no way to argue.
   */
  describe('striking an incident out', () => {
    it('gives back exactly what it took', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 'student-1',
        pointsDeducted: 5,
      });
      await service.deleteIncident('inc-1');
      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        data: { disciplinePoints: { increment: 5 } },
      });
      expect(prisma.disciplineIncident.delete).toHaveBeenCalled();
    });

    it('refuses one that does not exist', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue(null);
      await expect(service.deleteIncident('nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.student.update).not.toHaveBeenCalled();
    });
  });

  /**
   * An appeal is a family's only answer to a record the school wrote about
   * their child. It has to be theirs to make, and it has to be decided once.
   */
  describe('appeals', () => {
    beforeEach(() => {
      prisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 'student-1',
        pointsDeducted: 5,
        appeals: [],
      });
      prisma.disciplineAppeal.create.mockResolvedValue({ id: 'ap-1' });
      prisma.disciplineAppeal.update.mockResolvedValue({ id: 'ap-1' });
    });

    it('refuses an incident that does not exist', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue(null);
      await expect(
        service.createAppeal(
          { incidentId: 'nope', statement: 'He was helping' },
          'parent-1',
          'PARENT',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * Without this, anybody could appeal any incident by guessing an id, and
     * a successful appeal restores points to somebody else's child.
     */
    it('holds a parent to their own child', async () => {
      await service.createAppeal(
        { incidentId: 'inc-1', statement: 'He was helping' },
        'parent-1',
        'PARENT',
      );
      expect(ownership.verifyStudentAccess).toHaveBeenCalledWith(
        'parent-1',
        'PARENT',
        'student-1',
        'conduct',
      );
    });

    it('files nothing when the incident is not theirs', async () => {
      ownership.verifyStudentAccess.mockRejectedValue(
        new ForbiddenException('Not yours'),
      );
      await expect(
        service.createAppeal(
          { incidentId: 'inc-1', statement: 'x' },
          'parent-9',
          'PARENT',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.disciplineAppeal.create).not.toHaveBeenCalled();
    });

    // A second appeal while the first is undecided would give two answers to
    // one question.
    it('refuses a second appeal while one is still open', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 'student-1',
        appeals: [{ status: 'PENDING' }],
      });
      await expect(
        service.createAppeal(
          { incidentId: 'inc-1', statement: 'x' },
          'parent-1',
          'PARENT',
        ),
      ).rejects.toThrow(/already pending/i);
    });

    it('allows a fresh appeal after the last one was decided', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 'student-1',
        appeals: [{ status: 'REJECTED' }],
      });
      await expect(
        service.createAppeal(
          { incidentId: 'inc-1', statement: 'x' },
          'parent-1',
          'PARENT',
        ),
      ).resolves.toBeDefined();
    });

    it('stores no evidence rather than undefined when none was attached', async () => {
      await service.createAppeal(
        { incidentId: 'inc-1', statement: 'x' },
        'parent-1',
        'PARENT',
      );
      expect(
        prisma.disciplineAppeal.create.mock.calls[0][0].data.evidenceUrls,
      ).toEqual([]);
    });

    describe('deciding one', () => {
      beforeEach(() => {
        prisma.disciplineAppeal.findUnique.mockResolvedValue({
          id: 'ap-1',
          status: 'PENDING',
          incident: { studentId: 'student-1', pointsDeducted: 5 },
        });
      });

      it('refuses an appeal that does not exist', async () => {
        prisma.disciplineAppeal.findUnique.mockResolvedValue(null);
        await expect(
          service.reviewAppeal(
            'nope',
            { status: 'APPROVED' } as never,
            'admin-1',
          ),
        ).rejects.toThrow(NotFoundException);
      });

      // Deciding twice would restore the points twice.
      it('refuses one that was already decided', async () => {
        prisma.disciplineAppeal.findUnique.mockResolvedValue({
          id: 'ap-1',
          status: 'APPROVED',
          incident: { studentId: 'student-1', pointsDeducted: 5 },
        });
        await expect(
          service.reviewAppeal(
            'ap-1',
            { status: 'REJECTED' } as never,
            'admin-1',
          ),
        ).rejects.toThrow(/already been reviewed/i);
        expect(prisma.disciplineAppeal.update).not.toHaveBeenCalled();
      });

      it('gives the points back when the appeal is upheld', async () => {
        await service.reviewAppeal(
          'ap-1',
          { status: 'APPROVED' } as never,
          'admin-1',
        );
        expect(prisma.student.update).toHaveBeenCalledWith({
          where: { id: 'student-1' },
          data: { disciplinePoints: { increment: 5 } },
        });
      });

      it('leaves the points alone when it is not', async () => {
        await service.reviewAppeal(
          'ap-1',
          { status: 'REJECTED' } as never,
          'admin-1',
        );
        expect(prisma.student.update).not.toHaveBeenCalled();
      });

      it('records who decided it', async () => {
        await service.reviewAppeal(
          'ap-1',
          { status: 'APPROVED', reviewNotes: 'Fair point' } as never,
          'admin-1',
        );
        expect(
          prisma.disciplineAppeal.update.mock.calls[0][0].data,
        ).toMatchObject({
          status: 'APPROVED',
          reviewNotes: 'Fair point',
          reviewedByUserId: 'admin-1',
        });
      });
    });
  });

  /**
   * A parent saying they have seen an incident is the school's evidence that
   * the family was told. It has to be their own child's.
   */
  describe('a parent acknowledging an incident', () => {
    it('records the acknowledgement with the time', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        student: { parentStudents: [{ parentUserId: 'parent-1' }] },
      });
      await service.acknowledgeIncident('inc-1', 'parent-1');
      expect(
        prisma.disciplineIncident.update.mock.calls[0][0].data,
      ).toMatchObject({ parentAcknowledged: true });
      expect(
        prisma.disciplineIncident.update.mock.calls[0][0].data
          .parentAcknowledgedAt,
      ).toBeInstanceOf(Date);
    });

    it('refuses a parent who is not linked to the child', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        student: { parentStudents: [{ parentUserId: 'somebody-else' }] },
      });
      await expect(
        service.acknowledgeIncident('inc-1', 'parent-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.disciplineIncident.update).not.toHaveBeenCalled();
    });

    it('refuses an incident that does not exist', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue(null);
      await expect(
        service.acknowledgeIncident('nope', 'parent-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('one student’s record', () => {
    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.getStudentDiscipline('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('shows the standing against what everybody starts with', async () => {
      prisma.student.findUnique.mockResolvedValue({
        disciplinePoints: 82,
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      prisma.disciplineIncident.findMany.mockResolvedValue([
        { pointsDeducted: 8 },
        { pointsDeducted: 10 },
      ]);

      const record = await service.getStudentDiscipline('student-1');
      expect(record.student).toMatchObject({
        name: 'Divine Niyonkuru',
        currentPoints: 82,
        startingPoints: 100,
        percentage: 82,
      });
      expect(record.totalPointsDeducted).toBe(18);
      expect(record.totalIncidents).toBe(2);
    });

    it('uses the starting score the school set', async () => {
      prisma.schoolConfig.findFirst.mockResolvedValue({ value: '50' });
      prisma.student.findUnique.mockResolvedValue({
        disciplinePoints: 25,
        user: { firstName: 'A', lastName: 'B' },
      });
      prisma.disciplineIncident.findMany.mockResolvedValue([]);

      const record = await service.getStudentDiscipline('student-1');
      expect(record.student.percentage).toBe(50);
    });

    // A school that set the starting score to zero would otherwise divide by
    // it and show NaN on every student's page.
    it('shows a hundred rather than dividing by a starting score of zero', async () => {
      prisma.schoolConfig.findFirst.mockResolvedValue({ value: '0' });
      prisma.student.findUnique.mockResolvedValue({
        disciplinePoints: 0,
        user: { firstName: 'A', lastName: 'B' },
      });
      prisma.disciplineIncident.findMany.mockResolvedValue([]);

      const record = await service.getStudentDiscipline('student-1');
      expect(record.student.percentage).toBe(100);
    });

    // Forty a term is the default now, not a hundred for the whole year -
    // see src/common/conduct.ts for why conduct is marked per term.
    it('falls back to forty when the school never set one', async () => {
      prisma.schoolConfig.findFirst.mockResolvedValue(null);
      prisma.student.findUnique.mockResolvedValue({
        disciplinePoints: 32,
        user: { firstName: 'A', lastName: 'B' },
      });
      prisma.disciplineIncident.findMany.mockResolvedValue([]);

      const record = await service.getStudentDiscipline('student-1');
      expect(record.student.startingPoints).toBe(40);
      expect(record.student.percentage).toBe(80);
    });
  });

  describe('the register', () => {
    beforeEach(() => prisma.disciplineIncident.findMany.mockResolvedValue([]));

    it('narrows by student, term and class', async () => {
      await service.findIncidents({
        studentId: 'student-1',
        termId: 'term-1',
        classSectionId: 'section-1',
      });
      expect(prisma.disciplineIncident.findMany.mock.calls[0][0].where).toEqual(
        {
          studentId: 'student-1',
          termId: 'term-1',
          student: { classSectionId: 'section-1' },
        },
      );
    });

    it('narrows to a date range', async () => {
      await service.findIncidents({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      });
      const where = prisma.disciplineIncident.findMany.mock.calls[0][0].where;
      expect(where.date.gte).toBeInstanceOf(Date);
      expect(where.date.lte).toBeInstanceOf(Date);
    });

    it('reads newest first', async () => {
      await service.findIncidents({});
      expect(
        prisma.disciplineIncident.findMany.mock.calls[0][0].orderBy,
      ).toEqual({ createdAt: 'desc' });
    });

    it('refuses one incident that does not exist', async () => {
      prisma.disciplineIncident.findUnique.mockResolvedValue(null);
      await expect(service.getIncidentById('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('the school-wide picture', () => {
    it('counts by what was decided and who keeps appearing', async () => {
      prisma.disciplineIncident.findMany.mockResolvedValue([
        {
          studentId: 's-1',
          actionTaken: 'VERBAL_WARNING',
          pointsDeducted: 5,
          student: {
            classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
          },
        },
        {
          studentId: 's-1',
          actionTaken: 'DETENTION',
          pointsDeducted: 10,
          student: {
            classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
          },
        },
        {
          studentId: 's-2',
          actionTaken: 'VERBAL_WARNING',
          pointsDeducted: 5,
          student: {
            classSection: { name: 'B', classLevel: { name: 'Senior 1' } },
          },
        },
      ]);
      prisma.disciplineAppeal.count.mockResolvedValue(3);

      const dashboard = await service.getDashboard();
      expect(dashboard.totalIncidents).toBe(3);
      expect(dashboard.totalPointsDeducted).toBe(20);
      expect(dashboard.pendingAppeals).toBe(3);
      expect(dashboard.byAction).toEqual({
        VERBAL_WARNING: 2,
        DETENTION: 1,
      });
      expect(dashboard.topOffenders[0]).toMatchObject({
        count: 2,
        totalPoints: 15,
        class: 'Senior 1 A',
      });
    });

    // A list of forty names is a list nobody works through.
    it('shows at most ten names', async () => {
      prisma.disciplineIncident.findMany.mockResolvedValue(
        Array.from({ length: 25 }, (_, i) => ({
          studentId: `s-${i}`,
          actionTaken: 'VERBAL_WARNING',
          pointsDeducted: 5,
          student: {
            classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
          },
        })),
      );
      prisma.disciplineAppeal.count.mockResolvedValue(0);

      const dashboard = await service.getDashboard();
      expect(dashboard.topOffenders).toHaveLength(10);
    });

    it('narrows to a term when one is named', async () => {
      prisma.disciplineIncident.findMany.mockResolvedValue([]);
      prisma.disciplineAppeal.count.mockResolvedValue(0);
      await service.getDashboard('term-1');
      expect(prisma.disciplineIncident.findMany.mock.calls[0][0].where).toEqual(
        {
          termId: 'term-1',
        },
      );
    });
  });
});

/**
 * The incident register, read back over a date range.
 *
 * An inspector asks for one term, a head teacher for one week. Each end of
 * the range is applied on its own, so an open-ended one has to work from
 * either side.
 */
describe('filtering the incident register by date', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: DisciplineService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DisciplineService(prisma, {
      assertCanSee: jest.fn(),
    } as unknown as OwnershipService);
    prisma.disciplineIncident.findMany.mockResolvedValue([]);
    prisma.disciplineIncident.count.mockResolvedValue(0);
  });

  it('takes both ends of a term', async () => {
    await service.findIncidents({
      dateFrom: '2026-09-01',
      dateTo: '2026-12-15',
    });

    const where = prisma.disciplineIncident.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeInstanceOf(Date);
  });

  it('takes an open-ended range from one end', async () => {
    await service.findIncidents({ dateFrom: '2026-09-01' });

    const where = prisma.disciplineIncident.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeUndefined();
  });

  it('takes one from the other end', async () => {
    await service.findIncidents({ dateTo: '2026-12-15' });

    const where = prisma.disciplineIncident.findMany.mock.calls[0][0].where;
    expect(where.date.lte).toBeInstanceOf(Date);
    expect(where.date.gte).toBeUndefined();
  });

  it('takes the whole register when no range is given', async () => {
    await service.findIncidents({});

    expect(
      prisma.disciplineIncident.findMany.mock.calls[0][0].where.date,
    ).toBeUndefined();
  });
});

describe('correcting an incident', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: DisciplineService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DisciplineService(prisma, {
      assertCanSee: jest.fn(),
    } as unknown as OwnershipService);
    prisma.disciplineIncident.findUnique.mockResolvedValue({
      id: 'inc-1',
      studentId: 'student-1',
      pointsDeducted: 5,
    });
    prisma.disciplineIncident.update.mockResolvedValue({});
  });

  it('refuses to read one that is not there any more', async () => {
    prisma.disciplineIncident.findUnique.mockResolvedValue(null);

    await expect(service.getIncidentById('gone')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('changes the action taken when a new one was sent', async () => {
    await service.updateIncident('inc-1', {
      actionTaken: 'DETENTION',
    } as never);

    expect(
      prisma.disciplineIncident.update.mock.calls[0][0].data,
    ).toMatchObject({ actionTaken: 'DETENTION' });
  });

  it('leaves the action alone when none was sent', async () => {
    await service.updateIncident('inc-1', {
      description: 'Corrected wording',
    });

    expect(
      prisma.disciplineIncident.update.mock.calls[0][0].data.actionTaken,
    ).toBeUndefined();
  });
});
