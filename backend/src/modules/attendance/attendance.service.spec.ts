import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * The register.
 *
 * A register is a legal record of who was in the building, so the tests here
 * are about it staying true: one row per student per day, a duplicate scan
 * that says so rather than double-counting, and a lateness rule that reads the
 * clock rather than the minute hand.
 */
/* The delivery queue. Whether a message is sent is tested where the worker
   lives; here it only has to accept the job. */
const delivery = {
  email: jest.fn().mockResolvedValue(undefined),
  sms: jest.fn().mockResolvedValue(undefined),
};

describe('AttendanceService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let notifications: { send: jest.Mock };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = createMockPrisma();
    notifications = { send: jest.fn().mockResolvedValue({}) };
    service = new AttendanceService(
      prisma,
      notifications as unknown as NotificationsService,
      delivery as never,
    );
    prisma.parentStudent.findMany.mockResolvedValue([]);
    prisma.attendance.findFirst.mockResolvedValue(null);
    prisma.attendance.create.mockResolvedValue({ id: 'att-1' });
    prisma.attendance.update.mockResolvedValue({ id: 'att-1' });
  });

  const student = {
    id: 'student-1',
    status: 'ACTIVE',
    classSectionId: 'section-1',
    studentIdNumber: 'STD-2026-001',
    nfcCardId: '1111 2222 3333',
    user: { firstName: 'Divine', lastName: 'Niyonkuru' },
  };

  const mark = {
    studentId: 'student-1',
    classSectionId: 'section-1',
    date: '2026-08-20',
    type: 'daily',
    status: 'PRESENT',
  };

  describe('marking one student', () => {
    beforeEach(() => prisma.student.findUnique.mockResolvedValue(student));

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.markAttendance(mark as never, 'teacher-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('records who took the register', async () => {
      await service.markAttendance(mark as never, 'teacher-1');
      expect(prisma.attendance.create.mock.calls[0][0].data).toMatchObject({
        studentId: 'student-1',
        status: 'PRESENT',
        markedByUserId: 'teacher-1',
      });
    });

    /**
     * Postgres treats NULLs in a unique index as distinct, so an upsert keyed
     * on a daily row (which has no subject) never matches the stored one and
     * silently inserts a second. The lookup is what keeps it to one row.
     */
    it('updates the existing row rather than adding a second', async () => {
      prisma.attendance.findFirst.mockResolvedValue({ id: 'att-1' });
      await service.markAttendance(
        { ...mark, status: 'ABSENT' } as never,
        'teacher-1',
      );
      expect(prisma.attendance.create).not.toHaveBeenCalled();
      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'att-1' } }),
      );
    });

    it('looks for a daily row by a null subject, not an empty string', async () => {
      await service.markAttendance(mark as never, 'teacher-1');
      expect(
        prisma.attendance.findFirst.mock.calls[0][0].where.subjectId,
      ).toBeNull();
    });

    it('turns a unique clash into an answer a person can read', async () => {
      prisma.attendance.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.markAttendance(mark as never, 'teacher-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('lets a real database error through unchanged', async () => {
      prisma.attendance.create.mockRejectedValue(new Error('Connection lost'));
      await expect(
        service.markAttendance(mark as never, 'teacher-1'),
      ).rejects.toThrow('Connection lost');
    });

    /**
     * A family learning at four o'clock that their child never arrived is the
     * whole point of an electronic register.
     */
    it.each(['ABSENT', 'LATE'])(
      'tells the family about a %s',
      async (status) => {
        prisma.parentStudent.findMany.mockResolvedValue([
          {
            parentUserId: 'parent-1',
            parent: {
              firstName: 'Claudine',
              phone: '+250788',
              email: 'c@x.rw',
            },
            student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
          },
        ]);
        await service.markAttendance({ ...mark, status } as never, 'teacher-1');
        expect(notifications.send).toHaveBeenCalled();
        const message = notifications.send.mock.calls[0][0].message;
        expect(message).toContain('Divine Niyonkuru');
        expect(message).toContain(status === 'LATE' ? 'late' : 'absent');
      },
    );

    it('says nothing to the family about a student who turned up', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parentUserId: 'parent-1',
          parent: { firstName: 'Claudine', phone: '+250788' },
          student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
        },
      ]);
      await service.markAttendance(mark as never, 'teacher-1');
      expect(notifications.send).not.toHaveBeenCalled();
    });

    // Reaching a family three ways is deliberate: a phone can be off and an
    // inbox can be unread, but the register still has to be defensible.
    it('reaches a family by every route it has for them', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parentUserId: 'parent-1',
          parent: { firstName: 'Claudine', phone: '+250788', email: 'c@x.rw' },
          student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
        },
      ]);
      await service.markAttendance(
        { ...mark, status: 'ABSENT' } as never,
        't-1',
      );
      const types = notifications.send.mock.calls.map((c) => c[0].type);
      expect(types).toEqual(['SMS', 'EMAIL', 'PUSH']);
    });

    it('skips the routes a family does not have', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parentUserId: 'parent-1',
          parent: { firstName: 'Claudine', phone: null, email: null },
          student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
        },
      ]);
      await service.markAttendance(
        { ...mark, status: 'ABSENT' } as never,
        't-1',
      );
      expect(notifications.send.mock.calls.map((c) => c[0].type)).toEqual([
        'PUSH',
      ]);
    });

    // The register is the record. A message that would not send is not a
    // reason to lose it.
    it('keeps the register when the message will not send', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parentUserId: 'parent-1',
          parent: { firstName: 'Claudine', phone: '+250788', email: 'c@x.rw' },
          student: { user: { firstName: 'Divine', lastName: 'Niyonkuru' } },
        },
      ]);
      notifications.send.mockRejectedValue(new Error('Gateway down'));
      await expect(
        service.markAttendance({ ...mark, status: 'ABSENT' } as never, 't-1'),
      ).resolves.toBeDefined();
    });
  });

  describe('taking a whole class register', () => {
    const bulk = {
      classSectionId: 'section-1',
      date: '2026-08-20',
      type: 'daily',
      records: [
        { studentId: 's-1', status: 'PRESENT' },
        { studentId: 's-2', status: 'ABSENT' },
      ],
    };

    // Both on the roll, neither out of school.
    beforeEach(() => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
      prisma.student.findUnique.mockResolvedValue(student);
    });

    it('records every student', async () => {
      const result = await service.bulkMarkAttendance(
        bulk as never,
        'teacher-1',
      );
      expect(result.count).toBe(2);
    });

    // One student's row failing must not lose the other thirty-nine.
    it('keeps going when one row fails', async () => {
      prisma.attendance.create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValue({ id: 'att-2' });
      const result = await service.bulkMarkAttendance(
        bulk as never,
        'teacher-1',
      );
      expect(result.count).toBe(1);
    });

    it('tells the families of the absent ones only', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parentUserId: 'parent-1',
          parent: { firstName: 'Claudine', phone: '+250788' },
          student: { user: { firstName: 'Keza', lastName: 'Mutesi' } },
        },
      ]);
      await service.bulkMarkAttendance(bulk as never, 'teacher-1');
      expect(prisma.parentStudent.findMany).toHaveBeenCalledTimes(1);
      expect(
        prisma.parentStudent.findMany.mock.calls[0][0].where.studentId,
      ).toBe('s-2');
    });
  });

  /**
   * Scanning at the gate. The two checks that matter are that the card
   * belongs to somebody in this class, and that a second tap says "already
   * scanned" rather than writing a second row.
   */
  describe.each([
    [
      'a QR code',
      'processQrScan',
      { qrData: 'STD-2026-001', classSectionId: 'section-1' },
    ],
    [
      'a card',
      'processNfcScan',
      { nfcCardId: '1111 2222 3333', classSectionId: 'section-1' },
    ],
  ])('scanning %s', (_name, method, dto) => {
    beforeEach(() => prisma.student.findFirst.mockResolvedValue(student));

    it('refuses one nobody is registered against', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect((service as any)[method](dto, 'teacher-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    // Scanning a Senior 2 card into a Senior 1 register would put a student
    // on a roll they were never on.
    it('refuses a student who is not in this class', async () => {
      prisma.student.findFirst.mockResolvedValue({
        ...student,
        classSectionId: 'other-section',
      });
      await expect((service as any)[method](dto, 'teacher-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('says so on a second scan rather than writing another row', async () => {
      prisma.attendance.findFirst.mockResolvedValue({ id: 'att-1' });
      const result = await (service as any)[method](dto, 'teacher-1');
      expect(result.duplicate).toBe(true);
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    });

    it('names the student so the person at the gate can see who scanned', async () => {
      const result = await (service as any)[method](dto, 'teacher-1');
      expect(result.student.name).toBe('Divine Niyonkuru');
    });

    it('records the moment of the scan', async () => {
      await (service as any)[method](dto, 'teacher-1');
      expect(
        prisma.attendance.create.mock.calls[0][0].data.scannedAt,
      ).toBeInstanceOf(Date);
    });
  });

  /**
   * The lateness cutoff is 08:30. The old check read only the minute field,
   * so 09:10 counted as on time while 08:31 was late.
   */
  describe('the lateness cutoff', () => {
    const at = (hours: number, minutes: number) => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 20, hours, minutes));
    };

    afterEach(() => jest.useRealTimers());

    beforeEach(() => prisma.student.findFirst.mockResolvedValue(student));

    it.each([
      [7, 55, 'PRESENT'],
      [8, 0, 'PRESENT'],
      [8, 30, 'PRESENT'],
      [8, 31, 'LATE'],
      [8, 59, 'LATE'],
      [9, 10, 'LATE'],
      [10, 5, 'LATE'],
      [14, 20, 'LATE'],
    ])('a scan at %s:%s is %s', async (h, m, expected) => {
      at(h, m);
      await service.processQrScan(
        { qrData: 'STD-2026-001', classSectionId: 'section-1' },
        'teacher-1',
      );
      expect(prisma.attendance.create.mock.calls[0][0].data.status).toBe(
        expected,
      );
    });

    // A subject register is taken at whatever time that lesson runs, so the
    // daily cutoff has no business being applied to it.
    it('never calls a subject scan late', async () => {
      at(15, 0);
      await service.processQrScan(
        {
          qrData: 'STD-2026-001',
          classSectionId: 'section-1',
          type: 'subject',
          subjectId: 'subject-1',
        } as never,
        'teacher-1',
      );
      expect(prisma.attendance.create.mock.calls[0][0].data.status).toBe(
        'PRESENT',
      );
    });
  });

  /**
   * A card registered to two students would mark the wrong child present.
   */
  describe('registering a card', () => {
    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.registerNfcCard({
          studentId: 'nope',
          nfcCardId: '1111',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a card already registered to somebody else', async () => {
      prisma.student.findUnique.mockResolvedValue(student);
      prisma.student.findFirst.mockResolvedValue({ id: 'other-student' });
      await expect(
        service.registerNfcCard({
          studentId: 'student-1',
          nfcCardId: '1111',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('lets a student re-register their own card', async () => {
      prisma.student.findUnique.mockResolvedValue(student);
      prisma.student.findFirst.mockResolvedValue(null);
      prisma.student.update.mockResolvedValue({});
      await expect(
        service.registerNfcCard({
          studentId: 'student-1',
          nfcCardId: '1111',
        }),
      ).resolves.toMatchObject({ studentId: 'student-1' });
      // The clash lookup deliberately excludes the student themselves.
      expect(prisma.student.findFirst.mock.calls[0][0].where.id).toEqual({
        not: 'student-1',
      });
    });
  });

  /**
   * Who keeps being away. This is the list that turns into a phone call, so
   * the rate has to be over the days that student was expected rather than
   * over the school's calendar.
   */
  describe('chronic absence', () => {
    const withDays = (id: string, total: number, name = 'Divine') => ({
      id,
      studentIdNumber: `STD-${id}`,
      user: { firstName: name, lastName: 'Niyonkuru' },
      classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
      _count: { attendances: total },
    });

    it('works the rate out per student and flags those over the line', async () => {
      prisma.student.findMany.mockResolvedValue([
        withDays('s-1', 100),
        withDays('s-2', 100, 'Keza'),
      ]);
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 's-1', _count: 30 },
        { studentId: 's-2', _count: 5 },
      ]);

      const result = await service.getChronicallyAbsent();
      expect(result.threshold).toBe(20);
      expect(result.students).toHaveLength(1);
      expect(result.students[0]).toMatchObject({
        studentId: 's-1',
        absenceRate: 30,
        absentDays: 30,
        totalDays: 100,
      });
    });

    it('uses the threshold the school set', async () => {
      prisma.student.findMany.mockResolvedValue([withDays('s-1', 100)]);
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 's-1', _count: 12 },
      ]);
      const result = await service.getChronicallyAbsent(undefined, 10);
      expect(result.students).toHaveLength(1);
      expect(result.threshold).toBe(10);
    });

    // A student who has never been marked has no rate, and reporting 0 would
    // quietly hide a child nobody has taken a register for.
    it('reports a student with no register at all as zero, not as absent', async () => {
      prisma.student.findMany.mockResolvedValue([withDays('s-1', 0)]);
      prisma.attendance.groupBy.mockResolvedValue([]);
      const result = await service.getChronicallyAbsent();
      expect(result.students).toEqual([]);
    });

    it('puts the worst first', async () => {
      prisma.student.findMany.mockResolvedValue([
        withDays('s-1', 100),
        withDays('s-2', 100, 'Keza'),
      ]);
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 's-1', _count: 25 },
        { studentId: 's-2', _count: 60 },
      ]);
      const result = await service.getChronicallyAbsent();
      expect(result.students[0].studentId).toBe('s-2');
    });

    it('counts only the daily register, not every subject period', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.attendance.groupBy.mockResolvedValue([]);
      await service.getChronicallyAbsent();
      expect(prisma.attendance.groupBy.mock.calls[0][0].where.type).toBe(
        'daily',
      );
    });

    it('narrows to one class when asked', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.attendance.groupBy.mockResolvedValue([]);
      await service.getChronicallyAbsent('section-1');
      expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
        classSectionId: 'section-1',
        status: 'ACTIVE',
      });
    });

    it('pages the list', async () => {
      prisma.student.findMany.mockResolvedValue(
        Array.from({ length: 25 }, (_, i) => withDays(`s-${i}`, 100)),
      );
      prisma.attendance.groupBy.mockResolvedValue(
        Array.from({ length: 25 }, (_, i) => ({
          studentId: `s-${i}`,
          _count: 50,
        })),
      );
      const result = await service.getChronicallyAbsent(
        undefined,
        undefined,
        2,
        10,
      );
      expect(result.count).toBe(25);
      expect(result.students).toHaveLength(10);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('telling those families', () => {
    beforeEach(() => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 's-1',
          studentIdNumber: 'STD-1',
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
          classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
          _count: { attendances: 100 },
        },
      ]);
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 's-1', _count: 30 },
      ]);
      prisma.student.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    });

    it('leaves out the family of a child suspended this week', async () => {
      prisma.studentPause.findMany.mockResolvedValue([
        {
          studentId: 's-1',
          kind: 'SUSPENDED',
          startsOn: new Date(0),
          endsOn: null,
          reason: 'Fighting',
        },
      ]);
      prisma.parentStudent.findMany.mockResolvedValue([
        { parentUserId: 'p-1', parent: { firstName: 'C', email: 'c@x.rw' } },
      ]);
      const result = await service.sendChronicAbsenteeismAlerts();
      expect(result.alertsSent).toBe(0);
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('writes to the families of everyone over the line', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        {
          parentUserId: 'p-1',
          parent: { firstName: 'Claudine', email: 'c@x.rw' },
        },
      ]);
      const result = await service.sendChronicAbsenteeismAlerts();
      expect(result).toMatchObject({ studentsIdentified: 1, alertsSent: 1 });
      const message = notifications.send.mock.calls[0][0].message;
      expect(message).toContain('Divine Niyonkuru');
      expect(message).toContain('30');
    });

    // A letter needs an address. There is no point counting one that had none.
    it('skips a family with no email and does not count it as sent', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        { parentUserId: 'p-1', parent: { firstName: 'Claudine', email: null } },
      ]);
      const result = await service.sendChronicAbsenteeismAlerts();
      expect(result.alertsSent).toBe(0);
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('keeps going when one letter fails', async () => {
      prisma.parentStudent.findMany.mockResolvedValue([
        { parentUserId: 'p-1', parent: { firstName: 'A', email: 'a@x.rw' } },
        { parentUserId: 'p-2', parent: { firstName: 'B', email: 'b@x.rw' } },
      ]);
      notifications.send
        .mockRejectedValueOnce(new Error('bounced'))
        .mockResolvedValue({});
      const result = await service.sendChronicAbsenteeismAlerts();
      expect(result.alertsSent).toBe(1);
    });
  });

  describe('reading the register back', () => {
    beforeEach(() => {
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.student.findMany.mockResolvedValue([]);
    });

    it('narrows the list by class and date', async () => {
      await service.findAll({
        classSectionId: 'section-1',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      });
      const where = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.classSectionId).toBe('section-1');
      expect(where.date.gte).toBeInstanceOf(Date);
    });

    it('lists a class in register order', async () => {
      await service.getClassAttendance('section-1', '2026-08-20');
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ classSectionId: 'section-1' }),
        }),
      );
    });

    it('lists a class’s cards for the phone to cache', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 's-1',
          studentIdNumber: 'STD-1',
          nfcCardId: '1111',
          user: { id: 'u-1', firstName: 'Divine', lastName: 'Niyonkuru' },
        },
      ]);
      const result = await service.getClassStudentsWithNfc('section-1');
      expect(result[0]).toEqual({
        id: 's-1',
        studentIdNumber: 'STD-1',
        nfcCardId: '1111',
        firstName: 'Divine',
        lastName: 'Niyonkuru',
        userId: 'u-1',
      });
    });
  });

  /**
   * A class register on one day. An unmarked student is absent, not unknown:
   * a register that quietly ignores the children nobody ticked would report a
   * hundred percent attendance for a class nobody took.
   */
  describe('a class on one day', () => {
    const inClass = (name: string, status: string | null) => ({
      id: `s-${name}`,
      studentIdNumber: `STD-${name}`,
      user: { firstName: name, lastName: 'X' },
      attendances: status
        ? [{ status, scannedAt: null, reasonCategory: null }]
        : [],
    });

    it('counts the three states and works out the rate', async () => {
      prisma.student.findMany.mockResolvedValue([
        inClass('A', 'PRESENT'),
        inClass('B', 'LATE'),
        inClass('C', 'ABSENT'),
        inClass('D', 'PRESENT'),
      ]);
      const result = await service.getClassAttendance(
        'section-1',
        '2026-08-20',
      );
      expect(result).toMatchObject({
        total: 4,
        present: 2,
        late: 1,
        absent: 1,
        rate: 75,
      });
    });

    it('counts a student nobody ticked as absent', async () => {
      prisma.student.findMany.mockResolvedValue([
        inClass('A', 'PRESENT'),
        inClass('B', null),
      ]);
      const result = await service.getClassAttendance(
        'section-1',
        '2026-08-20',
      );
      expect(result.absent).toBe(1);
      expect(result.students[1].status).toBeNull();
    });

    it('reports zero rather than dividing by an empty class', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      const result = await service.getClassAttendance(
        'section-1',
        '2026-08-20',
      );
      expect(result.rate).toBe(0);
    });

    it('reads only the daily register, not the subject periods', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      await service.getClassAttendance('section-1', '2026-08-20');
      const where =
        prisma.student.findMany.mock.calls[0][0].include.attendances.where;
      expect(where.type).toBe('daily');
    });
  });

  /**
   * One student over a range, which is the figure a parent is shown and the
   * one a school is judged on at a meeting.
   */
  describe('one student’s attendance', () => {
    it('counts a late arrival as having been there', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        { date: new Date('2026-08-20'), status: 'PRESENT' },
        { date: new Date('2026-08-21'), status: 'LATE' },
        { date: new Date('2026-08-22'), status: 'ABSENT' },
        { date: new Date('2026-08-23'), status: 'ABSENT' },
      ]);
      const result = await service.getStudentSummary('student-1');
      expect(result).toMatchObject({
        total: 4,
        present: 1,
        late: 1,
        absent: 2,
        attendanceRate: 50,
      });
    });

    it('reports zero rather than dividing by an empty register', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      const result = await service.getStudentSummary('student-1');
      expect(result.attendanceRate).toBe(0);
    });

    /**
     * The reason matters more than the rate. A child signed off sick at 84
     * percent is a different conversation from one marked unexcused.
     */
    it('carries the reason for each absence', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        {
          date: new Date('2026-08-22'),
          status: 'ABSENT',
          reasonCategory: 'SICK',
        },
      ]);
      const result = await service.getStudentSummary('student-1');
      expect(result.records[0].reasonCategory).toBe('SICK');
    });

    it('narrows to a range and reads in date order', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      await service.getStudentSummary('student-1', '2026-08-01', '2026-08-31');
      const call = prisma.attendance.findMany.mock.calls[0][0];
      expect(call.where.date.gte).toBeInstanceOf(Date);
      expect(call.where.date.lte).toBeInstanceOf(Date);
      expect(call.orderBy).toEqual({ date: 'asc' });
    });
  });

  /**
   * Staff attendance. The same 08:30 rule, and the same refusal to write a
   * second row for a second tap.
   */
  describe('staff', () => {
    it('records a teacher for a day, replacing any earlier mark', async () => {
      prisma.teacherAttendance.upsert.mockResolvedValue({});
      await service.markTeacherAttendance({
        teacherId: 'teacher-1',
        date: '2026-08-20',
        status: 'PRESENT',
      } as never);
      const call = prisma.teacherAttendance.upsert.mock.calls[0][0];
      expect(call.where.teacherId_date.teacherId).toBe('teacher-1');
      expect(call.update.status).toBe('PRESENT');
    });

    it('refuses a scan matching no member of staff', async () => {
      prisma.teacher.findFirst.mockResolvedValue(null);
      await expect(
        service.processTeacherQrScan({ qrData: 'nobody@x.rw' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('finds a teacher by either their email or their phone', async () => {
      prisma.teacher.findFirst.mockResolvedValue({
        id: 'teacher-1',
        user: { firstName: 'Aline', lastName: 'Uwase' },
      });
      prisma.teacherAttendance.findFirst.mockResolvedValue(null);
      prisma.teacherAttendance.create.mockResolvedValue({});
      await service.processTeacherQrScan({ qrData: 'a@markova.edu' });
      const or = prisma.teacher.findFirst.mock.calls[0][0].where.user.OR;
      expect(JSON.stringify(or)).toContain('email');
      expect(JSON.stringify(or)).toContain('phone');
    });

    it('says so on a second tap rather than writing another row', async () => {
      prisma.teacher.findFirst.mockResolvedValue({
        id: 'teacher-1',
        user: { firstName: 'Aline', lastName: 'Uwase' },
      });
      prisma.teacherAttendance.findFirst.mockResolvedValue({ id: 'ta-1' });
      const result = await service.processTeacherQrScan({
        qrData: 'a@markova.edu',
      });
      expect(result.duplicate).toBe(true);
      expect(prisma.teacherAttendance.create).not.toHaveBeenCalled();
    });

    it('applies the same lateness cutoff to staff', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 9, 5));
      prisma.teacher.findFirst.mockResolvedValue({
        id: 'teacher-1',
        user: { firstName: 'Aline', lastName: 'Uwase' },
      });
      prisma.teacherAttendance.findFirst.mockResolvedValue(null);
      prisma.teacherAttendance.create.mockResolvedValue({});
      await service.processTeacherQrScan({ qrData: 'a@markova.edu' });
      expect(prisma.teacherAttendance.create.mock.calls[0][0].data.status).toBe(
        'LATE',
      );
      jest.useRealTimers();
    });

    it('lists every teacher for a day, marked or not', async () => {
      prisma.teacher.findMany.mockResolvedValue([
        {
          id: 'teacher-1',
          user: { firstName: 'Aline', lastName: 'Uwase' },
          teacherAttendances: [{ status: 'PRESENT', scannedAt: null }],
        },
        {
          id: 'teacher-2',
          user: { firstName: 'Jean', lastName: 'Habimana' },
          teacherAttendances: [],
        },
      ]);
      const result = await service.getTeacherAttendance('2026-08-20');
      expect(result[0].status).toBe('PRESENT');
      expect(result[1].status).toBeNull();
    });

    it('lists only staff still employed', async () => {
      prisma.teacher.findMany.mockResolvedValue([]);
      await service.getTeacherAttendance('2026-08-20');
      expect(prisma.teacher.findMany.mock.calls[0][0].where).toEqual({
        isActive: true,
      });
    });
  });

  /**
   * Today across the school. The number a head teacher looks at first is which
   * classes have not taken a register yet, because that is the one they can
   * still do something about.
   */
  describe('the day at a glance', () => {
    const section = (id: string, students: number) => ({
      id,
      name: 'A',
      classLevel: { name: 'Senior 1' },
      _count: { students },
    });

    it('counts each class and the school overall', async () => {
      prisma.classSection.findMany.mockResolvedValue([
        section('section-1', 30),
        section('section-2', 20),
      ]);
      prisma.attendance.groupBy.mockResolvedValue([
        { classSectionId: 'section-1', status: 'PRESENT', _count: 25 },
        { classSectionId: 'section-1', status: 'LATE', _count: 2 },
      ]);

      const result = await service.getDashboardData('2026-08-20');
      expect(result.overall).toMatchObject({
        totalStudents: 50,
        present: 25,
        late: 2,
        absent: 23,
        rate: 54,
      });
    });

    /**
     * A class with nobody ticked is not a class where everybody was away; it
     * is a class where nobody took the register, and that is what the head
     * teacher needs to see.
     */
    it('says which classes have not taken a register at all', async () => {
      prisma.classSection.findMany.mockResolvedValue([
        section('section-1', 30),
        section('section-2', 20),
      ]);
      prisma.attendance.groupBy.mockResolvedValue([
        { classSectionId: 'section-1', status: 'PRESENT', _count: 30 },
      ]);

      const result = await service.getDashboardData('2026-08-20');
      expect(
        result.sections.find((s: any) => s.sectionId === 'section-1')!.marked,
      ).toBe(true);
      expect(
        result.sections.find((s: any) => s.sectionId === 'section-2')!.marked,
      ).toBe(false);
    });

    it('reports zero rather than dividing by an empty class', async () => {
      prisma.classSection.findMany.mockResolvedValue([section('section-1', 0)]);
      prisma.attendance.groupBy.mockResolvedValue([]);
      const result = await service.getDashboardData('2026-08-20');
      expect(result.sections[0].rate).toBe(0);
      expect(result.overall.rate).toBe(0);
    });

    it('counts only enrolled students in each class', async () => {
      prisma.classSection.findMany.mockResolvedValue([]);
      prisma.attendance.groupBy.mockResolvedValue([]);
      await service.getDashboardData('2026-08-20');
      const select =
        prisma.classSection.findMany.mock.calls[0][0].include._count.select;
      expect(select.students).toEqual({ where: { status: 'ACTIVE' } });
    });

    it('reads today when no day was named', async () => {
      prisma.classSection.findMany.mockResolvedValue([]);
      prisma.attendance.groupBy.mockResolvedValue([]);
      const result = await service.getDashboardData();
      expect(result.date).toBe(new Date().toISOString().slice(0, 10));
    });
  });
});

/**
 * Reading the register back, filtered every way the office asks.
 *
 * The list endpoint takes six optional filters, and an inspector asking for
 * one class, one subject, one type and one date range at once is the reason
 * they exist. Each is set on its own, so sending all six is the only way to
 * prove none of them is dropped.
 */
describe('filtering the register', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AttendanceService(
      prisma,
      { send: jest.fn() } as unknown as NotificationsService,
      delivery as never,
    );
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.count.mockResolvedValue(0);
  });

  it('applies every filter it is given at once', async () => {
    await service.findAll({
      studentId: 'student-1',
      classSectionId: 'section-1',
      type: 'subject',
      subjectId: 'subject-1',
      dateFrom: '2026-09-01',
      dateTo: '2026-12-15',
    });

    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      studentId: 'student-1',
      classSectionId: 'section-1',
      type: 'subject',
      subjectId: 'subject-1',
    });
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeInstanceOf(Date);
  });

  it('applies none of them when none is given', async () => {
    await service.findAll({});

    expect(prisma.attendance.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('takes an open-ended range from one end', async () => {
    await service.findAll({ dateFrom: '2026-09-01' });

    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeUndefined();
  });

  it('takes one from the other end', async () => {
    await service.findAll({ dateTo: '2026-12-15' });

    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.date.lte).toBeInstanceOf(Date);
    expect(where.date.gte).toBeUndefined();
  });
});

describe('one student’s attendance over a range', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AttendanceService(
      prisma,
      { send: jest.fn() } as unknown as NotificationsService,
      delivery as never,
    );
    prisma.attendance.findMany.mockResolvedValue([]);
  });

  it('takes both ends of a term', async () => {
    await service.getStudentSummary('student-1', '2026-09-01', '2026-12-15');

    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeInstanceOf(Date);
  });

  it('takes everything on file when no range is given', async () => {
    await service.getStudentSummary('student-1');

    expect(
      prisma.attendance.findMany.mock.calls[0][0].where.date,
    ).toBeUndefined();
  });

  it('takes an open-ended range from one end', async () => {
    await service.getStudentSummary('student-1', '2026-09-01');

    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeUndefined();
  });

  it('takes one from the other end', async () => {
    await service.getStudentSummary('student-1', undefined, '2026-12-15');

    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.date.lte).toBeInstanceOf(Date);
    expect(where.date.gte).toBeUndefined();
  });
});

/**
 * Telling parents their child has been missing school.
 *
 * The endpoint existed and the screen had no way to call it, so a head teacher
 * could see six children were chronically absent and had to ring each family
 * by hand.
 */
describe('alerting the families of chronically absent children', () => {
  const chronic = {
    studentId: 's-1',
    name: 'Divine Uwase',
    class: 'Senior 1 A',
    absentDays: 14,
    totalDays: 60,
    absenceRate: 23,
  };

  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AttendanceService;
  let notifications: { send: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    notifications = { send: jest.fn().mockResolvedValue({}) };
    service = new AttendanceService(
      prisma,
      notifications as unknown as NotificationsService,
      delivery as never,
    );
    delivery.email.mockClear();
    delivery.sms.mockClear();
    jest
      .spyOn(service, 'getChronicallyAbsent')
      .mockResolvedValue({ students: [chronic], threshold: 20 } as never);
    // The child is in school this week, not suspended or away.
    prisma.student.findUnique.mockResolvedValue({ status: 'ACTIVE' });
  });

  it('emails a parent who has an address', async () => {
    prisma.parentStudent.findMany.mockResolvedValue([
      {
        parentUserId: 'p-1',
        parent: { email: 'p@markova.edu', phone: null, firstName: 'Aline' },
      },
    ]);
    const out = await service.sendChronicAbsenteeismAlerts();
    expect(notifications.send).toHaveBeenCalled();
    expect(out.alertsSent).toBe(1);
  });

  /*
    The gap this closed. Most parents here are registered with a phone and no
    email, so skipping them meant the families least likely to be reached any
    other way were exactly the ones this never reached.
  */
  it('texts a parent who has only a phone', async () => {
    prisma.parentStudent.findMany.mockResolvedValue([
      {
        parentUserId: 'p-1',
        parent: { email: null, phone: '+250788100000', firstName: 'Aline' },
      },
    ]);
    const out = await service.sendChronicAbsenteeismAlerts();
    expect(delivery.sms).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+250788100000' }),
    );
    expect(out.alertsSent).toBe(1);
  });

  it('puts the child and the numbers in the text', async () => {
    prisma.parentStudent.findMany.mockResolvedValue([
      {
        parentUserId: 'p-1',
        parent: { email: null, phone: '+250788100000', firstName: 'Aline' },
      },
    ]);
    await service.sendChronicAbsenteeismAlerts();
    const { message } = delivery.sms.mock.calls[0][0];
    expect(message).toContain('Divine Uwase');
    expect(message).toContain('14');
    expect(message).toContain('60');
  });

  /* Counted rather than skipped in silence, so somebody can see which
     families need a phone call instead. */
  it('counts a parent who cannot be reached at all', async () => {
    prisma.parentStudent.findMany.mockResolvedValue([
      {
        parentUserId: 'p-1',
        parent: { email: null, phone: null, firstName: 'Aline' },
      },
    ]);
    const out = await service.sendChronicAbsenteeismAlerts();
    expect(out.unreachable).toBe(1);
    expect(out.alertsSent).toBe(0);
  });

  /* One family's message failing must not stop the rest of the run: the other
     five children still need their parents told. */
  it('carries on when one message fails', async () => {
    prisma.parentStudent.findMany.mockResolvedValue([
      {
        parentUserId: 'p-1',
        parent: { email: 'a@markova.edu', phone: null, firstName: 'Aline' },
      },
      {
        parentUserId: 'p-2',
        parent: { email: 'b@markova.edu', phone: null, firstName: 'Eric' },
      },
    ]);
    notifications.send
      .mockRejectedValueOnce(new Error('mail server refused'))
      .mockResolvedValueOnce({});
    const out = await service.sendChronicAbsenteeismAlerts();
    expect(out.alertsSent).toBe(1);
  });
});

/**
 * The dashboard on a morning before anybody has taken the register.
 *
 * Asked for today at half past seven this showed a school where nobody turned
 * up: every class at nought per cent, which reads as a catastrophe rather than
 * as an empty register. The same on a Sunday, and right through the holidays.
 */
describe('the attendance dashboard when today is empty', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AttendanceService(
      prisma,
      { send: jest.fn() } as unknown as NotificationsService,
      delivery as never,
    );
    prisma.classSection.findMany.mockResolvedValue([]);
    prisma.attendance.groupBy.mockResolvedValue([]);
  });

  it('falls back to the last day the register was taken', async () => {
    prisma.attendance.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ date: new Date('2026-08-28') });

    const out = await service.getDashboardData();
    expect(out.date).toBe('2026-08-28');
    expect(out.isFallback).toBe(true);
  });

  /* So the screen can say "the last register was Friday" rather than silently
     showing Friday's figures under today's heading. */
  it('says plainly that it is not today', async () => {
    prisma.attendance.findFirst.mockResolvedValueOnce({ id: 'a-1' });
    const out = await service.getDashboardData();
    expect(out.isFallback).toBe(false);
  });

  /*
    Only when no date was asked for. Somebody who explicitly asks for the
    fifteenth wants the fifteenth, and quietly showing them the fourteenth
    would be worse than showing them nothing.
  */
  it('shows an explicitly requested day exactly as asked', async () => {
    const out = await service.getDashboardData('2026-08-15');
    expect(out.date).toBe('2026-08-15');
    expect(out.isFallback).toBe(false);
    expect(prisma.attendance.findFirst).not.toHaveBeenCalled();
  });

  /* A school on its first morning has no earlier register to fall back to.
     Showing today, empty, is then the honest answer. */
  it('stays on today when there is no earlier register at all', async () => {
    prisma.attendance.findFirst.mockResolvedValue(null);
    const out = await service.getDashboardData();
    expect(out.isFallback).toBe(false);
  });
});

/**
 * A student suspended or away is on the register but neither present nor
 * absent, and their family is never texted that they were absent. One who
 * has left is not on the register at all (B8 and A9).
 */
describe('AttendanceService and a student out of school', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let notifications: { send: jest.Mock };
  let service: AttendanceService;
  const smsQueue = { sms: jest.fn(), email: jest.fn() };

  const suspendedUntil20th = {
    studentId: 'suspended',
    kind: 'SUSPENDED',
    startsOn: new Date('2026-10-13T00:00:00Z'),
    endsOn: new Date('2026-10-20T00:00:00Z'),
    reason: 'Fighting',
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    notifications = { send: jest.fn().mockResolvedValue({}) };
    smsQueue.sms.mockReset();
    service = new AttendanceService(
      prisma,
      notifications as unknown as NotificationsService,
      smsQueue as never,
    );
    prisma.attendance.findFirst.mockResolvedValue(null);
    prisma.attendance.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `att-${data.studentId}`, ...data }),
    );
    prisma.parentStudent.findMany.mockResolvedValue([
      {
        parentUserId: 'parent-1',
        parent: { phone: '+250788100000', email: null, firstName: 'Claudine' },
        student: { user: { firstName: 'Keza', lastName: 'Habimana' } },
      },
    ]);
  });

  const student = (id: string, status = 'ACTIVE') => ({
    id,
    status,
    classSectionId: 'section-1',
    studentIdNumber: id,
    user: { firstName: 'Keza', lastName: 'Habimana' },
  });

  it('leaves a suspended student out of a register taken for the class', async () => {
    prisma.studentPause.findMany.mockResolvedValue([suspendedUntil20th]);
    prisma.student.findMany.mockResolvedValue([
      { id: 'present' },
      { id: 'suspended' },
    ]);
    const result = await service.bulkMarkAttendance(
      {
        classSectionId: 'section-1',
        date: '2026-10-14',
        type: 'daily',
        records: [
          { studentId: 'present', status: 'PRESENT' },
          { studentId: 'suspended', status: 'ABSENT' },
        ],
      } as never,
      'teacher-1',
    );
    expect(result.count).toBe(1);
    expect(result.skipped).toEqual([
      { studentId: 'suspended', reason: 'Suspended' },
    ]);
    expect(prisma.attendance.create).toHaveBeenCalledTimes(1);
    expect(smsQueue.sms).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('leaves a student who has left out of it too', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    const result = await service.bulkMarkAttendance(
      {
        classSectionId: 'section-1',
        date: '2026-10-14',
        type: 'daily',
        records: [{ studentId: 'gone', status: 'ABSENT' }],
      } as never,
      'teacher-1',
    );
    expect(result.skipped).toEqual([
      { studentId: 'gone', reason: 'Not on the roll' },
    ]);
  });

  it('refuses to mark one suspended student, and says until when', async () => {
    prisma.student.findUnique.mockResolvedValue(student('suspended'));
    prisma.studentPause.findMany.mockResolvedValue([suspendedUntil20th]);
    await expect(
      service.markAttendance(
        {
          studentId: 'suspended',
          classSectionId: 'section-1',
          date: '2026-10-14',
          type: 'daily',
          status: 'ABSENT',
        } as never,
        'teacher-1',
      ),
    ).rejects.toThrow(
      'Keza Habimana is suspended until 20 October, so is not marked present or absent',
    );
  });

  it('turns a suspended student away at the gate scanner', async () => {
    prisma.student.findFirst.mockResolvedValue(student('suspended'));
    prisma.studentPause.findMany.mockResolvedValue([suspendedUntil20th]);
    await expect(
      service.processQrScan(
        { qrData: 'suspended', classSectionId: 'section-1' },
        'guard-1',
      ),
    ).rejects.toThrow(/is suspended until 20 October/);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('turns away a student who has left, saying so', async () => {
    prisma.student.findFirst.mockResolvedValue(student('gone', 'EXPELLED'));
    await expect(
      service.processQrScan(
        { qrData: 'gone', classSectionId: 'section-1' },
        'guard-1',
      ),
    ).rejects.toThrow('Keza Habimana is not on the roll (expelled)');
  });

  it('shows a paused student on the class register, in none of the counts', async () => {
    prisma.student.findMany.mockResolvedValue([
      { ...student('present'), attendances: [{ status: 'PRESENT' }] },
      { ...student('suspended'), attendances: [] },
    ]);
    prisma.studentPause.findMany.mockResolvedValue([suspendedUntil20th]);
    const register = await service.getClassAttendance(
      'section-1',
      '2026-10-14',
    );
    expect(register).toMatchObject({
      total: 1,
      present: 1,
      absent: 0,
      paused: 1,
      rate: 100,
    });
    const shown = register.students.find((s) => s.studentId === 'suspended');
    expect(shown).toMatchObject({
      status: null,
      pause: { kind: 'SUSPENDED', label: 'Suspended' },
    });
  });

  it('texts the family of an absent student in school as before', async () => {
    prisma.student.findUnique.mockResolvedValue(student('s1'));
    prisma.studentPause.findMany.mockResolvedValue([]);
    await service.markAttendance(
      {
        studentId: 's1',
        classSectionId: 'section-1',
        date: '2026-10-14',
        type: 'daily',
        status: 'ABSENT',
      } as never,
      'teacher-1',
    );
    const told =
      notifications.send.mock.calls.length + smsQueue.sms.mock.calls.length;
    expect(told).toBeGreaterThan(0);
    // Only parents whose accounts are open.
    expect(prisma.parentStudent.findMany.mock.calls[0][0].where).toEqual({
      studentId: 's1',
      parent: { isActive: true },
    });
  });
});
