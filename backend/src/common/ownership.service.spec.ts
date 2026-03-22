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
