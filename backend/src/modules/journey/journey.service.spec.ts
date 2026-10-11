import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JourneyService } from './journey.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * A student's journey (B8 and A9 in docs/BLIND-SPOTS.md): the only way a
 * standing changes, and what each change does.
 */
describe('JourneyService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let messaging: { ensureClassGroup: jest.Mock };
  let service: JourneyService;

  const keza = (over: Record<string, unknown> = {}) => ({
    id: 'student-1',
    userId: 'user-1',
    status: 'ACTIVE',
    classSectionId: 'section-1',
    user: { firstName: 'Keza', lastName: 'Habimana' },
    ...over,
  });

  beforeEach(() => {
    prisma = createMockPrisma();
    messaging = { ensureClassGroup: jest.fn().mockResolvedValue('group-1') };
    service = new JourneyService(prisma, messaging as never);
    prisma.student.findUnique.mockResolvedValue(keza());
    prisma.studentPause.findFirst.mockResolvedValue(null);
    prisma.studentPause.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'pause-1', ...data }),
    );
    prisma.studentJourneyEntry.findMany.mockResolvedValue([]);
    prisma.studentJourneyEntry.create.mockResolvedValue({});
  });

  const entry = () => prisma.studentJourneyEntry.create.mock.calls[0][0].data;

  describe('a suspension', () => {
    const week = {
      startsOn: '2026-10-13',
      endsOn: '2026-10-17',
      reason: 'Fighting in the dormitory',
    };

    it('records the days and writes it into the journey', async () => {
      const pause = await service.pause(
        'student-1',
        'SUSPENDED',
        week,
        'admin-1',
      );
      expect(pause).toMatchObject({
        kind: 'SUSPENDED',
        startsOn: new Date('2026-10-13T00:00:00Z'),
        endsOn: new Date('2026-10-17T00:00:00Z'),
        reason: 'Fighting in the dormitory',
        recordedByUserId: 'admin-1',
      });
      expect(entry()).toMatchObject({
        step: 'SUSPENDED',
        happenedOn: new Date('2026-10-13T00:00:00Z'),
        until: new Date('2026-10-17T00:00:00Z'),
      });
    });

    it('needs the day it ends', async () => {
      await expect(
        service.pause(
          'student-1',
          'SUSPENDED',
          { ...week, endsOn: undefined },
          'a',
        ),
      ).rejects.toThrow(/needs the day it ends/);
    });

    it('cannot end before it starts', async () => {
      await expect(
        service.pause(
          'student-1',
          'SUSPENDED',
          { ...week, endsOn: '2026-10-12' },
          'a',
        ),
      ).rejects.toThrow(/cannot be before/);
    });

    it('refuses days already covered by another pause', async () => {
      prisma.studentPause.findFirst.mockResolvedValue({ kind: 'AWAY' });
      await expect(
        service.pause('student-1', 'SUSPENDED', week, 'a'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.studentPause.create).not.toHaveBeenCalled();
    });

    it('refuses a student who is not on the roll', async () => {
      prisma.student.findUnique.mockResolvedValue(
        keza({ status: 'WITHDRAWN' }),
      );
      await expect(
        service.pause('student-1', 'SUSPENDED', week, 'a'),
      ).rejects.toThrow(/not on the roll \(withdrawn\)/);
    });

    it('refuses a discipline record about somebody else', async () => {
      prisma.disciplineIncident.findFirst.mockResolvedValue(null);
      await expect(
        service.pause(
          'student-1',
          'SUSPENDED',
          { ...week, disciplineIncidentId: 'inc-other' },
          'a',
        ),
      ).rejects.toThrow(/not about this student/);
    });

    it('keeps the discipline record it was decided on', async () => {
      prisma.disciplineIncident.findFirst.mockResolvedValue({ id: 'inc-1' });
      const pause = await service.pause(
        'student-1',
        'SUSPENDED',
        { ...week, disciplineIncidentId: 'inc-1' },
        'a',
      );
      expect(pause.disciplineIncidentId).toBe('inc-1');
    });
  });

  describe('time away', () => {
    it('may be open, its end not known yet', async () => {
      const pause = await service.pause(
        'student-1',
        'AWAY',
        { startsOn: '2026-10-01', reason: 'Recovering from an operation' },
        'a',
      );
      expect(pause.endsOn).toBeNull();
      expect(entry().step).toBe('AWAY');
    });
  });

  describe('coming back', () => {
    it('ends the pause the day before', async () => {
      prisma.studentPause.findFirst.mockResolvedValue({
        id: 'pause-1',
        startsOn: new Date('2026-10-01T00:00:00Z'),
        endsOn: null,
      });
      await service.back('student-1', { on: '2026-10-21' }, 'a');
      expect(prisma.studentPause.update).toHaveBeenCalledWith({
        where: { id: 'pause-1' },
        data: { endsOn: new Date('2026-10-20T00:00:00Z') },
      });
      expect(entry()).toMatchObject({
        step: 'BACK',
        happenedOn: new Date('2026-10-21T00:00:00Z'),
      });
    });

    it('cancels a pause that had not started yet, and keeps it in the record', async () => {
      prisma.studentPause.findFirst.mockResolvedValue({
        id: 'pause-1',
        startsOn: new Date('2026-10-25T00:00:00Z'),
        endsOn: new Date('2026-10-30T00:00:00Z'),
      });
      await service.back('student-1', { on: '2026-10-21' }, 'a');
      expect(prisma.studentPause.update).toHaveBeenCalledWith({
        where: { id: 'pause-1' },
        data: { endsOn: new Date('2026-10-24T00:00:00Z') },
      });
      expect(prisma.studentPause.delete).not.toHaveBeenCalled();
    });

    it('says so when there is nothing to come back from', async () => {
      await expect(service.back('student-1', {}, 'a')).rejects.toThrow(
        /is not suspended or away/,
      );
    });
  });

  describe('leaving', () => {
    const leave = (status: string) =>
      service.leave(
        'student-1',
        { status: status as never, on: '2026-10-12', reason: 'Family moved' },
        'admin-1',
      );

    it.each(['WITHDRAWN', 'EXPELLED', 'TRANSFERRED', 'GRADUATED'])(
      'takes a %s student off the roll and revokes the card',
      async (status) => {
        await leave(status);
        expect(prisma.student.update).toHaveBeenCalledWith({
          where: { id: 'student-1' },
          data: {
            status,
            nfcCardId: null,
            cardIssuedAt: null,
            cardCode: null,
            cardSuspendedAt: null,
          },
        });
        expect(entry()).toMatchObject({ step: status, reason: 'Family moved' });
      },
    );

    it('lets the class chat let them go', async () => {
      await leave('WITHDRAWN');
      expect(messaging.ensureClassGroup).toHaveBeenCalledWith('section-1');
    });

    it('ends a pause still running, and cancels one booked for later', async () => {
      await leave('WITHDRAWN');
      const [running, later] = prisma.studentPause.updateMany.mock.calls.map(
        (c: any) => c[0],
      );
      expect(running.data).toEqual({
        endsOn: new Date('2026-10-11T00:00:00Z'),
      });
      expect(later.where.startsOn).toEqual({
        gt: new Date('2026-10-12T00:00:00Z'),
      });
    });

    it('leaves their account open, for their report cards', async () => {
      await leave('GRADUATED');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('is not a way of passing away, or of being on the roll', async () => {
      await expect(leave('PASSED_AWAY')).rejects.toThrow(BadRequestException);
      await expect(leave('ACTIVE')).rejects.toThrow(BadRequestException);
    });

    it('refuses a student who already left', async () => {
      prisma.student.findUnique.mockResolvedValue(keza({ status: 'EXPELLED' }));
      await expect(leave('WITHDRAWN')).rejects.toThrow(
        /already left \(expelled\)/,
      );
    });
  });

  describe('a student who passed away', () => {
    it('closes their account and keeps the record', async () => {
      await service.passedAway('student-1', { on: '2026-10-10' }, 'admin-1');
      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PASSED_AWAY',
            cardCode: null,
          }),
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          isActive: false,
          passedAwayOn: new Date('2026-10-10T00:00:00Z'),
        },
      });
      expect(entry()).toMatchObject({ step: 'PASSED_AWAY', reason: null });
      expect(prisma.student.delete).not.toHaveBeenCalled();
    });

    it('may be recorded for a student who had already left', async () => {
      prisma.student.findUnique.mockResolvedValue(
        keza({ status: 'GRADUATED' }),
      );
      await expect(
        service.passedAway('student-1', { on: '2026-10-10' }, 'a'),
      ).resolves.toBeDefined();
    });

    it('is recorded once', async () => {
      prisma.student.findUnique.mockResolvedValue(
        keza({ status: 'PASSED_AWAY' }),
      );
      await expect(
        service.passedAway('student-1', { on: '2026-10-10' }, 'a'),
      ).rejects.toThrow(/already been recorded/);
    });
  });

  describe('coming back after leaving', () => {
    const readmit = () =>
      service.readmit(
        'student-1',
        {
          on: '2027-01-11',
          classSectionId: 'section-2',
          reason: 'Back after her baby was born',
        },
        'admin-1',
      );

    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue(
        keza({ status: 'WITHDRAWN' }),
      );
      prisma.classSection.findUnique.mockResolvedValue({ id: 'section-2' });
    });

    it('puts them back on the roll, in the class chosen, keeping their history', async () => {
      await readmit();
      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        data: { status: 'ACTIVE', classSectionId: 'section-2' },
      });
      expect(entry()).toMatchObject({
        step: 'READMITTED',
        classSectionId: 'section-2',
      });
      expect(messaging.ensureClassGroup).toHaveBeenCalledWith('section-2');
      expect(prisma.studentJourneyEntry.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses a student on the roll', async () => {
      prisma.student.findUnique.mockResolvedValue(keza());
      await expect(readmit()).rejects.toThrow(/is on the roll/);
    });

    it('refuses a student who passed away', async () => {
      prisma.student.findUnique.mockResolvedValue(
        keza({ status: 'PASSED_AWAY' }),
      );
      await expect(readmit()).rejects.toThrow(/cannot be readmitted/);
    });

    it('refuses a class that is not there', async () => {
      prisma.classSection.findUnique.mockResolvedValue(null);
      await expect(readmit()).rejects.toThrow(NotFoundException);
    });
  });

  describe('a parent who passed away', () => {
    const mother = (children: any[]) => ({
      id: 'parent-1',
      role: 'PARENT',
      firstName: 'Claudine',
      lastName: 'Uwase',
      passedAwayOn: null,
      parentStudents: children,
    });
    const child = (id: string, status = 'ACTIVE') => ({
      relationship: 'Mother',
      student: {
        id,
        status,
        classSectionId: `section-of-${id}`,
        user: { firstName: 'Keza', lastName: 'Habimana' },
      },
    });

    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([{ id: 'principal-1' }]);
      prisma.teacherRole.findFirst.mockResolvedValue({
        teacher: { userId: 'class-teacher-1' },
      });
    });

    const notified = () =>
      prisma.notification.create.mock.calls.map((c: any) => ({
        to: c[0].data.userId,
        title: c[0].data.title,
      }));

    it('closes their account so nothing more is sent to them', async () => {
      prisma.user.findUnique.mockResolvedValue(mother([]));
      await service.parentPassedAway('parent-1', { on: '2026-10-10' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'parent-1' },
        data: {
          isActive: false,
          passedAwayOn: new Date('2026-10-10T00:00:00Z'),
        },
      });
    });

    it('tells the class teacher privately', async () => {
      prisma.user.findUnique.mockResolvedValue(mother([child('s1')]));
      prisma.parentStudent.count.mockResolvedValue(1);
      await service.parentPassedAway('parent-1', { on: '2026-10-10' });
      expect(notified()).toEqual([
        {
          to: 'class-teacher-1',
          title: "Keza Habimana's mother has passed away",
        },
      ]);
    });

    it('puts a child left with nobody to the principal', async () => {
      prisma.user.findUnique.mockResolvedValue(mother([child('s1')]));
      prisma.parentStudent.count.mockResolvedValue(0);
      const result = await service.parentPassedAway('parent-1', {
        on: '2026-10-10',
      });
      expect(result.childrenWithoutGuardian).toEqual(['s1']);
      expect(notified()).toContainEqual({
        to: 'principal-1',
        title: 'Keza Habimana has no parent or guardian left in Markova',
      });
    });

    it('counts only the other parents who are still with us', async () => {
      prisma.user.findUnique.mockResolvedValue(mother([child('s1')]));
      prisma.parentStudent.count.mockResolvedValue(0);
      await service.parentPassedAway('parent-1', { on: '2026-10-10' });
      expect(prisma.parentStudent.count).toHaveBeenCalledWith({
        where: {
          studentId: 's1',
          parentUserId: { not: 'parent-1' },
          parent: { isActive: true },
        },
      });
    });

    it('leaves out children who have already left the school', async () => {
      prisma.user.findUnique.mockResolvedValue(
        mother([child('s1', 'GRADUATED')]),
      );
      await service.parentPassedAway('parent-1', { on: '2026-10-10' });
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('is for a parent only, and recorded once', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mother([]),
        role: 'TEACHER',
      });
      await expect(
        service.parentPassedAway('parent-1', { on: '2026-10-10' }),
      ).rejects.toThrow(/parent or guardian/);
      prisma.user.findUnique.mockResolvedValue({
        ...mother([]),
        passedAwayOn: new Date(),
      });
      await expect(
        service.parentPassedAway('parent-1', { on: '2026-10-10' }),
      ).rejects.toThrow(/already been recorded/);
    });
  });

  describe('reading a journey', () => {
    it('says where the student stands and what is paused today', async () => {
      const yesterday = new Date(Date.now() - 2 * 24 * 3600 * 1000);
      prisma.studentPause.findMany.mockResolvedValue([
        { kind: 'SUSPENDED', startsOn: yesterday, endsOn: null },
      ]);
      const result = await service.journey('student-1');
      expect(result.label).toBe('On the roll');
      expect(result.pause?.kind).toBe('SUSPENDED');
      expect(result.stops.classChat).toBe('read-only');
      expect(result.upcoming).toBeNull();
    });

    it('refuses a student who is not there', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.journey('nobody')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
