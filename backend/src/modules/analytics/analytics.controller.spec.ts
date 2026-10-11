import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { OwnershipService } from '../../common/ownership.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  parent,
  teacher,
  type RouteCase,
} from '../../test/controller';

/**
 * Analytics routes.
 *
 * The school-wide ones are admin only and take nothing but a scope. The three
 * that name a student are the interesting ones: each has to check whose
 * student it is before answering, because a role alone cannot.
 */
describe('AnalyticsController', () => {
  const service = mockService([
    'getAdminDashboard',
    'getPerformanceTrends',
    'getClassComparisons',
    'getDisciplineStats',
    'getLibraryStats',
    'getAttendanceStats',
    'getGradeDistribution',
    'getEnrollmentBreakdown',
    'getStudentProfileAnalytics',
    'getTeacherClassAnalytics',
    'getStudentAnalytics',
    'getParentChildTrends',
  ]);
  const ownership = mockService(['verifyStudentAccess', 'parentKept']);

  const withTeacherId = { ...teacher, teacherId: 'teacher-1' };

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service, ownership);
    // Nothing kept from the parent unless a test says so.
    ownership.parentKept.mockResolvedValue(false);
    run = await controllerHarness(AnalyticsController, [
      { token: AnalyticsService, name: 'service', mock: service },
      { token: OwnershipService, name: 'ownership', mock: ownership },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'the head teacher’s dashboard',
      call: (c) => c.getAdminDashboard('year-1', 'term-1'),
      calls: 'getAdminDashboard',
      withArgs: ['year-1', 'term-1'],
    },
    {
      name: 'performance over a year',
      call: (c) => c.getPerformanceTrends('year-1'),
      calls: 'getPerformanceTrends',
      withArgs: ['year-1'],
    },
    {
      name: 'class against class',
      call: (c) => c.getClassComparisons('term-1'),
      calls: 'getClassComparisons',
      withArgs: ['term-1'],
    },
    {
      name: 'discipline across the school',
      call: (c) => c.getDisciplineStats('year-1'),
      calls: 'getDisciplineStats',
      withArgs: ['year-1'],
    },
    {
      name: 'the library',
      call: (c) => c.getLibraryStats(),
      calls: 'getLibraryStats',
      withArgs: [],
    },
    {
      name: 'attendance across the school',
      call: (c) => c.getAttendanceStats('term-1'),
      calls: 'getAttendanceStats',
      withArgs: ['term-1'],
    },
    {
      name: 'the spread of grades',
      call: (c) => c.getGradeDistribution('term-1'),
      calls: 'getGradeDistribution',
      withArgs: ['term-1'],
    },
    {
      name: 'who is on the roll',
      call: (c) => c.getEnrollment(),
      calls: 'getEnrollmentBreakdown',
      withArgs: [],
    },
    {
      name: 'one student’s profile',
      call: (c) => c.getStudentProfile('student-1', parent),
      calls: 'getStudentProfileAnalytics',
      withArgs: ['student-1', 'PARENT'],
    },
    {
      // The teacher id, not the user id. The two are different rows and
      // comparing the wrong one silently matches nothing.
      name: 'a teacher’s own class, as their teacher record',
      call: (c) =>
        c.getTeacherClassAnalytics(
          { user: withTeacherId },
          'section-1',
          'term-1',
        ),
      calls: 'getTeacherClassAnalytics',
      withArgs: ['teacher-1', 'section-1', 'term-1'],
    },
    {
      name: 'one student’s numbers for a term',
      call: (c) =>
        c.getStudentAnalytics('student-1', 'term-1', { user: parent }),
      calls: 'getStudentAnalytics',
      withArgs: ['student-1', 'term-1', 'PARENT'],
    },
    {
      name: 'a child’s trend across a year',
      call: (c) =>
        c.getParentChildTrends('student-1', 'year-1', { user: parent }),
      calls: 'getParentChildTrends',
      withArgs: ['student-1', 'year-1'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  describe('every route naming a student checks whose it is', () => {
    it.each([
      ['the profile', (c: any) => c.getStudentProfile('student-1', parent)],
      [
        'the term numbers',
        (c: any) => c.getStudentAnalytics('student-1', 't', { user: parent }),
      ],
      [
        'the year trend',
        (c: any) => c.getParentChildTrends('student-1', 'y', { user: parent }),
      ],
    ])('%s', async (_n, call) => {
      await run({
        name: 'checked',
        call,
        on: 'ownership',
        calls: 'verifyStudentAccess',
        withArgs: [parent.id, 'PARENT', 'student-1', 'results'],
      });
    });

    it('refuses before answering', async () => {
      ownership.verifyStudentAccess.mockRejectedValueOnce(
        new Error('Forbidden'),
      );
      const run2 = await controllerHarness(AnalyticsController, [
        { token: AnalyticsService, name: 'service', mock: service },
        { token: OwnershipService, name: 'ownership', mock: ownership },
      ]);
      await expect(
        run2({
          name: 'blocked',
          call: (c) => c.getStudentProfile('student-1', parent),
          calls: 'getStudentProfileAnalytics',
        }),
      ).rejects.toThrow();
      expect(service.getStudentProfileAnalytics).not.toHaveBeenCalled();
    });
  });
});
