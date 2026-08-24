import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';

import HomeworkManage from './homework-manage';

/**
 * Setting homework, then marking it.
 *
 * Two jobs that happen weeks apart, so they are two tabs rather than one long
 * screen. Setting is a short form. Marking is a list of who handed in, with
 * the mark typed straight into the row, because opening a detail screen per
 * student to type one number is thirty extra taps.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const submission = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  isLate: false,
  marks: null,
  student: { user: { firstName: 'Aline', lastName: 'Uwase' } },
  ...over,
});

const homework = (over: Record<string, unknown> = {}) => ({
  id: 'hw-1',
  title: 'Chapter 4 exercises',
  dueDate: '2026-09-01T00:00:00.000Z',
  maxMarks: 20,
  classSection: { name: 'Senior 3 A' },
  submissions: [],
  ...over,
});

const staffroom = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/assignments': [
      {
        id: 'a1',
        classSection: { id: 'section-1', name: 'Senior 3 A' },
        subject: { id: 'subject-1', name: 'Mathematics' },
      },
    ],
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/homework': [],
    ...over,
  });

const open = async () => {
  signedInAs(teacher);
  return renderScreen(<HomeworkManage />);
};

const openMarking = async (screen: Awaited<ReturnType<typeof renderScreen>>) => {
  await fireEvent.press(screen.getByText('Mark'));
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  staffroom();
});

describe('the two jobs', () => {
  it('opens on setting, since that comes first', async () => {
    const screen = await open();

    expect(screenTitle()).toBe('Homework');
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
  });

  it('switches to marking', async () => {
    const screen = await open();

    await openMarking(screen);

    await waitFor(() => expect(screen.getByText('Nothing set yet')).toBeTruthy());
  });
});

describe('setting a piece of work', () => {
  it('picks the class and subject together, since both are needed', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Senior 3 A Mathematics')).toBeTruthy(),
    );
  });

  it('does not offer the same pairing twice', async () => {
    staffroom({
      '/academic/assignments': [
        {
          id: 'a1',
          classSection: { id: 'section-1', name: 'Senior 3 A' },
          subject: { id: 'subject-1', name: 'Mathematics' },
        },
        {
          id: 'a2',
          classSection: { id: 'section-1', name: 'Senior 3 A' },
          subject: { id: 'subject-1', name: 'Mathematics' },
        },
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(3));
  });

  it('skips a row with only half a pairing on it', async () => {
    staffroom({
      '/academic/assignments': [
        { id: 'a1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('No classes')).toBeTruthy());
  });

  it('sets it against the class, the subject and the term', async () => {
    givenApi({ '/homework': { id: 'hw-1' } });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());

    await fireEvent.changeText(
      screen.getByLabelText('Title'),
      'Chapter 4 exercises',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/homework',
        expect.objectContaining({
          classSectionId: 'section-1',
          subjectId: 'subject-1',
          termId: 'term-1',
          title: 'Chapter 4 exercises',
          maxMarks: 20,
        }),
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Set. The class can see it now.');
  });

  it('clears the form so another can be set', async () => {
    givenApi({ '/homework': { id: 'hw-1' } });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Title').props.value).toBe(''),
    );
  });

  /**
   * "Ex 4" tells a class nothing a week later. Three characters is the floor
   * for a title somebody will still recognise.
   */
  it('refuses a title too short for a class to recognise', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Ex');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    expect(notify.error).toHaveBeenCalledWith(
      'Give it a title the class will recognise',
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('counts the due date forward from today', async () => {
    givenApi({ '/homework': { id: 'hw-1' } });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4');
    await fireEvent.changeText(screen.getByLabelText('Due in days'), '3');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() => expect(http.post).toHaveBeenCalled());
    const due = new Date(
      (http.post.mock.calls[0][1] as { dueDate: string }).dueDate,
    );
    const expected = new Date();
    expected.setDate(expected.getDate() + 3);
    expect(due.toDateString()).toBe(expected.toDateString());
  });

  // Homework due today is homework nobody can do, so a blank or a nought
  // becomes a week rather than a zero.
  it.each(['', '0', 'soon'])('turns a due-in of "%s" into something real', async (value) => {
    givenApi({ '/homework': { id: 'hw-1' } });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4');
    await fireEvent.changeText(screen.getByLabelText('Due in days'), value);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() => expect(http.post).toHaveBeenCalled());
    const due = new Date(
      (http.post.mock.calls[0][1] as { dueDate: string }).dueDate,
    );
    expect(due.getTime()).toBeGreaterThan(Date.now());
  });

  it('sends no description where none was written', async () => {
    givenApi({ '/homework': { id: 'hw-1' } });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/homework',
        expect.objectContaining({ description: undefined }),
      ),
    );
  });

  it('carries the description when there is one', async () => {
    givenApi({ '/homework': { id: 'hw-1' } });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4');
    await fireEvent.changeText(
      screen.getByLabelText('What to do'),
      'Questions 1 to 12',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/homework',
        expect.objectContaining({ description: 'Questions 1 to 12' }),
      ),
    );
  });

  it('sends no mark ceiling when the field was cleared', async () => {
    givenApi({ '/homework': { id: 'hw-1' } });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4');
    await fireEvent.changeText(screen.getByLabelText('Out of'), '');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/homework',
        expect.objectContaining({ maxMarks: undefined }),
      ),
    );
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/homework', {
      response: { data: { message: 'That term is closed' } },
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That term is closed'),
    );
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/homework', new Error('offline'));
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Chapter 4');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set the homework' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not set that'),
    );
  });
});

describe('marking what came in', () => {
  it('lists what has been set, with how much is marked', async () => {
    staffroom({
      '/homework': [
        homework({
          submissions: [submission(), submission({ id: 'sub-2', marks: 15 })],
        }),
      ],
    });
    const screen = await open();

    await openMarking(screen);

    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByLabelText('1 of 2 marked')).toBeTruthy();
  });

  it('draws a piece the API sent with no class and no submissions', async () => {
    staffroom({
      '/homework': [
        {
          id: 'hw-1',
          title: 'Chapter 4 exercises',
          dueDate: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
    const screen = await open();

    await openMarking(screen);

    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    expect(screen.getByText('Nobody has handed this in yet.')).toBeTruthy();
  });

  it('says nothing about a ceiling where the work has none', async () => {
    staffroom({
      '/homework': [homework({ maxMarks: null, submissions: [submission()] })],
    });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Chapter 4 exercises'));

    await waitFor(() => expect(screen.getByPlaceholderText('-')).toBeTruthy());
  });

  it('says so when nobody has handed anything in', async () => {
    staffroom({ '/homework': [homework()] });
    const screen = await open();

    await openMarking(screen);

    await waitFor(() =>
      expect(screen.getByText('Nobody has handed this in yet.')).toBeTruthy(),
    );
  });

  /**
   * Opening a detail screen per student to type one number is thirty extra
   * taps, so the mark goes straight into the row.
   */
  it('opens the list of who handed in', async () => {
    staffroom({ '/homework': [homework({ submissions: [submission()] })] });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Chapter 4 exercises'));

    await waitFor(() => expect(screen.getByText('Handed in')).toBeTruthy());
    expect(screen.getByText('Aline Uwase')).toBeTruthy();
  });

  it('closes it again', async () => {
    staffroom({ '/homework': [homework({ submissions: [submission()] })] });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));
    await waitFor(() => expect(screen.getByText('Handed in')).toBeTruthy());

    await fireEvent.press(screen.getByText('Chapter 4 exercises'));

    await waitFor(() => expect(screen.queryByText('Handed in')).toBeNull());
  });

  it('names each mark box after the student it belongs to', async () => {
    staffroom({ '/homework': [homework({ submissions: [submission()] })] });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));

    await waitFor(() =>
      expect(screen.getByLabelText('Mark for Aline Uwase')).toBeTruthy(),
    );
  });

  it('saves a mark when the teacher moves off the box', async () => {
    staffroom({
      '/homework': [homework({ submissions: [submission()] })],
      '/homework/submissions/sub-1/grade': { graded: true },
    });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));
    await waitFor(() =>
      expect(screen.getByLabelText('Mark for Aline Uwase')).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '17',
    );
    await fireEvent(screen.getByLabelText('Mark for Aline Uwase'), 'blur');

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        '/homework/submissions/sub-1/grade',
        { marks: 17 },
      ),
    );
  });

  it('saves nothing when the box was left as it was', async () => {
    staffroom({ '/homework': [homework({ submissions: [submission()] })] });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));
    await waitFor(() =>
      expect(screen.getByLabelText('Mark for Aline Uwase')).toBeTruthy(),
    );

    await fireEvent(screen.getByLabelText('Mark for Aline Uwase'), 'blur');

    expect(http.put).not.toHaveBeenCalled();
  });

  it('names the student when a mark will not save', async () => {
    staffroom({ '/homework': [homework({ submissions: [submission()] })] });
    givenApiFails('/homework/submissions/sub-1/grade', new Error('offline'));
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));
    await waitFor(() =>
      expect(screen.getByLabelText('Mark for Aline Uwase')).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '17',
    );
    await fireEvent(screen.getByLabelText('Mark for Aline Uwase'), 'blur');

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not save Aline Uwase'),
    );
  });

  it('shows a mark already recorded rather than an empty box', async () => {
    staffroom({
      '/homework': [homework({ submissions: [submission({ marks: 15 })] })],
    });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));

    await waitFor(() =>
      expect(
        screen.getByLabelText('Mark for Aline Uwase').props.value,
      ).toBe('15'),
    );
  });

  it('says what the work is out of, in the box itself', async () => {
    staffroom({ '/homework': [homework({ submissions: [submission()] })] });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));

    await waitFor(() => expect(screen.getByPlaceholderText('/20')).toBeTruthy());
  });

  /**
   * Flagged but not punished. The deduction is school policy and lives on the
   * assignment, so the screen says what happened rather than silently
   * applying a penalty.
   */
  it('flags a late hand-in without docking anything', async () => {
    staffroom({
      '/homework': [
        homework({
          submissions: [
            submission({ isLate: true }),
            submission({ id: 'sub-2', student: { user: { firstName: 'Eric', lastName: 'Habimana' } } }),
          ],
        }),
      ],
    });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));

    await waitFor(() =>
      expect(screen.getByText('Handed in late')).toBeTruthy(),
    );
    expect(screen.getByText('On time')).toBeTruthy();
  });

  it('names an unnamed submission something rather than nothing', async () => {
    staffroom({
      '/homework': [
        homework({ submissions: [submission({ student: undefined })] }),
      ],
    });
    const screen = await open();
    await openMarking(screen);
    await waitFor(() =>
      expect(screen.getByText('Chapter 4 exercises')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Chapter 4 exercises'));

    await waitFor(() => expect(screen.getByText('Student')).toBeTruthy());
  });

  it('shows a placeholder while the list loads', async () => {
    staffroom({ '/homework': () => new Promise(() => {}) });
    const screen = await open();

    await openMarking(screen);

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });

  it('sends a teacher back to setting when nothing exists to mark', async () => {
    const screen = await open();
    await openMarking(screen);
    await waitFor(() => expect(screen.getByText('Nothing set yet')).toBeTruthy());

    await fireEvent.press(
      screen.getByRole('button', { name: 'Set some homework' }),
    );

    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
  });
});
