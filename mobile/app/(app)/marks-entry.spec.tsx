import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import {
  meterFill,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
  teacher,
} from '@/test/harness';

import MarksEntry from './marks-entry';

/**
 * Entering marks: the most repeated task a teacher has, so the whole screen
 * is built around the loop of read a script, type a number, move on.
 *
 * The keyboard stays numeric and never dismisses between students. Out of
 * range values are caught as they are typed rather than on save, because
 * finding out at the end that entry number nine was 105 means hunting for it.
 * Nothing is saved until Save, and the count of what has been filled is
 * always visible, because being interrupted halfway is the normal case.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const student = (id: string, firstName: string) => ({
  id,
  userId: `user-${id}`,
  studentIdNumber: `STD-2025-${id}`,
  firstName,
  lastName: 'Uwase',
});

const classroom = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/assignments': [
      {
        id: 'a1',
        classSection: { id: 'section-1', name: 'Senior 3 A' },
        subject: { id: 'subject-1', name: 'Mathematics' },
      },
    ],
    '/academic/assessment-types': [{ id: 'cat-1', name: 'CAT 1' }],
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [
      { id: 'term-1', name: 'Term 2', isCurrent: true, isClosed: false },
    ],
    '/attendance/class-students': [student('1', 'Aline'), student('2', 'Eric')],
    '/marks/batch': { saved: 2 },
    ...over,
  });

const open = async () => {
  signedInAs(teacher);
  return renderScreen(<MarksEntry />);
};

const waitForRoll = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
  waitFor(() => expect(screen.getByLabelText('Mark for Aline Uwase')).toBeTruthy());

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  classroom();
});

describe('picking what is being marked', () => {
  it('names the class in the header when it was opened from one', async () => {
    routerState.params = { classSectionId: 'section-1', className: 'Senior 3 A' };

    const screen = await open();

    await waitForRoll(screen);
    expect(screenTitle()).toBe('Senior 3 A');
  });

  it('is called what it is when opened from the menu', async () => {
    const screen = await open();

    await waitForRoll(screen);
    expect(screenTitle()).toBe('Enter marks');
  });

  it('starts on the class it was opened with', async () => {
    routerState.params = { classSectionId: 'section-1' };

    await open();

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/attendance/class-students', {
        params: { classSectionId: 'section-1' },
      }),
    );
  });

  it('picks the first subject taught in that class', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());
  });

  it('picks the first kind of assessment', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('CAT 1')).toBeTruthy());
  });

  it('changes the subject list when the class changes', async () => {
    classroom({
      '/academic/assignments': [
        {
          id: 'a1',
          classSection: { id: 'section-1', name: 'Senior 3 A' },
          subject: { id: 'subject-1', name: 'Mathematics' },
        },
        {
          id: 'a2',
          classSection: { id: 'section-2', name: 'Senior 4 B' },
          subject: { id: 'subject-2', name: 'Physics' },
        },
      ],
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());

    await fireEvent.press(screen.getByText('Senior 4 B'));

    await waitFor(() => expect(screen.getByText('Physics')).toBeTruthy());
    expect(screen.queryByText('Mathematics')).toBeNull();
  });

  it('shows no subject picker for a class with none attached', async () => {
    classroom({
      '/academic/assignments': [
        { id: 'a1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
    expect(screen.queryByText('Mathematics')).toBeNull();
  });

  it('says who assigns a class, since a teacher cannot', async () => {
    classroom({ '/academic/assignments': [] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No classes to mark')).toBeTruthy(),
    );
    expect(screenTitle()).toBe('Marks');
  });

  it('shows a placeholder while the class loads', async () => {
    classroom({ '/attendance/class-students': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

/**
 * Read a script, type a number, move on. Each field is named after the
 * student it belongs to, so a screen reader can follow the same loop.
 */
describe('typing the marks', () => {
  it('gives every student a field named after them', async () => {
    const screen = await open();

    await waitForRoll(screen);
    expect(screen.getByLabelText('Mark for Eric Uwase')).toBeTruthy();
    expect(screen.getByText('STD-2025-1')).toBeTruthy();
  });

  it('takes a number', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '17',
    );

    expect(screen.getByLabelText('Mark for Aline Uwase').props.value).toBe('17');
  });

  it('takes a half mark', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '17.5',
    );

    expect(screen.getByLabelText('Mark for Aline Uwase').props.value).toBe(
      '17.5',
    );
  });

  // A stray letter from a keyboard that autocorrected is silently dropped
  // rather than becoming a mark of NaN.
  it('ignores anything that is not part of a number', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '1a7b',
    );

    expect(screen.getByLabelText('Mark for Aline Uwase').props.value).toBe('17');
  });

  it('counts what has been filled in, always on screen', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '17',
    );

    await waitFor(() => expect(screen.getByText('1 of 2 entered')).toBeTruthy());
  });

  it('reads as finished once the whole class is in', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '17');
    await fireEvent.changeText(screen.getByLabelText('Mark for Eric Uwase'), '14');

    await waitFor(() => expect(screen.getByText('2 of 2 entered')).toBeTruthy());
    expect(meterFill(screen).backgroundColor).toBe(
      defaultTheme.status.positive.solid,
    );
  });

  it('marks a filled field so the eye can find the gaps', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '17');

    expect(
      styleOf(screen.getByLabelText('Mark for Aline Uwase')).borderColor,
    ).toBe(defaultTheme.brand.solid);
    expect(
      styleOf(screen.getByLabelText('Mark for Eric Uwase')).borderColor,
    ).toBe(defaultTheme.line.border);
  });

  /**
   * A teacher can go down a class of thirty without touching the screen again
   * after the first tap, which is what makes this bearable.
   */
  it('moves to the next student on the keyboard, and stops at the last', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(
      screen.getByLabelText('Mark for Aline Uwase').props.returnKeyType,
    ).toBe('next');
    expect(
      screen.getByLabelText('Mark for Eric Uwase').props.returnKeyType,
    ).toBe('done');

    await fireEvent(
      screen.getByLabelText('Mark for Aline Uwase'),
      'submitEditing',
    );
    await fireEvent(
      screen.getByLabelText('Mark for Eric Uwase'),
      'submitEditing',
    );

    expect(screen.getByLabelText('Mark for Eric Uwase')).toBeTruthy();
  });

  it('keeps the keyboard numeric all the way down the class', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(
      screen.getByLabelText('Mark for Aline Uwase').props.keyboardType,
    ).toBe('numeric');
  });
});

/**
 * Caught as they are typed rather than on save, because finding out at the
 * end that entry number nine was 105 means hunting for it.
 */
describe('a mark that cannot be right', () => {
  it.each(['101', '150'])('marks %s as wrong straight away', async (value) => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      value,
    );

    await waitFor(() =>
      expect(
        screen.getByText('A mark is outside 0 to 100. Fix it before saving.'),
      ).toBeTruthy(),
    );
  });

  // A minus cannot be typed at all, so a negative mark is not a state the
  // screen ever has to be in.
  it('does not let a minus sign into a mark', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '-5',
    );

    expect(screen.getByLabelText('Mark for Aline Uwase').props.value).toBe('5');
  });

  it('colours the field that is wrong, not the whole class', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '105',
    );

    expect(
      styleOf(screen.getByLabelText('Mark for Aline Uwase')).borderColor,
    ).toBe(defaultTheme.status.critical.solid);
  });

  it('will not let the class be saved while one is wrong', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Mark for Aline Uwase'),
      '105',
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save 1 mark' }).props
          .accessibilityState.disabled,
      ).toBe(true),
    );
  });

  it('accepts the two ends of the range', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '0');
    await fireEvent.changeText(screen.getByLabelText('Mark for Eric Uwase'), '100');

    expect(
      screen.queryByText('A mark is outside 0 to 100. Fix it before saving.'),
    ).toBeNull();
  });

  // An empty field is a student not marked yet, not a mistake.
  it('says nothing about a field left blank', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '');

    expect(
      screen.queryByText('A mark is outside 0 to 100. Fix it before saving.'),
    ).toBeNull();
  });
});

describe('saving', () => {
  it('sends only the students who were actually marked', async () => {
    const screen = await open();
    await waitForRoll(screen);
    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '17');

    await fireEvent.press(screen.getByRole('button', { name: 'Save 1 mark' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/marks/batch', {
        classSectionId: 'section-1',
        subjectId: 'subject-1',
        termId: 'term-1',
        assessmentTypeId: 'cat-1',
        marks: [{ studentId: '1', score: 17 }],
      }),
    );
  });

  it('says how many were saved', async () => {
    const screen = await open();
    await waitForRoll(screen);
    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '17');
    await fireEvent.changeText(screen.getByLabelText('Mark for Eric Uwase'), '14');

    await fireEvent.press(screen.getByRole('button', { name: 'Save 2 marks' }));

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Saved 2 marks'),
    );
  });

  it('clears the fields so the next assessment can be entered', async () => {
    const screen = await open();
    await waitForRoll(screen);
    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '17');

    await fireEvent.press(screen.getByRole('button', { name: 'Save 1 mark' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Mark for Aline Uwase').props.value).toBe(''),
    );
  });

  it('cannot be saved before anything has been typed', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(
      screen.getByRole('button', { name: 'Save 0 marks' }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/marks/batch', {
      response: { data: { message: 'That assessment is already published' } },
    });
    const screen = await open();
    await waitForRoll(screen);
    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '17');

    await fireEvent.press(screen.getByRole('button', { name: 'Save 1 mark' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That assessment is already published',
      ),
    );
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/marks/batch', new Error('offline'));
    const screen = await open();
    await waitForRoll(screen);
    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '17');

    await fireEvent.press(screen.getByRole('button', { name: 'Save 1 mark' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not save those marks'),
    );
  });
});

/**
 * A closed term is the normal end of one. Saying so before a teacher types
 * thirty marks is the difference between an explanation and a wasted lesson.
 */
describe('a term that has been closed', () => {
  beforeEach(() =>
    classroom({
      '/academic/terms': [
        { id: 'term-1', name: 'Term 2', isCurrent: true, isClosed: true },
      ],
    }),
  );

  it('says so at the top, before anything is typed', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'This term is closed. Marks cannot be saved until an admin reopens it.',
        ),
      ).toBeTruthy(),
    );
  });

  it('will not let anything be saved into it', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.changeText(screen.getByLabelText('Mark for Aline Uwase'), '17');

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save 1 mark' }).props
          .accessibilityState.disabled,
      ).toBe(true),
    );
  });
});
