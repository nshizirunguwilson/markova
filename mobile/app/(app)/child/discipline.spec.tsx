import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import { parent, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import ChildDiscipline from './discipline';

/**
 * A child's conduct record, and the parent's right to answer it.
 *
 * The most consequential screen a parent sees, so it is the one place in the
 * app where an action is deliberately made harder rather than easier.
 * Acknowledging is one tap, because that just says "I have seen this".
 * Appealing opens a field and asks for a reason in the parent's own words,
 * because an appeal that can be filed by accident is worth nothing to the
 * student who needs one.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const incident = (over: Record<string, unknown> = {}) => ({
  id: 'incident-1',
  actionTaken: 'WRITTEN_WARNING',
  description: 'Threw a chair across the room during registration',
  pointsDeducted: 5,
  date: '2026-08-18',
  location: 'Classroom',
  parentAcknowledged: false,
  appeals: [],
  ...over,
});

const record = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/discipline/student/student-1': {
      incidents: [],
      disciplinePoints: 100,
      ...over,
    },
    '/discipline/standing/student-1': {
      points: 100,
      ceiling: 100,
      pointsToCleanSheet: 0,
      meritCount: 0,
      incidentCount: 0,
      merits: [],
    },
    '/discipline/acknowledge': { acknowledged: true },
    '/discipline/appeals': { id: 'appeal-1' },
  });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildDiscipline />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  record();
});

describe('where the child stands', () => {
  it('names the child in the header', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Conduct points')).toBeTruthy(),
    );
    expect(screenTitle()).toBe('Aline Uwase, conduct');
  });

  it('says everybody starts at a hundred, so the number means something', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Everyone starts at 100')).toBeTruthy(),
    );
  });

  it('counts what is on record', async () => {
    record({ incidents: [incident()], disciplinePoints: 95 });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('On record')).toBeTruthy());
    expect(screen.getByText('95')).toBeTruthy();
  });

  it('reads the points under either name the API uses', async () => {
    record({ disciplinePoints: undefined, points: 88 });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('88')).toBeTruthy());
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/discipline/student/student-1': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

/**
 * A record showing only what was lost gives a student nothing to aim at, so
 * the way back is stated as a number rather than left as a feeling.
 */
describe('the way back', () => {
  it('is called plain conduct when it does not know whose it is', async () => {
    signedInAs(parent);
    routerState.params = { studentId: 'student-1' };

    const screen = await renderScreen(<ChildDiscipline />);

    await waitFor(() =>
      expect(screen.getByText('Conduct points')).toBeTruthy(),
    );
    expect(screenTitle()).toBe('Conduct');
  });

  it.each([
    [95, 'positive'],
    [72, 'caution'],
    [40, 'critical'],
  ])('reads a standing of %s the way a school would', async (points, tone) => {
    const { defaultTheme } = require('@/design/theme');
    record({ disciplinePoints: points });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(String(points))).toBeTruthy(),
    );
    expect(
      Object.assign(
        {},
        ...[screen.getByText(String(points)).props.style].flat(Infinity),
      ).color,
    ).toBe(
      tone === 'positive'
        ? defaultTheme.status.positive.text
        : tone === 'caution'
          ? defaultTheme.status.caution.text
          : defaultTheme.status.critical.text,
    );
  });

  it('draws before the standing has arrived', async () => {
    givenApi({ '/discipline/standing/student-1': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Conduct points')).toBeTruthy(),
    );
    expect(screen.queryByText('Recognised for')).toBeNull();
    expect(screen.queryByText(/clean sheet/)).toBeNull();
  });

  it('says nothing about recognition where there is none', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/conduct record is clean/)).toBeTruthy(),
    );
    expect(screen.queryByText('Recognised for')).toBeTruthy();
  });

  it('says how far off a clean sheet they are', async () => {
    givenApi({
      '/discipline/standing/student-1': {
        points: 88,
        ceiling: 100,
        pointsToCleanSheet: 12,
        meritCount: 1,
        incidentCount: 2,
        merits: [],
      },
    });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          '12 points from a clean sheet. Points come back when the school recognises something they have done.',
        ),
      ).toBeTruthy(),
    );
  });

  it('says so plainly when there is nothing held against them', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Their conduct record is clean. Nothing is held against them.',
        ),
      ).toBeTruthy(),
    );
  });

  /**
   * Above the incidents on purpose: a record that opens with what went wrong
   * teaches a child that being unnoticed is the best they can manage.
   */
  it('shows what they were recognised for, with who gave it', async () => {
    givenApi({
      '/discipline/standing/student-1': {
        points: 100,
        ceiling: 100,
        pointsToCleanSheet: 0,
        meritCount: 1,
        incidentCount: 0,
        merits: [
          {
            id: 'merit-1',
            category: 'HONESTY',
            description: 'Handed in a wallet she found',
            points: 10,
            date: '2026-08-20',
            awardedBy: { firstName: 'Aline', lastName: 'Uwase' },
          },
        ],
      },
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Handed in a wallet she found')).toBeTruthy(),
    );
    expect(screen.getByText('+10')).toBeTruthy();
    expect(screen.getByText(/by Aline Uwase/)).toBeTruthy();
    // Both the stat label and the section heading say it.
    expect(screen.getAllByText('Recognised for')).toHaveLength(2);
  });
});

/**
 * If the school recorded it, the parent reads it in full. Nothing is
 * collapsed or hidden behind a count.
 */
describe('an incident', () => {
  it('is shown whole, in the words the school used', async () => {
    record({ incidents: [incident()] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Written warning')).toBeTruthy(),
    );
    expect(
      screen.getByText('Threw a chair across the room during registration'),
    ).toBeTruthy();
    expect(screen.getByText('-5')).toBeTruthy();
    expect(screen.getByText('Classroom')).toBeTruthy();
  });

  it('lets the description be copied, since it may be quoted', async () => {
    record({ incidents: [incident()] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('Threw a chair across the room during registration')
          .props.selectable,
      ).toBe(true),
    );
  });

  it('leaves out a place nobody recorded', async () => {
    record({ incidents: [incident({ location: undefined })] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Written warning')).toBeTruthy(),
    );
    expect(screen.queryByText('Where')).toBeNull();
  });

  it('says whether the parent has seen it', async () => {
    record({ incidents: [incident()] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Not yet')).toBeTruthy());
  });

  it('says so when nothing has been recorded at all', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing on record')).toBeTruthy(),
    );
  });
});

// One tap, because it only says "I have seen this".
describe('acknowledging one', () => {
  it('takes a single tap', async () => {
    record({ incidents: [incident()] });
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'I have seen this' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'I have seen this' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/discipline/acknowledge', {
        incidentId: 'incident-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Marked as seen');
  });

  it('is not offered again once it has been seen', async () => {
    record({ incidents: [incident({ parentAcknowledged: true })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Yes')).toBeTruthy());
    expect(
      screen.queryByRole('button', { name: 'I have seen this' }),
    ).toBeNull();
  });
});

/**
 * An appeal that can be filed by accident is worth nothing to the student who
 * needs one, so this one asks for words.
 */
describe('appealing one', () => {
  const openAppeal = async () => {
    record({ incidents: [incident()] });
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Appeal this' })).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Appeal this' }));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Why should this be reconsidered?'),
      ).toBeTruthy(),
    );
    return screen;
  };

  it('asks for the reason in the parent’s own words', async () => {
    const screen = await openAppeal();

    expect(
      screen.getByText(
        'The school reads this in full. Say what happened from your side.',
      ),
    ).toBeTruthy();
  });

  it('sends it against the incident it contests', async () => {
    const screen = await openAppeal();

    await fireEvent.changeText(
      screen.getByLabelText('Why should this be reconsidered?'),
      'She was at the clinic that whole morning, the nurse can confirm it',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Send the appeal' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/discipline/appeals', {
        incidentId: 'incident-1',
        statement:
          'She was at the clinic that whole morning, the nurse can confirm it',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith(
      'Appeal sent. The school will review it.',
    );
  });

  it('closes the form once it has gone', async () => {
    const screen = await openAppeal();
    await fireEvent.changeText(
      screen.getByLabelText('Why should this be reconsidered?'),
      'She was at the clinic that whole morning, the nurse can confirm it',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Send the appeal' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByLabelText('Why should this be reconsidered?'),
      ).toBeNull(),
    );
  });

  // "Unfair" is not something a school can consider.
  it('refuses a statement too thin for the school to consider', async () => {
    const screen = await openAppeal();

    await fireEvent.changeText(
      screen.getByLabelText('Why should this be reconsidered?'),
      'Unfair',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Send the appeal' }),
    );

    expect(notify.error).toHaveBeenCalledWith(
      'Say a little more so the school has something to consider',
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('can be thought better of', async () => {
    const screen = await openAppeal();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByLabelText('Why should this be reconsidered?'),
      ).toBeNull(),
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('says so when the appeal will not send', async () => {
    record({ incidents: [incident()] });
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Appeal this' })).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Appeal this' }));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Why should this be reconsidered?'),
      ).toBeTruthy(),
    );
    givenApiFails('/discipline/appeals', new Error('offline'));
    await fireEvent.changeText(
      screen.getByLabelText('Why should this be reconsidered?'),
      'She was at the clinic that whole morning, the nurse can confirm it',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Send the appeal' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not send that appeal'),
    );
  });

  it('shows where an appeal already made has got to', async () => {
    record({
      incidents: [incident({ appeals: [{ id: 'appeal-1', status: 'PENDING' }] })],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Pending')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Appeal this' })).toBeNull();
  });

  // An appeal in a state the shared vocabulary has never seen still draws.
  it('shows an appeal in a state nobody has named', async () => {
    record({
      incidents: [
        incident({ appeals: [{ id: 'appeal-1', status: 'ESCALATED' }] }),
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Escalated')).toBeTruthy());
  });

  it('does not offer a second appeal against the same incident', async () => {
    record({
      incidents: [
        incident({ appeals: [{ id: 'appeal-1', status: 'REJECTED' }] }),
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Rejected')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Appeal this' })).toBeNull();
  });
});

/** An adult child keeping this from their parents (A8): said calmly, not empty. */
describe('a record an adult child keeps private', () => {
  it('says so in the school\'s own sentence', async () => {
    givenApiFails(
      '/discipline/student/student-1',
      Object.assign(new Error('Forbidden'), {
        response: {
          status: 403,
          data: {
            reason: 'KEPT_PRIVATE',
            message: 'Aline has chosen to keep their attendance and discipline private.',
          },
        },
      }),
    );
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Aline has chosen to keep their attendance and discipline private.')).toBeTruthy(),
    );
    expect(screen.getByText(/From 18, a student decides/)).toBeTruthy();
  });
});
