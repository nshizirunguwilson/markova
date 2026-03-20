import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('AttendanceService', () => {
  let service: AttendanceService;

  const mockPrisma = {
    attendance: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    student: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    parentStudent: {
      findMany: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    classSectionStudent: {
      findMany: jest.fn(),
    },
  };

  const mockNotifications = {
    send: jest.fn(),
    sendBulk: jest.fn(),
    sendEmail: jest.fn(),
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

  describe('getChronicallyAbsent', () => {
    it('should identify students with absence rate above threshold', async () => {
      const mockStudents = [
        {
          id: 'student-1',
          user: { firstName: 'Jane', lastName: 'Doe' },
          studentIdNumber: 'STU001',
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          attendances: [
            { status: 'ABSENT' },
            { status: 'ABSENT' },
            { status: 'ABSENT' },
            { status: 'PRESENT' },
            { status: 'PRESENT' },
          ],
        },
        {
          id: 'student-2',
          user: { firstName: 'John', lastName: 'Smith' },
          studentIdNumber: 'STU002',
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          attendances: [
            { status: 'PRESENT' },
            { status: 'PRESENT' },
            { status: 'PRESENT' },
            { status: 'PRESENT' },
            { status: 'ABSENT' },
          ],
        },
      ];

      mockPrisma.student.findMany.mockResolvedValue(mockStudents);

      // With 20% threshold: student-1 has 60% absence, student-2 has 20%
      const result = await service.getChronicallyAbsent(undefined, 20);

      expect(result.count).toBe(2);
      expect(result.students[0].name).toBe('Jane Doe');
      expect(result.students[0].absenceRate).toBe(60);
      expect(result.students[1].name).toBe('John Smith');
      expect(result.students[1].absenceRate).toBe(20);
    });

    it('should filter by class section when provided', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);

      await service.getChronicallyAbsent('class-1', 20);

      expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            classSectionId: 'class-1',
          }),
        }),
      );
    });

    it('should use default threshold of 20%', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);

      const result = await service.getChronicallyAbsent();

      expect(result.threshold).toBe(20);
    });

    it('should sort by absence rate descending', async () => {
      const mockStudents = [
        {
          id: 'a',
          user: { firstName: 'A', lastName: 'A' },
          studentIdNumber: 'S1',
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          attendances: Array(10).fill({ status: 'ABSENT' }).concat(Array(10).fill({ status: 'PRESENT' })),
        },
        {
          id: 'b',
          user: { firstName: 'B', lastName: 'B' },
          studentIdNumber: 'S2',
          classSection: { name: 'A', classLevel: { name: 'S1' } },
          attendances: Array(15).fill({ status: 'ABSENT' }).concat(Array(5).fill({ status: 'PRESENT' })),
        },
      ];

      mockPrisma.student.findMany.mockResolvedValue(mockStudents);

      const result = await service.getChronicallyAbsent(undefined, 20);

      // B has 75% absence, A has 50% — B should come first
      expect(result.students[0].name).toBe('B B');
      expect(result.students[1].name).toBe('A A');
    });
  });

  describe('getStudentSummary', () => {
    it('should calculate attendance summary for a student', async () => {
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
      expect(result.absent).toBe(1);
      expect(result.late).toBe(1);
      expect(result.attendanceRate).toBe(80); // (3+1)/5 = 80%
    });
  });
});
