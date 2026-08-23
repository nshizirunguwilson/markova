import { BadRequestException } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { OwnershipService } from '../../common/ownership.service';
import {
  clearMocks,
  admin,
  controllerHarness,
  mockService,
  parent,
  type RouteCase,
} from '../../test/controller';

/**
 * Attendance routes.
 *
 * Two routes need a date and cannot do anything sensible without one. Falling
 * back to today would quietly show the wrong day's register, which is worse
 * than refusing, so both refuse.
 */
describe('AttendanceController', () => {
  const service = mockService([
    'markAttendance',
    'bulkMarkAttendance',
    'processQrScan',
    'findAll',
    'getClassAttendance',
    'getStudentSummary',
    'processNfcScan',
    'registerNfcCard',
    'getClassStudentsWithNfc',
    'markTeacherAttendance',
    'processTeacherQrScan',
    'getTeacherAttendance',
    'getChronicallyAbsent',
    'sendChronicAbsenteeismAlerts',
    'getDashboardData',
  ]);
  const ownership = mockService(['verifyStudentAccess']);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service, ownership);
    run = await controllerHarness(AttendanceController, [
      { token: AttendanceService, name: 'service', mock: service },
      { token: OwnershipService, name: 'ownership', mock: ownership },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'one student marked, attributed to whoever marked them',
      call: (c) => c.markAttendance({ studentId: 'student-1' }, admin),
      calls: 'markAttendance',
      withArgs: [{ studentId: 'student-1' }, admin.id],
    },
    {
      name: 'a whole register taken',
      call: (c) => c.bulkMark({ records: [] }, admin),
      calls: 'bulkMarkAttendance',
      withArgs: [{ records: [] }, admin.id],
    },
    {
      name: 'a QR scan at the gate',
      call: (c) => c.qrScan({ code: 'abc' }, admin),
      calls: 'processQrScan',
      withArgs: [{ code: 'abc' }, admin.id],
    },
    {
      name: 'the list, filtered',
      call: (c) => c.findAll({ classSectionId: 'section-1' }),
      calls: 'findAll',
      withArgs: [{ classSectionId: 'section-1' }],
    },
    {
      name: 'one class on one day',
      call: (c) => c.getClassAttendance('section-1', '2026-08-20'),
      calls: 'getClassAttendance',
      withArgs: ['section-1', '2026-08-20'],
    },
    {
      name: 'one student’s attendance over a range',
      call: (c) =>
        c.getStudentSummary('student-1', '2026-08-01', '2026-08-31', parent),
      calls: 'getStudentSummary',
      withArgs: ['student-1', '2026-08-01', '2026-08-31'],
    },
    {
      name: 'a card tapped at the gate',
      call: (c) => c.nfcScan({ cardId: 'card-1' }, admin),
      calls: 'processNfcScan',
      withArgs: [{ cardId: 'card-1' }, admin.id],
    },
    {
      name: 'a card registered to a student',
      call: (c) => c.registerNfc({ studentId: 'student-1', cardId: 'card-1' }),
      calls: 'registerNfcCard',
      withArgs: [{ studentId: 'student-1', cardId: 'card-1' }],
    },
    {
      name: 'a class’s cards, for the phone to cache',
      call: (c) => c.getClassStudentsWithNfc('section-1'),
      calls: 'getClassStudentsWithNfc',
      withArgs: ['section-1'],
    },
    {
      name: 'a teacher marked in',
      call: (c) => c.markTeacherAttendance({ teacherId: 'teacher-1' }),
      calls: 'markTeacherAttendance',
      withArgs: [{ teacherId: 'teacher-1' }],
    },
    {
      name: 'a teacher scanning in',
      call: (c) => c.teacherQrScan({ code: 'abc' }),
      calls: 'processTeacherQrScan',
      withArgs: [{ code: 'abc' }],
    },
    {
      name: 'which staff came in on a day',
      call: (c) => c.getTeacherAttendance('2026-08-20'),
      calls: 'getTeacherAttendance',
      withArgs: ['2026-08-20'],
    },
    {
      name: 'who keeps being away',
      call: (c) => c.getChronic('section-1', '5'),
      calls: 'getChronicallyAbsent',
      withArgs: ['section-1', 5],
    },
    {
      name: 'the school-wide threshold when none is given',
      call: (c) => c.getChronic(),
      calls: 'getChronicallyAbsent',
      withArgs: [undefined, undefined],
    },
    {
      name: 'those families told',
      call: (c) => c.sendChronicAlerts(),
      calls: 'sendChronicAbsenteeismAlerts',
      withArgs: [],
    },
    {
      name: 'today at a glance',
      call: (c) => c.getDashboard('2026-08-20'),
      calls: 'getDashboardData',
      withArgs: ['2026-08-20'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * Defaulting to today would show the wrong register without saying so, and
   * a register is a legal record of who was in the building.
   */
  describe('a register without a date is refused, not guessed', () => {
    it('refuses a class register with no date', async () => {
      const run2 = await controllerHarness(AttendanceController, [
        { token: AttendanceService, name: 'service', mock: service },
        { token: OwnershipService, name: 'ownership', mock: ownership },
      ]);
      await expect(
        run2({
          name: 'no date',
          call: (c) => c.getClassAttendance('section-1', ''),
          calls: 'getClassAttendance',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.getClassAttendance).not.toHaveBeenCalled();
    });

    it('refuses a staff register with no date', async () => {
      const run2 = await controllerHarness(AttendanceController, [
        { token: AttendanceService, name: 'service', mock: service },
        { token: OwnershipService, name: 'ownership', mock: ownership },
      ]);
      await expect(
        run2({
          name: 'no date',
          call: (c) => c.getTeacherAttendance(''),
          calls: 'getTeacherAttendance',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.getTeacherAttendance).not.toHaveBeenCalled();
    });
  });

  it('checks whose student before summarising their attendance', async () => {
    await run({
      name: 'checked',
      call: (c) => c.getStudentSummary('student-1', undefined, undefined, parent),
      on: 'ownership',
      calls: 'verifyStudentAccess',
      withArgs: [parent.id, 'PARENT', 'student-1'],
    });
  });
});
