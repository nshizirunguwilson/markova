import { fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import { parent, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import ChildMarks from './marks';

/**
 * A child's marks, by subject, for one term.
 *
 * Nothing shows until the term is published. That is not a technical
 * limitation, it is the point of the publish step: a school signs results off
 * before parents act on them, and an app that leaked running averages would
 * quietly take that decision away from the school.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const marks = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/years': [{ id: 'year-1', name: '2026', isCurrent: true }],
    '/academic/terms': [
      { id: 'term-1', name: 'Term 1', isCurrent: false },
      { id: 'term-2', name: 'Term 2', isCurrent: true },
    ],
    '/marks/term-results/student/student-1': { result: null },
    ...over,
  });

const published = (over: Record<string, unknown> = {}) =>
  marks({
    '/marks/term-results/student/student-1': {
      result: {
        isPublished: true,
        letterGrade: 'B',
        average: 72.4,
        rank: 4,
        subjects: [
          {
            subjectId: 'subject-1',
            subjectName: 'Mathematics',
            total: 78.2,
            letter: 'A',
            remark: 'Strong all term',
          },
        ],
        ...over,
      },
    },
  });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildMarks />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  marks();
});

/**
 * The publish step is the school's decision, and the app does not take it.
 */
describe('before the school has published', () => {
  it('shows nothing and says why', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'The school publishes marks once every teacher has finished and the results have been checked. It will appear here the moment they do.',
        ),
      ).toBeTruthy(),
    );
  });

  it('leaks no running average in the meantime', async () => {
    marks({
      '/marks/term-results/student/student-1': {
        result: { isPublished: false, average: 72.4, letterGrade: 'B' },
      },
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Not published yet')).toBeTruthy(),
    );
    expect(screen.queryByText('72%')).toBeNull();
    expect(screen.queryByText('B')).toBeNull();
  });

  it('shows a placeholder while it looks', async () => {
    marks({
      '/marks/term-results/student/student-1': () => new Promise(() => {}),
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

describe('once it has', () => {
  it('names the child in the header', async () => {
    published();

    const screen = await open();

    await waitFor(() => expect(screenTitle()).toBe('Aline Uwase, marks'));
  });

  it('is called plain marks when it does not know whose', async () => {
    published();
    signedInAs(parent);
    routerState.params = { studentId: 'student-1' };

    const screen = await renderScreen(<ChildMarks />);

    await waitFor(() => expect(screen.getByText('Overall')).toBeTruthy());
    expect(screenTitle()).toBe('Marks');
  });

  it('leads with the grade, the average and the position', async () => {
    published();

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Overall')).toBeTruthy());
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('72%')).toBeTruthy();
    expect(screen.getByText('Position in class')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('shows a dash where a published result carries neither figure', async () => {
    published({ letterGrade: undefined, average: undefined, subjects: [] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Overall')).toBeTruthy());
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('leaves out a position the school did not calculate', async () => {
    published({ rank: undefined });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Overall')).toBeTruthy());
    expect(screen.queryByText('Position in class')).toBeNull();
  });

  /**
   * A parent scans down the subject column looking for the one that worries
   * them, so the subject leads and the grade sits right.
   */
  it('lists each subject with its mark and its grade', async () => {
    published();

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());
    expect(screen.getByText('78%')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('Strong all term')).toBeTruthy();
  });

  it('says so when a subject has no mark against it', async () => {
    published({
      subjects: [{ subjectId: 'subject-1', subjectName: 'Mathematics' }],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());
    // The mark and the grade both read as a dash where neither exists.
    expect(screen.getAllByText('-')).toHaveLength(2);
  });

  it('reads a subject named under either field the API uses', async () => {
    published({ subjects: [{ name: 'Physics', total: 60, letter: 'C' }] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Physics')).toBeTruthy());
  });

  // A result with no breakdown is a result, not an error, and saying so beats
  // an empty box.
  it('says so when a published result carries no breakdown', async () => {
    published({ subjects: [] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No subject breakdown')).toBeTruthy(),
    );
  });

  it('shows what the teacher wrote, and lets it be copied', async () => {
    published({ teacherComment: 'A steady term, more practice on algebra' });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('A steady term, more practice on algebra'),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText('A steady term, more practice on algebra').props
        .selectable,
    ).toBe(true);
  });

  it('shows what the head teacher wrote, separately', async () => {
    published({ headmasterComment: 'Well done this term' });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('From the head teacher')).toBeTruthy(),
    );
    expect(screen.getByText('Well done this term')).toBeTruthy();
  });

  it('says nothing where nobody wrote anything', async () => {
    published();

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Overall')).toBeTruthy());
    expect(screen.queryByText('What the teacher said')).toBeNull();
    expect(screen.queryByText('From the head teacher')).toBeNull();
  });
});

/**
 * A parent looking at last term's marks is the normal case in week one of a
 * new one.
 */
describe('looking at another term', () => {
  it('opens on the current one', async () => {
    published();

    const screen = await open();

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(
        '/marks/term-results/student/student-1',
        { params: { termId: 'term-2' } },
      ),
    );
  });

  it('switches back to an earlier one', async () => {
    published();
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Term 1')).toBeTruthy());

    await fireEvent.press(screen.getByText('Term 1'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(
        '/marks/term-results/student/student-1',
        { params: { termId: 'term-1' } },
      ),
    );
  });

  /**
   * With no year, there is no term to ask about, so nothing is read at all
   * rather than answering for whichever term the API happened to pick.
   */
  it('asks for nothing at all until a school has a year set', async () => {
    marks({ '/academic/years': [] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Not published yet')).toBeTruthy(),
    );
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(http.get).not.toHaveBeenCalledWith(
      '/marks/term-results/student/student-1',
      expect.anything(),
    );
  });
});

/** An adult child keeping this from their parents (A8): said calmly, not empty. */
describe('a record an adult child keeps private', () => {
  it('says so in the school\'s own sentence', async () => {
    givenApiFails(
      '/marks/term-results/student/student-1',
      Object.assign(new Error('Forbidden'), {
        response: {
          status: 403,
          data: {
            reason: 'KEPT_PRIVATE',
            message: 'Aline has chosen to keep their results (marks and report cards) private.',
          },
        },
      }),
    );
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Aline has chosen to keep their results (marks and report cards) private.')).toBeTruthy(),
    );
    expect(screen.getByText(/From 18, a student decides/)).toBeTruthy();
  });
});
