import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupportService } from './support.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Support plans (B7): the need is private to the people who keep it, the
 * principal and the family; a teacher is told what to do, for the students
 * they teach, and nothing more. Opening a whole plan is written down.
 */
describe('SupportService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let ownership: { verifyStudentAccess: jest.Mock };
  let service: SupportService;

  const plan = {
    needs: ['SEEING'],
    needNote: 'Low vision in both eyes',
    arrangements: ['EXTRA_TIME', 'LARGE_PRINT'],
    extraTimePercent: 25,
    otherArrangement: null,
    reviewOn: null,
    agreedWith: 'The family',
    updatedAt: new Date(),
    updatedBy: { firstName: 'Speciose', lastName: 'Mukarugwiza' },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    ownership = { verifyStudentAccess: jest.fn().mockResolvedValue(undefined) };
    service = new SupportService(prisma, ownership as never);
    prisma.student.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      classSectionId: 'section-1',
      disability: 'Low vision',
      status: 'ACTIVE',
    });
    prisma.supportPlan.findUnique.mockResolvedValue(plan);
    prisma.auditLog.create.mockResolvedValue({});
    prisma.teacher.findFirst.mockResolvedValue({ id: 't1' });
    prisma.teacherSubjectClass.count.mockResolvedValue(0);
    prisma.teacherRole.count.mockResolvedValue(0);
  });

  describe('reading one plan', () => {
    it('gives the Director of Studies the whole of it, and writes it down', async () => {
      const result = await service.forStudent('s1', {
        id: 'dos',
        role: 'HEAD_TEACHER',
      });
      expect(result).toMatchObject({
        plan: {
          needWords: ['Seeing'],
          needNote: 'Low vision in both eyes',
          arrangements: ['25% extra time', 'Large print'],
          updatedBy: 'Speciose Mukarugwiza',
        },
        recordedAtEnrolment: 'Low vision',
        mayChange: true,
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'dos',
          action: 'VIEW',
          entityType: 'support-plan',
          entityId: 's1',
        },
      });
    });

    it('lets the principal read it, not change it', async () => {
      const result = await service.forStudent('s1', { id: 'p', role: 'ADMIN' });
      expect(result.mayChange).toBe(false);
      expect(result.plan).toHaveProperty('needNote');
    });

    it('tells a teacher of the class what to do, and never why', async () => {
      prisma.teacherSubjectClass.count.mockResolvedValue(1);
      const result = await service.forStudent('s1', {
        id: 'teacher',
        role: 'TEACHER',
      });
      expect(result).toEqual({
        plan: {
          arrangements: ['25% extra time', 'Large print'],
          reviewOn: null,
        },
        teacherView: true,
      });
      expect(JSON.stringify(result)).not.toMatch(/vision|SEEING|Seeing/);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('counts a class teacher as teaching the class', async () => {
      prisma.teacherRole.count.mockResolvedValue(1);
      await expect(
        service.forStudent('s1', { id: 'teacher', role: 'TEACHER' }),
      ).resolves.toHaveProperty('teacherView', true);
    });

    it('tells a teacher of another class nothing', async () => {
      await expect(
        service.forStudent('s1', { id: 'teacher', role: 'TEACHER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('shows the family their own child’s, held to what an adult child shares', async () => {
      const result = await service.forStudent('s1', {
        id: 'mum',
        role: 'PARENT',
      });
      expect(ownership.verifyStudentAccess).toHaveBeenCalledWith(
        'mum',
        'PARENT',
        's1',
        'health',
      );
      expect(result.plan).toHaveProperty('needWords', ['Seeing']);
      expect(result.mayChange).toBe(false);
      expect(result.recordedAtEnrolment).toBeUndefined();
    });

    it('refuses anybody else at the school', async () => {
      await expect(
        service.forStudent('s1', { id: 'l', role: 'LIBRARIAN' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('says when there is no plan', async () => {
      prisma.supportPlan.findUnique.mockResolvedValue(null);
      await expect(
        service.forStudent('s1', { id: 'dos', role: 'HEAD_TEACHER' }),
      ).resolves.toMatchObject({ plan: null });
    });

    it('refuses a student who is not there', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.forStudent('nobody', { id: 'dos', role: 'HEAD_TEACHER' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('keeping a plan', () => {
    const dto = {
      needs: ['SEEING', 'SEEING'],
      arrangements: ['EXTRA_TIME', 'LARGE_PRINT'],
      extraTimePercent: 25,
      reviewOn: '2027-01-15',
    } as never;

    it('saves it once per need, with who changed it', async () => {
      prisma.supportPlan.upsert.mockResolvedValue(plan);
      await service.save('s1', dto, 'dos');
      const call = prisma.supportPlan.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ studentId: 's1' });
      expect(call.update).toMatchObject({
        needs: ['SEEING'],
        extraTimePercent: 25,
        reviewOn: new Date('2027-01-15T00:00:00.000Z'),
        updatedByUserId: 'dos',
      });
    });

    it('needs to know how much extra time', async () => {
      await expect(
        service.save(
          's1',
          { needs: [], arrangements: ['EXTRA_TIME'] } as never,
          'dos',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('forgets a share of extra time once extra time is gone', async () => {
      prisma.supportPlan.upsert.mockResolvedValue(plan);
      await service.save(
        's1',
        { needs: [], arrangements: ['READER'], extraTimePercent: 25 } as never,
        'dos',
      );
      expect(
        prisma.supportPlan.upsert.mock.calls[0][0].update.extraTimePercent,
      ).toBeNull();
    });

    it('removes a plan, and says when there was none', async () => {
      prisma.supportPlan.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.remove('s1')).resolves.toEqual({ removed: true });
      prisma.supportPlan.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove('s1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('a class, and an exam', () => {
    const row = (name: string, over: Record<string, unknown> = {}) => ({
      ...plan,
      student: {
        id: name,
        studentIdNumber: `STD-${name}`,
        user: { firstName: name, lastName: 'U' },
      },
      ...over,
    });

    beforeEach(() => {
      prisma.supportPlan.findMany.mockResolvedValue([
        row('Keza'),
        row('Aline', { arrangements: [], extraTimePercent: null }),
      ]);
      prisma.teacherSubjectClass.count.mockResolvedValue(1);
    });

    it('lists only the students with something to do, by name, without the need', async () => {
      const list = await service.forClass('section-1', {
        id: 't',
        role: 'TEACHER',
      });
      expect(list).toEqual([
        {
          studentId: 'Keza',
          name: 'Keza U',
          studentIdNumber: 'STD-Keza',
          arrangements: ['25% extra time', 'Large print'],
          extraTimePercent: 25,
        },
      ]);
    });

    it('refuses a teacher of another class', async () => {
      prisma.teacherSubjectClass.count.mockResolvedValue(0);
      await expect(
        service.forClass('section-1', { id: 't', role: 'TEACHER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('works out the extra minutes for the exam on the sheet', async () => {
      prisma.examSchedule.findUnique.mockResolvedValue({
        id: 'exam-1',
        classSectionId: 'section-1',
        examDate: new Date('2026-11-02'),
        startTime: '08:00',
        endTime: '10:00',
        room: 'Lab 2',
        subject: { name: 'Mathematics' },
        term: { name: 'Term 3' },
        classSection: {
          name: 'A',
          classLevel: { name: 'Senior 4' },
          trade: null,
        },
      });
      const sheet = await service.examSheet('exam-1', {
        id: 'dos',
        role: 'HEAD_TEACHER',
      });
      expect(sheet.exam).toMatchObject({
        subject: 'Mathematics',
        class: 'Senior 4 A',
        room: 'Lab 2',
      });
      expect(sheet.students[0]).toMatchObject({
        name: 'Keza U',
        extraMinutes: 30,
      });
    });

    it('says so for an exam that is not there', async () => {
      prisma.examSchedule.findUnique.mockResolvedValue(null);
      await expect(
        service.examSheet('nope', { id: 'dos', role: 'HEAD_TEACHER' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lists every plan for the national exam registration, by class', async () => {
      prisma.supportPlan.findMany.mockResolvedValue([
        {
          ...row('Keza'),
          student: {
            ...row('Keza').student,
            userId: 'u',
            classSection: {
              name: 'B',
              classLevel: { name: 'Senior 6' },
              trade: null,
            },
          },
        },
        {
          ...row('Eric'),
          student: {
            ...row('Eric').student,
            userId: 'u',
            classSection: {
              name: 'A',
              classLevel: { name: 'Senior 6' },
              trade: null,
            },
          },
        },
      ]);
      const list = await service.register();
      expect(list.map((p) => p.class)).toEqual(['Senior 6 A', 'Senior 6 B']);
      expect(list[0]).toMatchObject({
        needs: ['Seeing'],
        arrangements: ['25% extra time', 'Large print'],
      });
    });
  });

  describe('the edges', () => {
    it('tells a teacher there is no plan, when there is none', async () => {
      prisma.supportPlan.findUnique.mockResolvedValue(null);
      prisma.teacherSubjectClass.count.mockResolvedValue(1);
      expect(
        await service.forStudent('s1', { id: 't', role: 'TEACHER' }),
      ).toEqual({
        plan: null,
        teacherView: true,
      });
    });

    it('counts nobody as teaching who has no teacher record', async () => {
      prisma.teacher.findFirst.mockResolvedValue(null);
      await expect(
        service.forStudent('s1', { id: 'x', role: 'TEACHER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('names nobody as the last to change a plan with no author', async () => {
      prisma.supportPlan.findUnique.mockResolvedValue({
        ...plan,
        updatedBy: null,
      });
      const r = await service.forStudent('s1', { id: 'n', role: 'NURSE' });
      expect((r.plan as { updatedBy: unknown }).updatedBy).toBeNull();
    });

    it('will not keep a plan for a student who is not there', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.save('nobody', { needs: [], arrangements: [] }, 'u'),
      ).rejects.toThrow(NotFoundException);
    });

    it('keeps the optional parts blank, and a review date as a day', async () => {
      prisma.supportPlan.upsert.mockResolvedValue({ ...plan, updatedBy: null });
      await service.save(
        's1',
        {
          needs: ['OTHER'],
          arrangements: ['READER'],
          needNote: '  ',
          otherArrangement: '',
          agreedWith: ' ',
          reviewOn: '2027-03-01T10:00:00Z',
        } as never,
        'u',
      );
      const data = prisma.supportPlan.upsert.mock.calls[0][0].update;
      expect(data).toMatchObject({
        needNote: null,
        otherArrangement: null,
        agreedWith: null,
        extraTimePercent: null,
      });
      expect(data.reviewOn.toISOString()).toBe('2027-03-01T00:00:00.000Z');
    });

    it('refuses a class list to anybody but its teachers and the readers', async () => {
      await expect(
        service.forClass('c1', { id: 'l', role: 'LIBRARIAN' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
