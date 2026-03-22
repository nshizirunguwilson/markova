import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

describe('AttendanceService', () => {
  let service: AttendanceService;

  const mockPrisma = {
    attendance: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    student: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    parentStudent: {
      findMany: jest.fn(),
    },
    teacherAttendance: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    teacher: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    classSection: {
      findMany: jest.fn(),
    },
  };

  const mockNotifications = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // markAttendance()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('markAttendance', () => {
    const baseDto = {
      studentId: 'student-1',
      classSectionId: 'class-1',
      date: '2026-03-20',
      type: 'daily' as const,
      status: 'PRESENT' as const,
    };

    it('should create attendance record with correct status', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        user: { firstName: 'Jane', lastName: 'Doe' },
      });
      const expectedRecord = { id: 'att-1', ...baseDto };
      mockPrisma.attendance.upsert.mockResolvedValue(expectedRecord);
      mockPrisma.parentStudent.findMany.mockResolvedValue([]);

      const result = await service.markAttendance(baseDto as any, 'teacher-1');

      expect(result).toEqual(expectedRecord);
      expect(mockPrisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            studentId: 'student-1',
            status: 'PRESENT',
            markedByUserId: 'teacher-1',
          }),
        }),
      );
    });

    it('should throw NotFoundException when student does not exist', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(null);

      await expect(service.markAttendance(baseDto as any, 'teacher-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should notify parents when status is ABSENT', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        user: { firstName: 'Jane', lastName: 'Doe' },
      });
      mockPrisma.attendance.upsert.mockResolvedValue({ id: 'att-1' });
      mockPrisma.parentStudent.findMany.mockResolvedValue([
        {
          parentUserId: 'parent-user-1',
          parent: { phone: '+256700000000', email: 'parent@test.com', firstName: 'Mary' },
          student: { user: { firstName: 'Jane', lastName: 'Doe' } },
        },
      ]);

      await service.markAttendance({ ...baseDto, status: 'ABSENT' } as any, 'teacher-1');

      expect(mockNotifications.send).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate P2002 error', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        user: { firstName: 'Jane', lastName: 'Doe' },
      });
      mockPrisma.attendance.upsert.mockRejectedValue({ code: 'P2002' });

      await expect(service.markAttendance(baseDto as any, 'teacher-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // bulkMarkAttendance()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('bulkMarkAttendance', () => {
    it('should handle bulk class attendance for array of students', async () => {
      const bulkDto = {
        classSectionId: 'class-1',
        date: '2026-03-20',
        type: 'daily',
        records: [
          { studentId: 'student-1', status: 'PRESENT' },
          { studentId: 'student-2', status: 'ABSENT' },
          { studentId: 'student-3', status: 'LATE' },
        ],
      };

      mockPrisma.attendance.upsert
        .mockResolvedValueOnce({ id: 'att-1', status: 'PRESENT' })
        .mockResolvedValueOnce({ id: 'att-2', status: 'ABSENT' })
        .mockResolvedValueOnce({ id: 'att-3', status: 'LATE' });
      mockPrisma.parentStudent.findMany.mockResolvedValue([]);

      const result = await service.bulkMarkAttendance(bulkDto as any, 'teacher-1');

      expect(result.count).toBe(3);
      expect(result.records).toHaveLength(3);
      expect(mockPrisma.attendance.upsert).toHaveBeenCalledTimes(3);
    });

    it('should skip duplicates without failing the batch', async () => {
      const bulkDto = {
        classSectionId: 'class-1',
        date: '2026-03-20',
        type: 'daily',
        records: [
          { studentId: 'student-1', status: 'PRESENT' },
          { studentId: 'student-2', status: 'PRESENT' },
        ],
      };

      mockPrisma.attendance.upsert
        .mockResolvedValueOnce({ id: 'att-1', status: 'PRESENT' })
        .mockRejectedValueOnce(new Error('duplicate'));

      const result = await service.bulkMarkAttendance(bulkDto as any, 'teacher-1');

      expect(result.count).toBe(1);
      expect(result.records).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getStudentSummary()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getStudentSummary', () => {
    it('should correctly count PRESENT, LATE, ABSENT', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([
        { date: '2026-01-01', status: 'PRESENT', reasonCategory: null },
        { date: '2026-01-02', status: 'ABSENT', reasonCategory: 'SICK' },
        { date: '2026-01-03', status: 'LATE', reasonCategory: null },
        { date: '2026-01-04', status: 'PRESENT', reasonCategory: null },
        { date: '2026-01-05', status: 'PRESENT', reasonCategory: null },
      ]);

      const result = await service.getStudentSummary('student-1');

      expect(result.total).toBe(5);
      expect(result.present).toBe(3);
      expect(result.late).toBe(1);
      expect(result.absent).toBe(1);
    });

    it('should calculate attendance rate as (present+late / total * 100)', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([
        { date: '2026-01-01', status: 'PRESENT', reasonCategory: null },
        { date: '2026-01-02', status: 'LATE', reasonCategory: null },
        { date: '2026-01-03', status: 'ABSENT', reasonCategory: null },
        { date: '2026-01-04', status: 'PRESENT', reasonCategory: null },
        { date: '2026-01-05', status: 'ABSENT', reasonCategory: null },
      ]);

      const result = await service.getStudentSummary('student-1');

      // (2 present + 1 late) / 5 total * 100 = 60%
      expect(result.attendanceRate).toBe(60);
    });

    it('should return 0% for student with no records', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getStudentSummary('student-no-records');

      expect(result.total).toBe(0);
      expect(result.present).toBe(0);
      expect(result.late).toBe(0);
      expect(result.absent).toBe(0);
      expect(result.attendanceRate).toBe(0);
      expect(result.records).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getChronicallyAbsent()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getChronicallyAbsent', () => {
    it('should return students with absence rate at or above threshold', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          user: { firstName: 'Jane', lastName: 'Doe' },
          studentIdNumber: 'STU001',
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          _count: { attendances: 10 },
        },
        {
          id: 'student-2',
          user: { firstName: 'John', lastName: 'Smith' },
          studentIdNumber: 'STU002',
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          _count: { attendances: 10 },
        },
        {
          id: 'student-3',
          user: { firstName: 'Good', lastName: 'Student' },
          studentIdNumber: 'STU003',
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          _count: { attendances: 10 },
        },
      ]);

      // student-1: 5 absences out of 10 = 50%, student-2: 2/10 = 20%, student-3: 1/10 = 10%
      mockPrisma.attendance.groupBy.mockResolvedValue([
        { studentId: 'student-1', _count: 5 },
        { studentId: 'student-2', _count: 2 },
        { studentId: 'student-3', _count: 1 },
      ]);

      const result = await service.getChronicallyAbsent(undefined, 20);

      // student-1 (50%) and student-2 (20%) are >= 20% threshold
      expect(result.count).toBe(2);
      expect(result.students.map((s) => s.name)).toEqual(['Jane Doe', 'John Smith']);
      expect(result.students[0].absenceRate).toBe(50);
      expect(result.students[1].absenceRate).toBe(20);
    });

    it('should use default threshold of 20%', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.attendance.groupBy.mockResolvedValue([]);

      const result = await service.getChronicallyAbsent();

      expect(result.threshold).toBe(20);
    });

    it('should filter by classSectionId when provided', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.attendance.groupBy.mockResolvedValue([]);

      await service.getChronicallyAbsent('class-1', 20);

      expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            classSectionId: 'class-1',
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // processQrScan()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('processQrScan', () => {
    const qrDto = {
      qrData: 'STU001',
      classSectionId: 'class-1',
    };

    it('should create attendance record on valid scan', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: 'student-1',
        studentIdNumber: 'STU001',
        classSectionId: 'class-1',
        user: { firstName: 'Jane', lastName: 'Doe' },
      });
      mockPrisma.attendance.findFirst.mockResolvedValue(null); // no duplicate
      const createdRecord = { id: 'att-1', status: 'PRESENT', studentId: 'student-1' };
      mockPrisma.attendance.create.mockResolvedValue(createdRecord);

      const result = await service.processQrScan(qrDto as any, 'teacher-1');

      expect(result.duplicate).toBe(false);
      expect(result.record).toEqual(createdRecord);
      expect(result.student.name).toBe('Jane Doe');
      expect(mockPrisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'student-1',
            classSectionId: 'class-1',
            markedByUserId: 'teacher-1',
          }),
        }),
      );
    });

    it('should return duplicate:true for already-scanned student', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: 'student-1',
        studentIdNumber: 'STU001',
        classSectionId: 'class-1',
        user: { firstName: 'Jane', lastName: 'Doe' },
      });
      const existingRecord = { id: 'att-existing', status: 'PRESENT' };
      mockPrisma.attendance.findFirst.mockResolvedValue(existingRecord);

      const result = await service.processQrScan(qrDto as any, 'teacher-1');

      expect(result.duplicate).toBe(true);
      expect(result.record).toEqual(existingRecord);
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when student not found', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(null);

      await expect(service.processQrScan(qrDto as any, 'teacher-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when student is in wrong class', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: 'student-1',
        studentIdNumber: 'STU001',
        classSectionId: 'different-class',
        user: { firstName: 'Jane', lastName: 'Doe' },
      });

      await expect(service.processQrScan(qrDto as any, 'teacher-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
