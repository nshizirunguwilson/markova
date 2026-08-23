import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClinicService } from './clinic.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The sick bay.
 *
 * The tests worth having are the ones that would matter to a child: who is
 * allowed to read a health record, that a second dose cannot be given by
 * accident, and that nothing written down can be quietly removed.
 */
describe('ClinicService', () => {
  let service: ClinicService;

  const prisma: any = {
    clinicVisit: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    medicationAdministration: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    studentHealthRecord: { upsert: jest.fn() },
    student: { findUnique: jest.fn(), findMany: jest.fn() },
    parentStudent: { findFirst: jest.fn() },
  };

  const visit = {
    studentId: 'student-1',
    complaint: 'Headache since morning',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.student.findUnique.mockResolvedValue({ id: 'student-1' });
    prisma.clinicVisit.create.mockResolvedValue({ id: 'visit-1' });
    prisma.clinicVisit.update.mockResolvedValue({ id: 'visit-1' });
    prisma.medicationAdministration.findFirst.mockResolvedValue(null);
    prisma.medicationAdministration.create.mockResolvedValue({ id: 'dose-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClinicService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ClinicService);
  });

  /**
   * A health record is the narrowest thing in the system. A class teacher has
   * no business knowing a student is on epilepsy medication.
   */
  describe('who may read a health record', () => {
    it.each([Role.NURSE, Role.MATRON, Role.PATRON, Role.ADMIN])(
      'lets %s see any student',
      async (role) => {
        await expect(
          service.assertMaySee('student-1', { userId: 'u-1', role }),
        ).resolves.toBeUndefined();
      },
    );

    it('refuses a teacher, however senior', async () => {
      await expect(
        service.assertMaySee('student-1', { userId: 'u-1', role: Role.TEACHER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a librarian', async () => {
      await expect(
        service.assertMaySee('student-1', { userId: 'u-1', role: Role.LIBRARIAN }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a parent see their own child', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue({ id: 'link-1' });
      await expect(
        service.assertMaySee('student-1', { userId: 'p-1', role: Role.PARENT }),
      ).resolves.toBeUndefined();
    });

    it('refuses a parent asking about somebody else', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue(null);
      await expect(
        service.assertMaySee('student-1', { userId: 'p-1', role: Role.PARENT }),
      ).rejects.toThrow(/own child/i);
    });

    it('lets a student see their own record', async () => {
      prisma.student.findUnique.mockResolvedValue({ userId: 'u-me' });
      await expect(
        service.assertMaySee('student-1', { userId: 'u-me', role: Role.STUDENT }),
      ).resolves.toBeUndefined();
    });

    it('refuses a student reading a classmate', async () => {
      prisma.student.findUnique.mockResolvedValue({ userId: 'u-other' });
      await expect(
        service.assertMaySee('student-1', { userId: 'u-me', role: Role.STUDENT }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('a student arrives at the sick bay', () => {
    it('records the complaint and who saw them', async () => {
      await service.createVisit(visit, 'nurse-1');
      expect(prisma.clinicVisit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'student-1',
            complaint: 'Headache since morning',
            seenByUserId: 'nurse-1',
          }),
        }),
      );
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.createVisit(visit, 'nurse-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    // A referral with no destination is a child sent somewhere nobody can name.
    it('refuses a referral that does not say where to', async () => {
      await expect(
        service.createVisit(
          { ...visit, outcome: 'REFERRED_OUT' as any },
          'nurse-1',
        ),
      ).rejects.toThrow(/where the student was referred/i);
    });

    it('accepts a referral that names the place', async () => {
      await service.createVisit(
        {
          ...visit,
          outcome: 'REFERRED_OUT' as any,
          referredTo: 'Kacyiru Health Centre',
        },
        'nurse-1',
      );
      expect(prisma.clinicVisit.create).toHaveBeenCalled();
    });
  });

  /**
   * Nothing here is ever deleted. A health record that can be tidied away is
   * worth nothing the day somebody has to account for what happened.
   */
  describe('correcting what was written', () => {
    it('updates rather than deletes', async () => {
      prisma.clinicVisit.findUnique.mockResolvedValue({
        id: 'visit-1',
        outcome: 'RETURNED_TO_CLASS',
        referredTo: null,
      });
      await service.updateVisit('visit-1', { temperature: 38.2 });
      expect(prisma.clinicVisit.update).toHaveBeenCalled();
      expect(prisma.clinicVisit.delete).not.toHaveBeenCalled();
    });

    it('exposes no way to delete a visit at all', () => {
      expect((service as any).removeVisit).toBeUndefined();
      expect((service as any).deleteVisit).toBeUndefined();
    });

    it('still insists a referral says where to', async () => {
      prisma.clinicVisit.findUnique.mockResolvedValue({
        id: 'visit-1',
        outcome: 'RETURNED_TO_CLASS',
        referredTo: null,
      });
      await expect(
        service.updateVisit('visit-1', { outcome: 'REFERRED_OUT' as any }),
      ).rejects.toThrow(/where the student was referred/i);
    });

    it('accepts the outcome change when the place is already on record', async () => {
      prisma.clinicVisit.findUnique.mockResolvedValue({
        id: 'visit-1',
        outcome: 'RESTING_IN_SICK_BAY',
        referredTo: 'Kacyiru Health Centre',
      });
      await service.updateVisit('visit-1', { outcome: 'REFERRED_OUT' as any });
      expect(prisma.clinicVisit.update).toHaveBeenCalled();
    });
  });

  describe('the sick bay list', () => {
    it('discharges a student and dates it', async () => {
      prisma.clinicVisit.findUnique.mockResolvedValue({
        id: 'visit-1',
        dischargedAt: null,
      });
      await service.discharge('visit-1');
      expect(
        prisma.clinicVisit.update.mock.calls[0][0].data.dischargedAt,
      ).toBeInstanceOf(Date);
    });

    it('refuses to discharge somebody twice', async () => {
      prisma.clinicVisit.findUnique.mockResolvedValue({
        id: 'visit-1',
        dischargedAt: new Date(),
      });
      await expect(service.discharge('visit-1')).rejects.toThrow(
        /already been discharged/i,
      );
    });

    // "Who is lying in the sick bay right now" is kept in and not yet let out.
    it('asks for the ones kept in and not discharged', async () => {
      prisma.clinicVisit.findMany.mockResolvedValue([]);
      prisma.clinicVisit.count.mockResolvedValue(0);
      await service.findVisits({ inSickBay: 'true' });
      const where = prisma.clinicVisit.findMany.mock.calls[0][0].where;
      expect(where.outcome).toBe('RESTING_IN_SICK_BAY');
      expect(where.dischargedAt).toBeNull();
    });

    it('reads newest first, the way a clinic book is read', async () => {
      prisma.clinicVisit.findMany.mockResolvedValue([]);
      prisma.clinicVisit.count.mockResolvedValue(0);
      await service.findVisits({});
      expect(prisma.clinicVisit.findMany.mock.calls[0][0].orderBy).toEqual({
        visitedAt: 'desc',
      });
    });

    it('pages', async () => {
      prisma.clinicVisit.findMany.mockResolvedValue([]);
      prisma.clinicVisit.count.mockResolvedValue(45);
      const result = await service.findVisits({ page: 2, limit: 20 });
      expect(prisma.clinicVisit.findMany.mock.calls[0][0].skip).toBe(20);
      expect(result.meta).toEqual({
        total: 45,
        page: 2,
        limit: 20,
        totalPages: 3,
      });
    });
  });

  /**
   * A parent should not learn from their child that the school kept them in
   * the sick bay overnight.
   */
  describe('telling the family', () => {
    it('dates the notification', async () => {
      prisma.clinicVisit.findUnique.mockResolvedValue({
        id: 'visit-1',
        parentNotifiedAt: null,
      });
      await service.markParentNotified('visit-1');
      expect(
        prisma.clinicVisit.update.mock.calls[0][0].data.parentNotifiedAt,
      ).toBeInstanceOf(Date);
    });

    // The first call is the one that matters, so a second click must not move
    // the time and make a late notification look prompt.
    it('keeps the first time it was told', async () => {
      const first = new Date('2026-08-20T10:00:00Z');
      prisma.clinicVisit.findUnique.mockResolvedValue({
        id: 'visit-1',
        parentNotifiedAt: first,
      });
      await service.markParentNotified('visit-1');
      expect(
        prisma.clinicVisit.update.mock.calls[0][0].data.parentNotifiedAt,
      ).toBe(first);
    });
  });

  /**
   * The dangerous one. A student given paracetamol an hour ago who asks a
   * different member of staff must not get a second dose because the first was
   * in somebody else's handwriting.
   */
  describe('giving medicine', () => {
    it('records the dose and who gave it', async () => {
      await service.giveMedicine(
        { studentId: 'student-1', medicine: 'Paracetamol', dose: '500mg' },
        'nurse-1',
      );
      expect(prisma.medicationAdministration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            medicine: 'Paracetamol',
            dose: '500mg',
            givenByUserId: 'nurse-1',
          }),
        }),
      );
    });

    it('refuses the same medicine again within four hours', async () => {
      prisma.medicationAdministration.findFirst.mockResolvedValue({
        givenAt: new Date(Date.now() - 60 * 60 * 1000),
        dose: '500mg',
      });
      await expect(
        service.giveMedicine(
          { studentId: 'student-1', medicine: 'Paracetamol', dose: '500mg' },
          'matron-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.medicationAdministration.create).not.toHaveBeenCalled();
    });

    // A refusal that says "not allowed" sends staff hunting. One that says how
    // long ago and how much lets them make the call.
    it('says how long ago and how much', async () => {
      prisma.medicationAdministration.findFirst.mockResolvedValue({
        givenAt: new Date(Date.now() - 90 * 60 * 1000),
        dose: '500mg',
      });
      await expect(
        service.giveMedicine(
          { studentId: 'student-1', medicine: 'Paracetamol', dose: '500mg' },
          'matron-1',
        ),
      ).rejects.toThrow(/90 minutes ago \(500mg\)/);
    });

    // Handwriting varies; the safety check must not.
    it('catches a repeat typed in different case', async () => {
      prisma.medicationAdministration.findFirst.mockResolvedValue({
        givenAt: new Date(Date.now() - 30 * 60 * 1000),
        dose: '500mg',
      });
      await service.giveMedicine
        .call(service, { studentId: 'student-1', medicine: 'paracetamol', dose: '500mg' }, 'n-1')
        .catch(() => null);
      expect(prisma.medicationAdministration.findFirst.mock.calls[0][0].where.medicine).toEqual({
        equals: 'paracetamol',
        mode: 'insensitive',
      });
    });

    it('allows a different medicine straight away', async () => {
      prisma.medicationAdministration.findFirst.mockResolvedValue(null);
      await service.giveMedicine(
        { studentId: 'student-1', medicine: 'Ibuprofen', dose: '200mg' },
        'nurse-1',
      );
      expect(prisma.medicationAdministration.create).toHaveBeenCalled();
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.giveMedicine(
          { studentId: 'nobody', medicine: 'Paracetamol', dose: '500mg' },
          'nurse-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('the emergency card', () => {
    it('is returned even when nobody has filled one in', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        bloodType: 'O+',
        allergies: 'Penicillin',
        healthRecord: null,
        parentStudents: [],
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      prisma.clinicVisit.findMany.mockResolvedValue([]);
      prisma.medicationAdministration.findMany.mockResolvedValue([]);

      const card = await service.emergencyCard('student-1');
      expect(card.student.bloodType).toBe('O+');
      expect(card.student.allergies).toBe('Penicillin');
    });

    it('carries the recent history somebody would need', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        healthRecord: null,
        parentStudents: [],
        user: { firstName: 'Divine', lastName: 'Niyonkuru' },
      });
      prisma.clinicVisit.findMany.mockResolvedValue([{ id: 'visit-1' }]);
      prisma.medicationAdministration.findMany.mockResolvedValue([{ id: 'dose-1' }]);

      const card = await service.emergencyCard('student-1');
      expect(card.recentVisits).toHaveLength(1);
      expect(card.recentMedication).toHaveLength(1);
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.emergencyCard('nobody')).rejects.toThrow(
        NotFoundException,
      );
    });

    // The card exists from the day a student enrolls; asking somebody to
    // "create" one first is a step that gets skipped.
    it('is saved without needing to be created first', async () => {
      prisma.studentHealthRecord.upsert.mockResolvedValue({ id: 'rec-1' });
      await service.saveHealthRecord(
        'student-1',
        { chronicConditions: 'Asthma' },
        'nurse-1',
      );
      expect(prisma.studentHealthRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 'student-1' },
          create: expect.objectContaining({ chronicConditions: 'Asthma' }),
        }),
      );
    });

    it('records who last changed it', async () => {
      prisma.studentHealthRecord.upsert.mockResolvedValue({ id: 'rec-1' });
      await service.saveHealthRecord('student-1', { allergyNotes: 'Peanuts' }, 'nurse-1');
      expect(
        prisma.studentHealthRecord.upsert.mock.calls[0][0].update.updatedByUserId,
      ).toBe('nurse-1');
    });
  });

  /**
   * A child in the sick bay three times in a month is a pattern, not a run of
   * bad luck, and somebody should be asking why.
   */
  describe('what the school needs to see', () => {
    beforeEach(() => {
      prisma.clinicVisit.count.mockResolvedValue(0);
      prisma.medicationAdministration.count.mockResolvedValue(0);
      prisma.clinicVisit.groupBy.mockResolvedValue([]);
      prisma.student.findMany.mockResolvedValue([]);
    });

    it('counts visits over the window asked for', async () => {
      const result = await service.summary(7);
      expect(result.days).toBe(7);
      const where = prisma.clinicVisit.count.mock.calls[0][0].where;
      expect(where.visitedAt.gte).toBeInstanceOf(Date);
    });

    it('names the students who keep coming back', async () => {
      prisma.clinicVisit.groupBy.mockResolvedValue([
        { studentId: 'student-1', _count: { _all: 4 } },
      ]);
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-2025-231419-167',
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
          classSection: { name: 'A' },
        },
      ]);

      const result = await service.summary(30);
      expect(result.repeatVisitors).toHaveLength(1);
      expect(result.repeatVisitors[0].visits).toBe(4);
    });

    // Two visits in a month is a cold, not a pattern. Flagging it would train
    // everyone to ignore the list.
    it('does not flag a student who came twice', async () => {
      prisma.clinicVisit.groupBy.mockResolvedValue([
        { studentId: 'student-1', _count: { _all: 2 } },
      ]);
      const result = await service.summary(30);
      expect(result.repeatVisitors).toEqual([]);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    });

    it('counts who is in the sick bay right now, ignoring the window', async () => {
      await service.summary(30);
      const sickBayCall = prisma.clinicVisit.count.mock.calls.find(
        (c: any[]) => c[0].where.dischargedAt === null,
      );
      expect(sickBayCall[0].where.visitedAt).toBeUndefined();
    });
  });
});
