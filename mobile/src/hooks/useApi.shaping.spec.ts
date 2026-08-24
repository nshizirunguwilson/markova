import { act, waitFor } from '@testing-library/react-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { renderApiHook } from '@/test/harness';

import * as useApi from './useApi';

/**
 * The hooks that do more than pass a URL through.
 *
 * Each one here exists because the API's shape and the screen's shape are not
 * the same, and several carry a note in the source explaining which bug they
 * were written to fix. Those notes are the tests below.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const read = async <T,>(hook: () => T) => {
  const { run } = renderApiHook(hook);
  const { result } = await run();
  await waitFor(() =>
    expect((result.current as { isPending: boolean }).isPending).toBe(false),
  );
  return result as { current: T };
};

const write = async <T extends { mutateAsync: (v: never) => Promise<unknown> }>(
  hook: () => T,
  value: unknown,
) => {
  const { run } = renderApiHook(hook);
  const { result } = await run();
  let answer: unknown;
  await act(async () => {
    answer = await result.current.mutateAsync(value as never).catch((e) => e);
  });
  return answer;
};

beforeEach(resetApi);

/**
 * "Which term is it" is asked by nearly every screen and the API has no one
 * endpoint for it: the current year has to be found first, then the current
 * term inside it.
 */
describe('working out which term it is', () => {
  const years = [
    { id: 'year-1', name: '2025', isCurrent: false },
    { id: 'year-2', name: '2026', isCurrent: true },
  ];

  it('finds the term inside the year the school is in', async () => {
    givenApi({
      '/academic/years': years,
      '/academic/terms': [
        { id: 'term-1', name: 'Term 1', isCurrent: false },
        { id: 'term-2', name: 'Term 2', isCurrent: true },
      ],
    });

    const result = await read(useApi.useCurrentTerm);

    expect(result.current.data).toMatchObject({ id: 'term-2' });
    expect(http.get).toHaveBeenCalledWith('/academic/terms', {
      params: { academicYearId: 'year-2' },
    });
  });

  /**
   * Between terms nothing is marked current. Falling back to the last one is
   * what lets a parent still read last term's report over the holidays.
   */
  it('falls back to the last term when the school is between them', async () => {
    givenApi({
      '/academic/years': years,
      '/academic/terms': [
        { id: 'term-1', name: 'Term 1', isCurrent: false },
        { id: 'term-3', name: 'Term 3', isCurrent: false },
      ],
    });

    const result = await read(useApi.useCurrentTerm);

    expect(result.current.data).toMatchObject({ id: 'term-3' });
  });

  it('says there is none when a school has set no current year', async () => {
    givenApi({ '/academic/years': [{ id: 'year-1', isCurrent: false }] });

    const result = await read(useApi.useCurrentTerm);

    expect(result.current.data).toBeNull();
  });

  it('says there is none when the year has no terms in it yet', async () => {
    givenApi({ '/academic/years': years, '/academic/terms': [] });

    const result = await read(useApi.useCurrentTerm);

    expect(result.current.data).toBeNull();
  });
});

/**
 * Reads the attendance module's class roster rather than GET /users, which is
 * admin-only. That route returned 403 for every teacher, so marks entry,
 * attendance, discipline logging and NFC registration all showed an empty
 * class. The flat row it answers with is mapped back into the nested shape
 * the screens are typed against.
 */
describe('the students in a class', () => {
  const row = {
    id: 'student-1',
    userId: 'user-9',
    studentIdNumber: 'STD-2025-0417',
    nfcCardId: 'ABCD-EFGH',
    firstName: 'Aline',
    lastName: 'Uwase',
  };

  it('reads the roster a teacher is actually allowed to read', async () => {
    givenApi({ '/attendance/class-students': [row] });

    await read(() => useApi.useClassStudents('section-1'));

    expect(http.get).toHaveBeenCalledWith('/attendance/class-students', {
      params: { classSectionId: 'section-1' },
    });
  });

  it('folds the flat row back into the shape the screens expect', async () => {
    givenApi({ '/attendance/class-students': [row] });

    const result = await read(() => useApi.useClassStudents('section-1'));

    expect(result.current.data).toEqual([
      {
        id: 'student-1',
        userId: 'user-9',
        classSectionId: 'section-1',
        studentIdNumber: 'STD-2025-0417',
        nfcCardId: 'ABCD-EFGH',
        user: {
          id: 'user-9',
          firstName: 'Aline',
          lastName: 'Uwase',
          email: '',
        },
      },
    ]);
  });

  it('leaves a child with no card without one, rather than with null', async () => {
    givenApi({
      '/attendance/class-students': [{ ...row, nfcCardId: null }],
    });

    const result = await read(() => useApi.useClassStudents('section-1'));

    expect(result.current.data![0].nfcCardId).toBeUndefined();
  });

  it('reads an empty class as empty rather than falling over', async () => {
    givenApi({ '/attendance/class-students': null });

    const result = await read(() => useApi.useClassStudents('section-1'));

    expect(result.current.data).toEqual([]);
  });
});

/**
 * Both of these read the ownership-checked term-result endpoint rather than
 * GET /marks, which is an unscoped admin query. The old route returned 403 for
 * parents and students, so the child marks screen always said "No marks
 * recorded for this term yet" even for a child with a full set.
 */
describe('a child’s marks', () => {
  const answer = {
    result: { id: 'result-1', average: 72.4, position: 3 },
    marks: [{ id: 'mark-1', score: 17 }],
  };

  it('reads the route a parent is allowed to read', async () => {
    givenApi({ '/marks/term-results/student/student-1': answer });

    await read(() => useApi.useStudentMarks('student-1', 'term-1'));

    expect(http.get).toHaveBeenCalledWith(
      '/marks/term-results/student/student-1',
      { params: { termId: 'term-1' } },
    );
  });

  it('takes the marks out of the answer', async () => {
    givenApi({ '/marks/term-results/student/student-1': answer });

    const result = await read(() =>
      useApi.useStudentMarks('student-1', 'term-1'),
    );

    expect(result.current.data).toEqual([{ id: 'mark-1', score: 17 }]);
  });

  it('reads a term with nothing marked yet as empty', async () => {
    givenApi({ '/marks/term-results/student/student-1': { result: null } });

    const result = await read(() =>
      useApi.useStudentMarks('student-1', 'term-1'),
    );

    expect(result.current.data).toEqual([]);
  });

  it('takes the summary out of the same answer', async () => {
    givenApi({ '/marks/term-results/student/student-1': answer });

    const result = await read(() =>
      useApi.useStudentTermResult('student-1', 'term-1'),
    );

    expect(result.current.data).toEqual(answer.result);
  });

  it('copes with an API that answers with the result on its own', async () => {
    givenApi({
      '/marks/term-results/student/student-1': { id: 'result-1', average: 60 },
    });

    const result = await read(() =>
      useApi.useStudentTermResult('student-1', 'term-1'),
    );

    expect(result.current.data).toMatchObject({ id: 'result-1' });
  });
});

/**
 * A parent's children come back on their own profile rather than from a list
 * endpoint, because the link between them is what authorises the read.
 */
describe('a parent’s children', () => {
  it('reads them off the signed-in profile', async () => {
    givenApi({
      '/auth/profile': {
        id: 'user-3',
        children: [{ id: 'student-1' }, { id: 'student-2' }],
      },
    });

    const result = await read(useApi.useParentChildren);

    expect(result.current.data).toHaveLength(2);
  });

  it('reads a member of staff as having none, not as an error', async () => {
    givenApi({ '/auth/profile': { id: 'user-1' } });

    const result = await read(useApi.useParentChildren);

    expect(result.current.data).toEqual([]);
  });
});

/**
 * The one figure a teacher looks at before their first lesson. It is stitched
 * from three endpoints, because no single one answers "how is today going".
 */
describe('a teacher’s morning', () => {
  const today = new Date();
  const dayName = today
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toUpperCase();
  const todayStr = today.toISOString().split('T')[0];

  const lesson = (over = {}) => ({
    dayOfWeek: dayName,
    classSectionId: 'section-1',
    ...over,
  });

  it('counts only the lessons that are actually today', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [
        lesson(),
        lesson({ dayOfWeek: 'SUNDAY' }),
      ],
      '/notifications': [],
      '/attendance/class': [],
    });

    const result = await read(() =>
      useApi.useTeacherDashboardStats('teacher-1'),
    );

    expect(result.current.data!.classesToday).toBe(1);
  });

  it('reads today’s register for each class it finds', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [
        lesson(),
        lesson({ classSectionId: 'section-2' }),
      ],
      '/notifications': [],
      '/attendance/class': [],
    });

    await read(() => useApi.useTeacherDashboardStats('teacher-1'));

    expect(http.get).toHaveBeenCalledWith('/attendance/class', {
      params: { classSectionId: 'section-1', date: todayStr },
    });
    expect(http.get).toHaveBeenCalledWith('/attendance/class', {
      params: { classSectionId: 'section-2', date: todayStr },
    });
  });

  // Two lessons with the same class is one register, not two.
  it('does not read the same class twice', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [lesson(), lesson()],
      '/notifications': [],
      '/attendance/class': [],
    });

    await read(() => useApi.useTeacherDashboardStats('teacher-1'));

    const registerReads = http.get.mock.calls.filter(
      ([url]) => url === '/attendance/class',
    );
    expect(registerReads).toHaveLength(1);
  });

  // Somebody who arrived late was still in the room.
  it('counts a late arrival as present', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [lesson()],
      '/notifications': [],
      '/attendance/class': [
        { status: 'PRESENT' },
        { status: 'LATE' },
        { status: 'ABSENT' },
        { status: 'ABSENT' },
      ],
    });

    const result = await read(() =>
      useApi.useTeacherDashboardStats('teacher-1'),
    );

    expect(result.current.data!.attendanceRate).toBe('50%');
  });

  /**
   * A teacher with lessons but no register taken yet is not the same as a
   * teacher with no lessons at all, and neither is the same as nought per
   * cent, which would read as nobody turning up.
   */
  it('says nothing rather than nought when no register is taken yet', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [lesson()],
      '/notifications': [],
      '/attendance/class': [],
    });

    const result = await read(() =>
      useApi.useTeacherDashboardStats('teacher-1'),
    );

    expect(result.current.data!.attendanceRate).toBe('N/A');
  });

  it('says so differently on a day with no lessons at all', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [],
      '/notifications': [],
    });

    const result = await read(() =>
      useApi.useTeacherDashboardStats('teacher-1'),
    );

    expect(result.current.data!.attendanceRate).toBe('--');
    expect(result.current.data!.classesToday).toBe(0);
  });

  // One class whose register will not load must not take the figure down
  // with it; the rest of the day is still worth showing.
  it('keeps the figure when one class’s register will not load', async () => {
    givenApiFails('/attendance/class');
    givenApi({
      '/academic/timetable/teacher/teacher-1': [lesson()],
      '/notifications': [],
    });

    const result = await read(() =>
      useApi.useTeacherDashboardStats('teacher-1'),
    );

    expect(result.current.data!.classesToday).toBe(1);
    expect(result.current.data!.attendanceRate).toBe('N/A');
  });

  it('counts what is still unread', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [],
      '/notifications': [
        { isRead: false },
        { isRead: true },
        { isRead: false },
      ],
    });

    const result = await read(() =>
      useApi.useTeacherDashboardStats('teacher-1'),
    );

    expect(result.current.data!.unreadMessages).toBe(2);
  });

  it('copes with an empty timetable and no notifications', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': null,
      '/notifications': null,
    });

    const result = await read(() =>
      useApi.useTeacherDashboardStats('teacher-1'),
    );

    expect(result.current.data).toMatchObject({
      classesToday: 0,
      unreadMessages: 0,
      pendingGrades: '--',
    });
  });
});

/**
 * One searchable list of everyone, which on the web is three separate pages.
 */
describe('the people directory', () => {
  it('asks for one page of thirty, filtered', async () => {
    givenApi({ '/users': { data: [], total: 0 } });

    await read(() => useApi.usePeople({ role: 'TEACHER', search: 'Uwase', page: 2 }));

    expect(http.get).toHaveBeenCalledWith('/users', {
      params: { role: 'TEACHER', search: 'Uwase', page: 2, limit: 30 },
    });
  });

  it('starts at the first page when nobody said which', async () => {
    givenApi({ '/users': { data: [], total: 0 } });

    await read(() => useApi.usePeople());

    expect(http.get.mock.calls[0][1]).toMatchObject({
      params: { page: 1, limit: 30 },
    });
  });

  // The endpoint has answered both ways. Reading only the paged shape leaves
  // the directory blank against the other one.
  it('counts a bare list as a page of its own length', async () => {
    givenApi({ '/users': [{ id: 'user-1' }, { id: 'user-2' }] });

    const result = await read(() => useApi.usePeople());

    expect(result.current.data).toEqual({
      data: [{ id: 'user-1' }, { id: 'user-2' }],
      total: 2,
    });
  });

  it('reads a paged answer as it comes', async () => {
    givenApi({ '/users': { data: [{ id: 'user-1' }], total: 412 } });

    const result = await read(() => useApi.usePeople());

    expect(result.current.data!.total).toBe(412);
  });
});

describe('saving a person', () => {
  it('creates one that has no id yet', async () => {
    givenApi({ '/users': { id: 'user-9' } });

    await write(useApi.useSaveUser, { firstName: 'Aline', lastName: 'Uwase' });

    expect(http.post).toHaveBeenCalledWith('/users', {
      firstName: 'Aline',
      lastName: 'Uwase',
    });
  });

  // The id goes in the URL, never in the body: a whitelisting pipe rejects it.
  it('updates one that does, without sending the id back', async () => {
    givenApi({ '/users/user-9': { id: 'user-9' } });

    await write(useApi.useSaveUser, { id: 'user-9', firstName: 'Aline' });

    expect(http.put).toHaveBeenCalledWith('/users/user-9', {
      firstName: 'Aline',
    });
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('the library catalogue', () => {
  it('searches fifty at a time', async () => {
    givenApi({ '/library/books': [] });

    await read(() => useApi.useBooks('Achebe'));

    expect(http.get).toHaveBeenCalledWith('/library/books', {
      params: { search: 'Achebe', limit: 50 },
    });
  });

  it('reads a bare list as the catalogue', async () => {
    givenApi({ '/library/books': [{ id: 'book-1' }] });

    const result = await read(() => useApi.useBooks());

    expect(result.current.data).toEqual([{ id: 'book-1' }]);
  });

  it('reads a paged answer as the catalogue too', async () => {
    givenApi({ '/library/books': { data: [{ id: 'book-1' }], total: 1 } });

    const result = await read(() => useApi.useBooks());

    expect(result.current.data).toEqual([{ id: 'book-1' }]);
  });

  it('reads an answer that is neither as an empty shelf', async () => {
    givenApi({ '/library/books': { total: 0 } });

    const result = await read(() => useApi.useBooks());

    expect(result.current.data).toEqual([]);
  });

  it('adds a book that is new and edits one that is not', async () => {
    givenApi({ '/library/books': { id: 'book-1' } });
    await write(useApi.useSaveBook, { title: 'Things Fall Apart' });
    expect(http.post).toHaveBeenCalledWith('/library/books', {
      title: 'Things Fall Apart',
    });

    resetApi();
    givenApi({ '/library/books/book-1': { id: 'book-1' } });
    await write(useApi.useSaveBook, { id: 'book-1', quantity: 6 });
    expect(http.put).toHaveBeenCalledWith('/library/books/book-1', {
      quantity: 6,
    });
  });
});

describe('the questions people ask most', () => {
  it('searches for what was typed', async () => {
    givenApi({ '/help/faqs': [] });

    await read(() => useApi.useFaqs('password'));

    expect(http.get).toHaveBeenCalledWith('/help/faqs', {
      params: { search: 'password' },
    });
  });

  // Somebody who cleared the box wants the whole list back, not a search for
  // three spaces that matches nothing.
  it('reads a box with only spaces in it as no search at all', async () => {
    givenApi({ '/help/faqs': [] });

    await read(() => useApi.useFaqs('   '));

    expect(http.get).toHaveBeenCalledWith('/help/faqs', {
      params: { search: undefined },
    });
  });

  it('asks for everything when nothing was typed', async () => {
    givenApi({ '/help/faqs': [] });

    await read(() => useApi.useFaqs());

    expect(http.get).toHaveBeenCalledWith('/help/faqs', {
      params: { search: undefined },
    });
  });
});

describe('moving a year group up', () => {
  const body = { fromClassSectionId: 'section-1', academicYearId: 'year-2' };

  it('asks for the preview as a write, since it is a calculation', async () => {
    givenApi({ '/academic/promote/preview': { rows: [] } });

    await read(() => useApi.usePromotionPreview(body));

    expect(http.post.mock.calls[0].slice(0, 2)).toEqual([
      '/academic/promote/preview',
      body,
    ]);
  });

  it('waits until both the class and the year are chosen', async () => {
    const { run } = renderApiHook(() =>
      useApi.usePromotionPreview({ fromClassSectionId: 'section-1' }),
    );
    const { result } = await run();

    expect(result.current.fetchStatus).toBe('idle');
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('issuing an ID card', () => {
  it('issues one card for one child', async () => {
    givenApi({ '/reports/id-cards/issue': { id: 'card-1' } });

    await write(useApi.useIssueIdCard, { studentId: 'student-1' });

    expect(http.post).toHaveBeenCalledWith('/reports/id-cards/issue', {
      studentId: 'student-1',
    });
  });

  // A whole class at a time is the normal case at the start of a year, and it
  // is a different endpoint rather than the same one called thirty times.
  it('issues a whole class at once when a class is named', async () => {
    givenApi({ '/reports/id-cards/issue-bulk': { issued: 30 } });

    await write(useApi.useIssueIdCard, { classSectionId: 'section-1' });

    expect(http.post).toHaveBeenCalledWith('/reports/id-cards/issue-bulk', {
      classSectionId: 'section-1',
    });
  });
});

describe('moving a child’s money', () => {
  it.each(['deposit', 'withdraw', 'refund'])(
    'sends a %s to the endpoint named after it',
    async (kind) => {
      resetApi();
      givenApi({ [`/pocket-money/${kind}`]: { balance: 5000 } });

      await write(useApi.usePocketMoneyMove, {
        kind,
        studentId: 'student-1',
        amount: 2000,
      });

      expect(http.post).toHaveBeenCalledWith(`/pocket-money/${kind}`, {
        studentId: 'student-1',
        amount: 2000,
      });
    },
  );
});

describe('reopening a term that was closed too early', () => {
  it('goes to the reopen endpoint rather than the close one', async () => {
    givenApi({ '/academic/terms/term-1/reopen': { ok: true } });

    await write(useApi.useCloseTerm, { id: 'term-1', reopen: true });

    expect(http.post.mock.calls[0][0]).toBe('/academic/terms/term-1/reopen');
  });
});

/**
 * The library figures are admin and librarian only. Firing that read as a
 * parent is a 403 in the console on every dashboard load.
 */
describe('the library figures', () => {
  it('are read for somebody allowed to see them', async () => {
    givenApi({ '/library/analytics': { totalBooks: 412 } });

    const result = await read(() => useApi.useLibraryAnalytics(true));

    expect(result.current.data).toMatchObject({ totalBooks: 412 });
  });

  it('are not asked for at all otherwise', async () => {
    const { run } = renderApiHook(() => useApi.useLibraryAnalytics(false));
    const { result } = await run();

    expect(result.current.fetchStatus).toBe('idle');
    expect(http.get).not.toHaveBeenCalled();
  });
});
