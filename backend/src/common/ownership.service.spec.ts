import { ForbiddenException } from '@nestjs/common';
import { OwnershipService } from './ownership.service';
import { createMockPrisma } from '../__test__/prisma-mock';
import {
  mockAdmin,
  mockTeacher,
  mockStudent,
  mockParent,
  mockStudentRecord,
} from '../__test__/fixtures';

describe('OwnershipService', () => {
  let service: OwnershipService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new OwnershipService(prisma);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── verifyStudentAccess ────────────────────────────────────────────────────

  describe('verifyStudentAccess', () => {
    const studentId = mockStudentRecord.id;

    it('should allow ADMIN without any DB lookup', async () => {
      await expect(
        service.verifyStudentAccess(mockAdmin.id, 'ADMIN', studentId),
      ).resolves.toBeUndefined();

      expect(prisma.student.findFirst).not.toHaveBeenCalled();
      expect(prisma.parentStudent.findFirst).not.toHaveBeenCalled();
    });

    it('should allow TEACHER without any DB lookup', async () => {
      await expect(
        service.verifyStudentAccess(mockTeacher.id, 'TEACHER', studentId),
      ).resolves.toBeUndefined();

      expect(prisma.student.findFirst).not.toHaveBeenCalled();
      expect(prisma.parentStudent.findFirst).not.toHaveBeenCalled();
    });

    describe('a teacher reading results', () => {
      const read = () =>
        service.verifyStudentAccess(
          mockTeacher.id,
          'TEACHER',
          studentId,
          'results',
        );

      beforeEach(() => {
        prisma.student.findUnique.mockResolvedValue({
          classSectionId: 'section-1',
        });
        prisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
        prisma.teacherRole.findFirst.mockResolvedValue(null);
        prisma.teacherSubjectClass.findFirst.mockResolvedValue(null);
      });

      it('reads a pupil in a class they teach', async () => {
        prisma.teacherSubjectClass.findFirst.mockResolvedValue({ id: 'tsc' });
        await expect(read()).resolves.toBeUndefined();
        expect(prisma.teacherSubjectClass.findFirst).toHaveBeenCalledWith({
          where: { teacherId: 'teacher-1', classSectionId: 'section-1' },
          select: { id: true },
        });
      });

      it('reads a pupil in the class they lead, or any as DOS or HOD', async () => {
        prisma.teacherRole.findFirst.mockResolvedValue({ id: 'duty' });
        await expect(read()).resolves.toBeUndefined();
        expect(prisma.teacherRole.findFirst).toHaveBeenCalledWith({
          where: {
            teacherId: 'teacher-1',
            OR: [
              { role: { in: ['DOS', 'HOD'] } },
              { role: 'CLASS_TEACHER', classSectionId: 'section-1' },
            ],
          },
          select: { id: true },
        });
      });

      it('is refused a pupil in a class that is not theirs', async () => {
        await expect(read()).rejects.toThrow(
          'You can read the results only of pupils in a class you teach',
        );
      });

      it('is refused with no teacher record at all', async () => {
        prisma.teacher.findFirst.mockResolvedValue(null);
        await expect(read()).rejects.toThrow(ForbiddenException);
      });

      it('leaves an unknown pupil to the route', async () => {
        prisma.student.findUnique.mockResolvedValue(null);
        await expect(read()).resolves.toBeUndefined();
      });
    });

    it('should allow STUDENT accessing their own studentId', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: studentId });

      await expect(
        service.verifyStudentAccess(mockStudent.id, 'STUDENT', studentId),
      ).resolves.toBeUndefined();

      expect(prisma.student.findFirst).toHaveBeenCalledWith({
        where: { userId: mockStudent.id },
        select: { id: true },
      });
    });

    it('should deny STUDENT accessing a different studentId', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'other-student-id' });

      await expect(
        service.verifyStudentAccess(mockStudent.id, 'STUDENT', studentId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow PARENT for a linked child', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue({
        id: 'link-id',
        parentUserId: mockParent.id,
        studentId,
      });

      await expect(
        service.verifyStudentAccess(mockParent.id, 'PARENT', studentId),
      ).resolves.toBeUndefined();

      expect(prisma.parentStudent.findFirst).toHaveBeenCalledWith({
        where: { parentUserId: mockParent.id, studentId },
      });
    });

    it('should deny PARENT for an unlinked student', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyStudentAccess(mockParent.id, 'PARENT', studentId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the patron reach a boy and the matron a girl', async () => {
      prisma.student.findFirst.mockResolvedValue({ gender: 'MALE' });
      await expect(
        service.verifyStudentAccess('u-1', 'PATRON', studentId, 'conduct'),
      ).resolves.toBeUndefined();
      prisma.student.findFirst.mockResolvedValue({ gender: 'FEMALE' });
      await expect(
        service.verifyStudentAccess('u-1', 'MATRON', studentId, 'conduct'),
      ).resolves.toBeUndefined();
    });

    it('refuses the patron a girl and the matron a boy', async () => {
      prisma.student.findFirst.mockResolvedValue({ gender: 'FEMALE' });
      await expect(
        service.verifyStudentAccess('u-1', 'PATRON', studentId),
      ).rejects.toThrow(ForbiddenException);
      prisma.student.findFirst.mockResolvedValue({ gender: 'MALE' });
      await expect(
        service.verifyStudentAccess('u-1', 'MATRON', studentId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny unknown role', async () => {
      await expect(
        service.verifyStudentAccess('some-user-id', 'LIBRARIAN', studentId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── verifyTeacherHomeworkAccess ────────────────────────────────────────────

  describe('verifyTeacherHomeworkAccess', () => {
    const homeworkId = 'homework-id-1';
    const classSectionId = 'cs-1';
    const subjectId = 'subj-1';
    const teacherRecordId = 'teacher-record-1';

    it('should allow ADMIN without any DB lookup', async () => {
      await expect(
        service.verifyTeacherHomeworkAccess(mockAdmin.id, 'ADMIN', homeworkId),
      ).resolves.toBeUndefined();

      expect(prisma.homework.findUnique).not.toHaveBeenCalled();
    });

    it('should allow TEACHER when assigned to the class/subject', async () => {
      prisma.homework.findUnique.mockResolvedValue({
        classSectionId,
        subjectId,
      });
      prisma.teacher.findFirst.mockResolvedValue({ id: teacherRecordId });
      prisma.teacherSubjectClass.findFirst.mockResolvedValue({
        id: 'tsc-1',
        teacherId: teacherRecordId,
        classSectionId,
        subjectId,
      });

      await expect(
        service.verifyTeacherHomeworkAccess(
          mockTeacher.id,
          'TEACHER',
          homeworkId,
        ),
      ).resolves.toBeUndefined();

      expect(prisma.homework.findUnique).toHaveBeenCalledWith({
        where: { id: homeworkId },
        select: { classSectionId: true, subjectId: true },
      });
      expect(prisma.teacher.findFirst).toHaveBeenCalledWith({
        where: { userId: mockTeacher.id },
        select: { id: true },
      });
      expect(prisma.teacherSubjectClass.findFirst).toHaveBeenCalledWith({
        where: {
          teacherId: teacherRecordId,
          classSectionId,
          subjectId,
        },
      });
    });

    it('should deny TEACHER when not assigned to the class/subject', async () => {
      prisma.homework.findUnique.mockResolvedValue({
        classSectionId,
        subjectId,
      });
      prisma.teacher.findFirst.mockResolvedValue({ id: teacherRecordId });
      prisma.teacherSubjectClass.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyTeacherHomeworkAccess(
          mockTeacher.id,
          'TEACHER',
          homeworkId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
