import { waitFor } from '@testing-library/react-native';

import { givenApi, http, resetApi } from '@/test/api-mock';
import { renderApiHook } from '@/test/harness';

import * as useApi from './useApi';

/**
 * Every read the app makes.
 *
 * These hooks are thin on purpose, and that is exactly why they are worth a
 * table: what can go wrong is a wrong URL, a parameter the API does not
 * accept, or a query that fires before it has the id it needs. All three are
 * silent at build time and show up as an empty screen.
 *
 * Two of them exist because of that last kind of bug and carry a note in the
 * source saying so: useClassStudents and useStudentMarks both moved off an
 * admin-only route that returned 403 for the very people who needed it.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

type Case = {
  /** The hook under test, already given its arguments. */
  hook: () => unknown;
  url: string;
  params?: Record<string, unknown>;
  /** The same hook with its key argument missing, if it has one. */
  withoutItsKey?: () => unknown;
};

const ID = 'a0000000-0000-4000-8000-000000000001';

const cases: Record<string, Case> = {
  // ─── Academic ─────────────────────────────────────────
  'the years a school has run': {
    hook: () => useApi.useAcademicYears(),
    url: '/academic/years',
  },
  'the terms in a year': {
    hook: () => useApi.useTerms(ID),
    url: '/academic/terms',
    params: { academicYearId: ID },
    withoutItsKey: () => useApi.useTerms(),
  },
  'the class sections': {
    hook: () => useApi.useClassSections(ID),
    url: '/academic/sections',
    params: { classLevelId: ID },
  },
  'the subjects taught': {
    hook: () => useApi.useSubjects(),
    url: '/academic/subjects',
  },
  'the kinds of assessment': {
    hook: () => useApi.useAssessmentTypes(),
    url: '/academic/assessment-types',
  },
  'what a teacher is assigned to': {
    hook: () => useApi.useTeacherAssignments(ID),
    url: '/academic/assignments',
    params: { teacherId: ID },
    withoutItsKey: () => useApi.useTeacherAssignments(),
  },
  'every teaching load in the school': {
    hook: () => useApi.useAllAssignments(),
    url: '/academic/assignments',
  },
  'who teaches a class': {
    hook: () => useApi.useClassTeachers(ID),
    url: '/academic/assignments',
    params: { classSectionId: ID },
    withoutItsKey: () => useApi.useClassTeachers(),
  },
  'the year levels': {
    hook: () => useApi.useClassLevels(),
    url: '/academic/class-levels',
  },
  'the trades a school offers': {
    hook: () => useApi.useTrades(),
    url: '/academic/trades',
  },

  // ─── Timetable and exams ──────────────────────────────
  'a class timetable': {
    hook: () => useApi.useTimetable(ID),
    url: '/academic/timetable',
    params: { classSectionId: ID },
    withoutItsKey: () => useApi.useTimetable(),
  },
  'a teacher timetable': {
    hook: () => useApi.useTeacherTimetable(ID),
    url: `/academic/timetable/teacher/${ID}`,
    withoutItsKey: () => useApi.useTeacherTimetable(),
  },
  'when the exams are': {
    hook: () => useApi.useExamSchedule(ID, 'term-1'),
    url: '/academic/exams',
    params: { classSectionId: ID, termId: 'term-1' },
    withoutItsKey: () => useApi.useExamSchedule(undefined, 'term-1'),
  },

  // ─── Attendance ───────────────────────────────────────
  'one child’s attendance': {
    hook: () => useApi.useAttendanceSummary(ID, '2026-01-01', '2026-08-24'),
    url: '/attendance/student-summary',
    params: { studentId: ID, dateFrom: '2026-01-01', dateTo: '2026-08-24' },
    withoutItsKey: () => useApi.useAttendanceSummary(),
  },
  'the whole school’s attendance': {
    hook: () => useApi.useAttendanceDashboard('2026-08-24'),
    url: '/attendance/dashboard',
    params: { date: '2026-08-24' },
  },
  'who keeps missing school': {
    hook: () => useApi.useChronicAbsentees(),
    url: '/attendance/chronic',
  },
  'a class roster for the NFC reader': {
    hook: () => useApi.useClassStudentsNfc(ID),
    url: '/attendance/class-students',
    params: { classSectionId: ID },
    withoutItsKey: () => useApi.useClassStudentsNfc(),
  },

  // ─── Marks ────────────────────────────────────────────
  'a report card': {
    hook: () => useApi.useReportCard(ID, 'term-1'),
    url: `/marks/report-card/${ID}`,
    params: { termId: 'term-1' },
    withoutItsKey: () => useApi.useReportCard(undefined, 'term-1'),
  },
  'how much of a class is marked': {
    hook: () => useApi.useMarksCompletion(ID, 'term-1'),
    url: '/marks/completion',
    params: { classSectionId: ID, termId: 'term-1' },
    withoutItsKey: () => useApi.useMarksCompletion(ID),
  },
  'a whole class’s results': {
    hook: () => useApi.useClassTermResults(ID, 'term-1'),
    url: '/marks/term-results/class',
    params: { classSectionId: ID, termId: 'term-1' },
    withoutItsKey: () => useApi.useClassTermResults(ID),
  },
  'a year’s results for one child': {
    hook: () => useApi.useStudentYearResult(ID, 'year-1'),
    url: `/marks/year-results/student/${ID}`,
    params: { academicYearId: 'year-1' },
    withoutItsKey: () => useApi.useStudentYearResult(ID),
  },

  // ─── Discipline ───────────────────────────────────────
  'one child’s record': {
    hook: () => useApi.useStudentDiscipline(ID),
    url: `/discipline/student/${ID}`,
    withoutItsKey: () => useApi.useStudentDiscipline(),
  },
  'the incident log': {
    hook: () => useApi.useIncidents({ termId: 'term-1' }),
    url: '/discipline/incidents',
    params: { termId: 'term-1' },
  },
  'appeals waiting to be read': {
    hook: () => useApi.usePendingAppeals(),
    url: '/discipline/appeals/pending',
  },
  'the discipline picture': {
    hook: () => useApi.useDisciplineDashboard('term-1'),
    url: '/discipline/dashboard',
    params: { termId: 'term-1' },
  },
  'where a child stands': {
    hook: () => useApi.useStanding(ID),
    url: `/discipline/standing/${ID}`,
    withoutItsKey: () => useApi.useStanding(),
  },

  // ─── Homework ─────────────────────────────────────────
  'what a child has been set': {
    hook: () => useApi.useStudentHomework(ID),
    url: `/homework/student/${ID}`,
    withoutItsKey: () => useApi.useStudentHomework(),
  },
  'what a class has been set': {
    hook: () => useApi.useHomeworkList({ classSectionId: ID }),
    url: '/homework',
    params: { classSectionId: ID },
  },

  // ─── Notifications and messaging ──────────────────────
  'what is waiting to be read': {
    hook: () => useApi.useNotifications(),
    url: '/notifications',
  },
  'the conversations': {
    hook: () => useApi.useConversations(),
    url: '/messaging/conversations',
  },
  'who can be messaged': {
    hook: () => useApi.useContacts(),
    url: '/messaging/contacts',
  },

  // ─── Library ──────────────────────────────────────────
  'one book': {
    hook: () => useApi.useBook(ID),
    url: `/library/books/${ID}`,
    withoutItsKey: () => useApi.useBook(),
  },
  'the books out on loan': {
    hook: () => useApi.useActiveLoans(),
    url: '/library/loans/active',
  },
  'the books that are late': {
    hook: () => useApi.useOverdueLoans(),
    url: '/library/loans/overdue',
  },
  'the books I have out': {
    hook: () => useApi.useMyLoans(),
    url: '/library/loans/my',
  },

  // ─── Analytics ────────────────────────────────────────
  'the admin dashboard': {
    hook: () => useApi.useAdminDashboard(),
    url: '/analytics/admin/dashboard',
  },
  'one class’s analytics': {
    hook: () => useApi.useTeacherClassAnalytics(ID),
    url: `/analytics/teacher/class/${ID}`,
    withoutItsKey: () => useApi.useTeacherClassAnalytics(),
  },
  'a named admin view': {
    hook: () => useApi.useAdminAnalytics('attendance', { termId: 'term-1' }),
    url: '/analytics/admin/attendance',
    params: { termId: 'term-1' },
  },
  'one child’s analytics': {
    hook: () => useApi.useStudentAnalytics(ID, 'term-1'),
    url: `/analytics/student/${ID}`,
    params: { termId: 'term-1' },
    withoutItsKey: () => useApi.useStudentAnalytics(),
  },
  'how a child is trending': {
    hook: () => useApi.useParentChildTrends(ID, 'year-1'),
    url: `/analytics/parent/child/${ID}/trends`,
    params: { academicYearId: 'year-1' },
    withoutItsKey: () => useApi.useParentChildTrends(),
  },

  // ─── Help ─────────────────────────────────────────────
  'my support tickets': {
    hook: () => useApi.useMyTickets(),
    url: '/help/tickets/mine',
  },

  // ─── People and settings ──────────────────────────────
  'one person': {
    hook: () => useApi.usePerson(ID),
    url: `/users/${ID}`,
    withoutItsKey: () => useApi.usePerson(),
  },
  'the school settings': {
    hook: () => useApi.useSchoolConfig(),
    url: '/school-config',
  },
  'how far setup has got': {
    hook: () => useApi.useOnboardingStatus(),
    url: '/school-config/onboarding',
  },
  'where else somebody is signed in': {
    hook: () => useApi.useSessions(),
    url: '/auth/sessions',
  },

  // ─── Cards and promotion ──────────────────────────────
  'the ID card register': {
    hook: () => useApi.useIdCardRegistry({ classSectionId: ID }),
    url: '/reports/id-cards/registry',
    params: { classSectionId: ID },
  },

  // ─── Pocket money ─────────────────────────────────────
  'a child’s pocket money': {
    hook: () => useApi.usePocketMoneyAccount(ID),
    url: `/pocket-money/student/${ID}`,
    withoutItsKey: () => useApi.usePocketMoneyAccount(),
  },
  'a child’s spending': {
    hook: () => useApi.usePocketMoneyStatement(ID),
    url: `/pocket-money/student/${ID}/statement`,
    params: { limit: 50 },
    withoutItsKey: () => useApi.usePocketMoneyStatement(),
  },

  // ─── Activities ───────────────────────────────────────
  'what is coming up': {
    hook: () => useApi.useUpcomingActivities(5),
    url: '/activities/upcoming',
    params: { limit: 5 },
  },
  'what is coming up, unasked': {
    hook: () => useApi.useUpcomingActivities(),
    url: '/activities/upcoming',
    params: { limit: 10 },
  },
  'what one child is signed up for': {
    hook: () => useApi.useStudentActivities(ID),
    url: `/activities/student/${ID}`,
    withoutItsKey: () => useApi.useStudentActivities(),
  },

  // ─── The clinic ───────────────────────────────────────
  'who has been to the sick bay': {
    hook: () => useApi.useClinicVisits({ severity: 'SERIOUS' }),
    url: '/clinic/visits',
    params: { severity: 'SERIOUS' },
  },
  'the month in the sick bay': {
    hook: () => useApi.useClinicSummary(7),
    url: '/clinic/summary',
    params: { days: 7 },
  },
  'the month in the sick bay, unasked': {
    hook: () => useApi.useClinicSummary(),
    url: '/clinic/summary',
    params: { days: 30 },
  },
  'who has been to the sick bay, unfiltered': {
    hook: () => useApi.useClinicVisits(),
    url: '/clinic/visits',
    params: {},
  },
  'a named admin view with nothing to narrow it': {
    hook: () => useApi.useAdminAnalytics('attendance'),
    url: '/analytics/admin/attendance',
  },
  'the page somebody needs at three in the morning': {
    hook: () => useApi.useEmergencyCard(ID),
    url: `/clinic/student/${ID}`,
    withoutItsKey: () => useApi.useEmergencyCard(),
  },
  'one child’s visits': {
    hook: () => useApi.useStudentVisits(ID),
    url: `/clinic/student/${ID}/visits`,
    withoutItsKey: () => useApi.useStudentVisits(),
  },
};

beforeEach(resetApi);

describe.each(Object.entries(cases))('reading %s', (_name, testCase) => {
  it('asks the right endpoint and hands back what it said', async () => {
    givenApi({ [testCase.url]: { read: 'ok' } });

    const { run } = renderApiHook(testCase.hook);
    const { result } = await run();

    await waitFor(() =>
      expect((result.current as { data: unknown }).data).toEqual({ read: 'ok' }),
    );
    const [url, config] = http.get.mock.calls[0];
    expect(url).toBe(testCase.url);
    if (testCase.params) {
      expect((config as unknown as { params: unknown }).params).toMatchObject(
        testCase.params,
      );
    }
  });

  it('lets a failure reach the screen rather than swallowing it', async () => {
    const { run } = renderApiHook(testCase.hook);
    const { result } = await run();

    await waitFor(() =>
      expect((result.current as { isError: boolean }).isError).toBe(true),
    );
  });
});

/**
 * A query that fires without the id it needs is a request the API answers
 * with a 400 or, worse, with somebody else's data. These hooks wait.
 */
describe.each(
  Object.entries(cases).filter(([, c]) => c.withoutItsKey),
)('reading %s without what it needs', (_name, testCase) => {
  it('does not ask at all', async () => {
    const { run } = renderApiHook(testCase.withoutItsKey!);
    const { result } = await run();

    expect((result.current as { fetchStatus: string }).fetchStatus).toBe('idle');
    expect(http.get).not.toHaveBeenCalled();
  });
});

/**
 * A day's register. The API answers with a summary holding the list in
 * `students`; the hook hands back the list, which is what the screen reads.
 * Reading the summary as the list is what broke a register already taken.
 */
describe('reading a register for one day', () => {
  it('asks for the class and the day, and hands back the students', async () => {
    givenApi({
      '/attendance/class': {
        total: 1,
        students: [{ studentId: 's1', status: 'PRESENT', pause: null }],
      },
    });
    const { run } = renderApiHook(() => useApi.useClassAttendance(ID, '2026-08-24'));
    const { result } = await run();
    await waitFor(() =>
      expect((result.current as { data: unknown }).data).toEqual([
        { studentId: 's1', status: 'PRESENT', pause: null },
      ]),
    );
    expect(http.get).toHaveBeenCalledWith('/attendance/class', {
      params: { classSectionId: ID, date: '2026-08-24' },
    });
  });

  it('hands back nothing for a summary with no list', async () => {
    givenApi({ '/attendance/class': {} });
    const { run } = renderApiHook(() => useApi.useClassAttendance(ID, '2026-08-24'));
    const { result } = await run();
    await waitFor(() => expect((result.current as { data: unknown }).data).toEqual([]));
  });

  it('waits for a day', async () => {
    const { run } = renderApiHook(() => useApi.useClassAttendance(ID));
    await run();
    expect(http.get).not.toHaveBeenCalled();
  });
});
