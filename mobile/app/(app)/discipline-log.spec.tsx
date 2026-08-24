import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  admin,
  renderScreen,
  resetHarness,
  signedInAs,
  teacher,
} from '@/test/harness';

import DisciplineLog from './discipline-log';

/**
 * Recording an incident, recognising a student, and for admins judging the
 * appeals.
 *
 * The action taken drives the points, not the other way around: a teacher
 * decides "this is a written warning" and the deduction follows from school
 * policy. Getting that the wrong way round is how one class ends up harsher
 * than another for the same behaviour.
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

const school = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/assignments': [
      { id: 'a1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
    ],
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/attendance/class-students': [student('1', 'Aline')],
    '/discipline/incidents': [],
    '/discipline/appeals/pending': [],
    '/discipline/merits': { pointsRestored: 5 },
    ...over,
  });

const open = async (user = teacher) => {
  signedInAs(user);
  return renderScreen(<DisciplineLog />);
};

const pickStudent = async (screen: Awaited<ReturnType<typeof renderScreen>>) => {
  await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  await fireEvent.press(screen.getByText('Aline Uwase'));
  await waitFor(() => expect(screen.getByText('Selected')).toBeTruthy());
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  school();
});

describe('the tabs each role gets', () => {
  it('is called what it covers, not what it punishes', async () => {
    await open();

    expect(screenTitle()).toBe('Behaviour');
  });

  /**
   * Recognising a student sits beside recording an incident, deliberately. A
   * conduct system with only deductions teaches a student that the best
   * possible outcome is to be unnoticed.
   */
  it('gives a teacher an incident, a recognition and the recent log', async () => {
    const screen = await open();

    expect(screen.getByText('Incident')).toBeTruthy();
    expect(screen.getByText('Recognise')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.queryByText('Appeals')).toBeNull();
  });

  // Judging an appeal is an admin's job, not the recording teacher's.
  it('gives an admin the appeals as well', async () => {
    const screen = await open(admin);

    expect(screen.getByText('Appeals')).toBeTruthy();
  });

  it('opens on recording an incident', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('What was decided')).toBeTruthy(),
    );
  });
});

describe('recording an incident', () => {
  it('picks the student from the class roster', async () => {
    const screen = await open();

    await pickStudent(screen);
  });

  it('draws a roster row with no name recorded at all', async () => {
    school({ '/attendance/class-students': [{ id: '1' }] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Who')).toBeTruthy());
  });

  it('copes with a roster row the school left half filled in', async () => {
    school({ '/attendance/class-students': [{ id: '1', firstName: 'Aline' }] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline')).toBeTruthy());
  });

  /**
   * The action sets the deduction, so the screen says what it will cost
   * before anything is recorded.
   */
  it.each([
    ['Verbal warning', 2],
    ['Written warning', 5],
    ['Detention', 10],
    ['Suspension', 20],
    ['Expulsion', 50],
  ])('says a %s costs %s points', async (label, points) => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());

    await fireEvent.press(screen.getByText(label));

    await waitFor(() =>
      expect(
        screen.getByText(
          `Costs ${points} conduct points. The action sets the deduction, not the other way round.`,
        ),
      ).toBeTruthy(),
    );
  });

  it('records the action and the points it carries', async () => {
    givenApi({ '/discipline/incidents': { id: 'incident-1' } });
    const screen = await open();
    await pickStudent(screen);
    await fireEvent.press(screen.getByText('Detention'));
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Threw a chair across the room during registration',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Record it' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/discipline/incidents', {
        studentId: '1',
        termId: 'term-1',
        description: 'Threw a chair across the room during registration',
        location: undefined,
        actionTaken: 'DETENTION',
        pointsDeducted: 10,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
    expect(notify.success).toHaveBeenCalledWith(
      'Recorded. The parent has been told.',
    );
  });

  it('carries the place when one was written', async () => {
    givenApi({ '/discipline/incidents': { id: 'incident-1' } });
    const screen = await open();
    await pickStudent(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Threw a chair across the room during registration',
    );
    await fireEvent.changeText(screen.getByLabelText('Where'), 'Corridor');

    await fireEvent.press(screen.getByRole('button', { name: 'Record it' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/discipline/incidents',
        expect.objectContaining({ location: 'Corridor' }),
      ),
    );
  });

  it('clears the form so the next one can be recorded', async () => {
    givenApi({ '/discipline/incidents': { id: 'incident-1' } });
    const screen = await open();
    await pickStudent(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Threw a chair across the room during registration',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Record it' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Description').props.value).toBe(''),
    );
    expect(screen.queryByText('Selected')).toBeNull();
  });

  it('will not record against nobody', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Description')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', { name: 'Record it' }));

    expect(notify.error).toHaveBeenCalledWith('Pick the student first');
    expect(http.post).not.toHaveBeenCalled();
  });

  /**
   * A parent reads this word for word and may appeal against it, so "rude"
   * is not a record.
   */
  it('will not record a description too thin for a parent to read', async () => {
    const screen = await open();
    await pickStudent(screen);

    await fireEvent.changeText(screen.getByLabelText('Description'), 'Rude');
    await fireEvent.press(screen.getByRole('button', { name: 'Record it' }));

    expect(notify.error).toHaveBeenCalledWith(
      'Describe what happened. A parent will read this.',
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('says out loud who will read it', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'A parent reads this word for word, and may appeal against it.',
        ),
      ).toBeTruthy(),
    );
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/discipline/incidents', {
      response: { data: { message: 'That term is closed' } },
    });
    const screen = await open();
    await pickStudent(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Threw a chair across the room during registration',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Record it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That term is closed'),
    );
  });

  it('says who assigns a class, since a teacher cannot', async () => {
    school({ '/academic/assignments': [] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'You need a class assigned before you can record anything.',
        ),
      ).toBeTruthy(),
    );
  });

  it('skips an assignment the API sent with no class on it', async () => {
    school({ '/academic/assignments': [{ id: 'orphan' }] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'You need a class assigned before you can record anything.',
        ),
      ).toBeTruthy(),
    );
  });

  it('has something to say when the school refused silently', async () => {
    givenApiFails('/discipline/incidents', new Error('offline'));
    const screen = await open();
    await pickStudent(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Threw a chair across the room during registration',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Record it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not record that'),
    );
  });

  it('switches to another class roster', async () => {
    school({
      '/academic/assignments': [
        { id: 'a1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
        { id: 'a2', classSection: { id: 'section-2', name: 'Senior 4 B' } },
      ],
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 4 B')).toBeTruthy());

    await fireEvent.press(screen.getByText('Senior 4 B'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/attendance/class-students', {
        params: { classSectionId: 'section-2' },
      }),
    );
  });
});

/**
 * A merit restores a conduct score up to a clean sheet and never past it, so
 * it is a way back rather than a currency to bank against future trouble.
 */
describe('recognising a student', () => {
  const openMerit = async () => {
    const screen = await open();
    await fireEvent.press(screen.getByText('Recognise'));
    return screen;
  };

  it.each([
    ['Helping others', 5],
    ['Real effort', 8],
    ['Leadership', 10],
    ['Honesty', 10],
    ['Turning it around', 12],
  ])('says a %s merit is worth %s points', async (label, points) => {
    const screen = await openMerit();
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());

    await fireEvent.press(screen.getByText(label));

    await waitFor(() =>
      expect(
        screen.getByText(
          `Worth ${points} points, restoring their score up to a clean sheet and never past it.`,
        ),
      ).toBeTruthy(),
    );
  });

  it('records it against the student and the term', async () => {
    const screen = await openMerit();
    await pickStudent(screen);
    await fireEvent.press(screen.getByText('Honesty'));
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Handed in a wallet she found in the corridor',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Recognise them' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/discipline/merits', {
        studentId: '1',
        termId: 'term-1',
        category: 'HONESTY',
        description: 'Handed in a wallet she found in the corridor',
        points: 10,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
  });

  it('says how much was actually restored', async () => {
    const screen = await openMerit();
    await pickStudent(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Handed in a wallet she found in the corridor',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Recognise them' }),
    );

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Recorded. 5 points restored.',
      ),
    );
  });

  // The recognition stands even when there is nothing to restore, which is
  // the whole point of it not being a currency.
  it('records it anyway for a student who was already clean', async () => {
    school({ '/discipline/merits': { pointsRestored: 0 } });
    const screen = await openMerit();
    await pickStudent(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Handed in a wallet she found in the corridor',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Recognise them' }),
    );

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Recorded. Their conduct score was already clean.',
      ),
    );
  });

  it('will not recognise nobody', async () => {
    const screen = await openMerit();
    await waitFor(() => expect(screen.getByLabelText('Description')).toBeTruthy());

    await fireEvent.press(
      screen.getByRole('button', { name: 'Recognise them' }),
    );

    expect(notify.error).toHaveBeenCalledWith('Pick the student first');
  });

  it('will not record a recognition too thin to be worth reading', async () => {
    const screen = await openMerit();
    await pickStudent(screen);

    await fireEvent.changeText(screen.getByLabelText('Description'), 'Good');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Recognise them' }),
    );

    expect(notify.error).toHaveBeenCalledWith(
      'Say what they did. It goes on their record and home to their family.',
    );
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/discipline/merits', {
      response: { data: { message: 'That term is closed' } },
    });
    const screen = await openMerit();
    await pickStudent(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Handed in a wallet she found in the corridor',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Recognise them' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That term is closed'),
    );
  });

  it('has something to say when the school refused silently', async () => {
    givenApiFails('/discipline/merits', new Error('offline'));
    const screen = await openMerit();
    await pickStudent(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Description'),
      'Handed in a wallet she found in the corridor',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Recognise them' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not record that'),
    );
  });

  it('says who assigns a class, since a teacher cannot', async () => {
    school({ '/academic/assignments': [] });
    const screen = await open();

    await fireEvent.press(screen.getByText('Recognise'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'You need a class assigned before you can recognise anybody.',
        ),
      ).toBeTruthy(),
    );
  });
});

describe('what was recorded this term', () => {
  it('lists each incident with what it cost', async () => {
    school({
      '/discipline/incidents': [
        {
          id: 'incident-1',
          description: 'Threw a chair',
          pointsDeducted: 10,
          student: { user: { firstName: 'Aline', lastName: 'Uwase' } },
        },
      ],
    });
    const screen = await open();

    await fireEvent.press(screen.getByText('Recent'));

    await waitFor(() => expect(screen.getByText('1 this term')).toBeTruthy());
    expect(screen.getByText('Threw a chair')).toBeTruthy();
    expect(screen.getByText('-10')).toBeTruthy();
  });

  it('names an incident whose student record has gone', async () => {
    school({
      '/discipline/incidents': [
        { id: 'incident-1', description: 'Threw a chair', pointsDeducted: 10 },
      ],
    });
    const screen = await open();

    await fireEvent.press(screen.getByText('Recent'));

    await waitFor(() => expect(screen.getByText('Student')).toBeTruthy());
  });

  it('says so when the term has been quiet', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByText('Recent'));

    await waitFor(() =>
      expect(screen.getByText('Nothing recorded')).toBeTruthy(),
    );
  });

  it('shows a placeholder while it loads', async () => {
    school({ '/discipline/incidents': () => new Promise(() => {}) });
    const screen = await open();

    await fireEvent.press(screen.getByText('Recent'));

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

/**
 * The appeal is a student's answer to a record their family read. It is
 * judged by an admin, not by whoever wrote it.
 */
describe('judging an appeal', () => {
  const appeal = (over: Record<string, unknown> = {}) => ({
    id: 'appeal-1',
    status: 'PENDING',
    statement: 'I was at the clinic when this happened',
    incident: {
      description: 'Missed registration',
      student: { user: { firstName: 'Aline', lastName: 'Uwase' } },
    },
    ...over,
  });

  const openAppeals = async () => {
    const screen = await open(admin);
    await fireEvent.press(screen.getByText('Appeals'));
    return screen;
  };

  it('shows what is being contested and what the student says', async () => {
    school({ '/discipline/appeals/pending': [appeal()] });
    const screen = await openAppeals();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getByText('Against: Missed registration')).toBeTruthy();
    expect(
      screen.getByText('I was at the clinic when this happened'),
    ).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('lets the statement be copied, since it may be quoted back', async () => {
    school({ '/discipline/appeals/pending': [appeal()] });
    const screen = await openAppeals();

    await waitFor(() =>
      expect(
        screen.getByText('I was at the clinic when this happened').props
          .selectable,
      ).toBe(true),
    );
  });

  it('upholds it, restoring the points', async () => {
    school({
      '/discipline/appeals/pending': [appeal()],
      '/discipline/appeals/appeal-1/review': { reviewed: true },
    });
    const screen = await openAppeals();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Uphold the appeal' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Uphold the appeal' }),
    );

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        '/discipline/appeals/appeal-1/review',
        { status: 'APPROVED' },
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Points restored');
  });

  it('rejects it, leaving the record standing', async () => {
    school({
      '/discipline/appeals/pending': [appeal()],
      '/discipline/appeals/appeal-1/review': { reviewed: true },
    });
    const screen = await openAppeals();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        '/discipline/appeals/appeal-1/review',
        { status: 'REJECTED' },
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Appeal rejected');
  });

  it('names an appeal whose student record has gone', async () => {
    school({
      '/discipline/appeals/pending': [appeal({ incident: {} })],
    });
    const screen = await openAppeals();

    await waitFor(() => expect(screen.getByText('Student')).toBeTruthy());
  });

  // An appeal in a state the shared vocabulary has never seen still has to
  // draw, in the quietest colour rather than the loudest.
  it('draws an appeal in a state nobody has named', async () => {
    school({
      '/discipline/appeals/pending': [appeal({ status: 'ESCALATED' })],
    });
    const screen = await openAppeals();

    await waitFor(() => expect(screen.getByText('Escalated')).toBeTruthy());
  });

  it('says so when nothing has been contested', async () => {
    const screen = await openAppeals();

    await waitFor(() =>
      expect(screen.getByText('No appeals waiting')).toBeTruthy(),
    );
  });

  it('shows a placeholder while it loads', async () => {
    school({ '/discipline/appeals/pending': () => new Promise(() => {}) });
    const screen = await openAppeals();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});
