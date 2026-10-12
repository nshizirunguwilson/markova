import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PhotoConsentService } from './photo-consent.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * A student's photo (B6): a parent answers for a child, the student from 18,
 * and the office copies in a paper form. Every answer is kept.
 */
describe('PhotoConsentService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let ownership: { verifyStudentAccess: jest.Mock };
  let service: PhotoConsentService;

  const child = new Date('2012-03-01T00:00:00Z');
  const adult = new Date('2000-03-01T00:00:00Z');
  const student = (dateOfBirth: Date | null = child) => ({
    id: 's1',
    dateOfBirth,
    photoForId: 'NOT_ASKED',
    photoInApp: 'NOT_ASKED',
    photoPublicity: 'NOT_ASKED',
    user: { firstName: 'Keza' },
  });
  const yes = { forId: 'YES', inApp: 'NO', publicity: 'NO' } as const;

  beforeEach(() => {
    prisma = createMockPrisma();
    ownership = { verifyStudentAccess: jest.fn().mockResolvedValue(undefined) };
    service = new PhotoConsentService(prisma, ownership as never);
    prisma.student.findUnique.mockResolvedValue(student());
    prisma.photoConsentRecord.findMany.mockResolvedValue([]);
    prisma.photoConsentRecord.create.mockResolvedValue({});
    prisma.student.update.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({
      firstName: 'Jean',
      lastName: 'Habimana',
    });
  });

  describe('reading the answers', () => {
    it('shows a parent their child’s answers, and lets them answer', async () => {
      const r = await service.forStudent('s1', { id: 'p1', role: 'PARENT' });
      expect(ownership.verifyStudentAccess).toHaveBeenCalledWith(
        'p1',
        'PARENT',
        's1',
      );
      expect(r).toMatchObject({
        forId: 'NOT_ASKED',
        answeredBy: 'FAMILY',
        mayAnswer: true,
      });
    });

    it('hands the answer to the student from 18, not the parent', async () => {
      prisma.student.findUnique.mockResolvedValue(student(adult));
      const parent = await service.forStudent('s1', {
        id: 'p1',
        role: 'PARENT',
      });
      expect(parent).toMatchObject({ answeredBy: 'STUDENT', mayAnswer: false });
      const self = await service.forStudent('s1', {
        id: 'u1',
        role: 'STUDENT',
      });
      expect(self.mayAnswer).toBe(true);
    });

    it('lets a student under 18 see the answers but not give them', async () => {
      const r = await service.forStudent('s1', { id: 'u1', role: 'STUDENT' });
      expect(r.mayAnswer).toBe(false);
    });

    it('lets the office read any student’s, and copy in a form', async () => {
      const r = await service.forStudent('s1', { id: 'a', role: 'ADMIN' });
      expect(ownership.verifyStudentAccess).not.toHaveBeenCalled();
      expect(r.mayAnswer).toBe(true);
    });

    it('says when there is no such student', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.forStudent('nobody', { id: 'a', role: 'ADMIN' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses another family', async () => {
      ownership.verifyStudentAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        service.forStudent('s1', { id: 'p2', role: 'PARENT' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('answering', () => {
    it('keeps a parent’s answer, by name, and changes what the school uses', async () => {
      await service.answer('s1', yes, { id: 'p1', role: 'PARENT' });
      expect(prisma.photoConsentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: 's1',
          forId: 'YES',
          inApp: 'NO',
          publicity: 'NO',
          how: 'IN_THE_APP',
          answeredBy: 'Jean Habimana (parent)',
          recordedByUserId: 'p1',
        }),
      });
      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { photoForId: 'YES', photoInApp: 'NO', photoPublicity: 'NO' },
      });
    });

    it('refuses a parent once the student is 18, and says who decides', async () => {
      prisma.student.findUnique.mockResolvedValue(student(adult));
      await expect(
        service.answer('s1', yes, { id: 'p1', role: 'PARENT' }),
      ).rejects.toThrow('Keza is 18 or over, so Keza decides this now.');
      expect(prisma.photoConsentRecord.create).not.toHaveBeenCalled();
    });

    it('lets a student of 18 answer for themselves', async () => {
      prisma.student.findUnique.mockResolvedValue(student(adult));
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Keza',
        lastName: 'Uwase',
      });
      await service.answer('s1', yes, { id: 'u1', role: 'STUDENT' });
      expect(
        prisma.photoConsentRecord.create.mock.calls[0][0].data.answeredBy,
      ).toBe('Keza Uwase (the student)');
    });

    it('refuses a student under 18', async () => {
      await expect(
        service.answer('s1', yes, { id: 'u1', role: 'STUDENT' }),
      ).rejects.toThrow(/Until you are 18 your parents answer this/);
    });

    it('copies a paper form in, naming who signed it', async () => {
      await service.answer(
        's1',
        { ...yes, answeredBy: '  Marie Mukamana (mother) ' },
        { id: 'a', role: 'ADMIN' },
      );
      expect(
        prisma.photoConsentRecord.create.mock.calls[0][0].data,
      ).toMatchObject({
        how: 'PAPER_FORM',
        answeredBy: 'Marie Mukamana (mother)',
        recordedByUserId: 'a',
      });
    });

    it('will not copy a paper form in without a name', async () => {
      await expect(
        service.answer('s1', yes, { id: 'a', role: 'ADMIN' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('the office list', () => {
    const row = (name: string, cls: string, over: Record<string, unknown>) => ({
      id: name,
      userId: `u-${name}`,
      studentIdNumber: `STD-${name}`,
      photoForId: 'YES',
      photoInApp: 'YES',
      photoPublicity: 'YES',
      user: { firstName: name, lastName: 'X', photoUrl: '/p.jpg' },
      classSection: {
        name: cls,
        classLevel: { name: 'Senior 1' },
        trade: null,
      },
      ...over,
    });

    it('counts who may appear, who may not, and who was never asked', async () => {
      prisma.student.findMany.mockResolvedValue([
        row('Eric', 'B', {}),
        row('Aline', 'A', { photoPublicity: 'NOT_ASKED' }),
        row('Keza', 'A', {
          photoInApp: 'NO',
          photoForId: 'NO',
          photoPublicity: 'NO',
        }),
      ]);
      const r = await service.register();
      expect(r.counts).toEqual({
        students: 3,
        notAsked: 1,
        mayPublish: 1,
        notInApp: 1,
        notOnCard: 1,
      });
      expect(r.students.map((s) => s.name)).toEqual([
        'Aline X',
        'Keza X',
        'Eric X',
      ]);
      expect(r.students[0]).toMatchObject({
        hasPhoto: true,
        publicity: 'NOT_ASKED',
      });
    });

    it('lists only students on the roll', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      await service.register();
      expect(prisma.student.findMany.mock.calls[0][0].where).toEqual({
        status: 'ACTIVE',
      });
    });
  });

  it('lets nobody else answer, nor see the form', async () => {
    const r = await service.forStudent('s1', { id: 't', role: 'TEACHER' });
    expect(r.mayAnswer).toBe(false);
  });

  it('records a parent by role even when their name cannot be read', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await service.answer(
      's1',
      { forId: 'YES', inApp: 'YES', publicity: 'YES' },
      { id: 'p1', role: 'PARENT' },
    );
    expect(
      prisma.photoConsentRecord.create.mock.calls[0][0].data.answeredBy,
    ).toBe('A parent');
  });

  it('says the student when an adult student’s name cannot be read', async () => {
    prisma.student.findUnique.mockResolvedValue(student(adult));
    prisma.user.findUnique.mockResolvedValue({ firstName: '', lastName: null });
    await service.answer(
      's1',
      { forId: 'YES', inApp: 'YES', publicity: 'YES' },
      { id: 'u1', role: 'STUDENT' },
    );
    expect(
      prisma.photoConsentRecord.create.mock.calls[0][0].data.answeredBy,
    ).toBe('The student');
  });
});
