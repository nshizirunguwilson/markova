import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';

import Activities from './activities';

/**
 * The school calendar, and the register that goes with it.
 *
 * A club that never takes a register quietly stops existing, and taking one
 * on paper in a classroom at four in the afternoon means it reaches the
 * office some time next week, if at all. This is the version that gets used,
 * because the phone is already in the teacher's hand.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const activity = (over: Record<string, unknown> = {}) => ({
  id: 'activity-1',
  kind: 'TRIP',
  title: 'Nyungwe forest trip',
  description: 'Leaving from the main gate',
  location: 'Nyungwe',
  startsAt: '2026-09-10T07:00:00.000Z',
  endsAt: null,
  requiresConsent: true,
  tracksAttendance: true,
  isCancelled: false,
  cancelledReason: null,
  ...over,
});

const participant = (over: Record<string, unknown> = {}) => ({
  id: 'place-1',
  consent: 'PENDING',
  attended: false,
  student: {
    id: 'student-1',
    studentIdNumber: 'STD-2025-0417',
    user: { firstName: 'Aline', lastName: 'Uwase', photoUrl: null },
  },
  ...over,
});

const calendar = (
  items: unknown[],
  detail: Record<string, unknown> = {},
  consent: Record<string, unknown> = {},
) =>
  givenApi({
    '/activities/upcoming': items,
    '/activities/activity-1/consent': {
      given: [],
      refused: [],
      pending: [],
      ...consent,
    },
    '/activities/activity-1/attendance': { taken: true },
    '/activities/activity-1': { ...activity(), participants: [], ...detail },
  });

const open = async () => {
  signedInAs(teacher);
  return renderScreen(<Activities />);
};

const openDetail = async (screen: Awaited<ReturnType<typeof renderScreen>>) => {
  await waitFor(() =>
    expect(screen.getByText('Nyungwe forest trip')).toBeTruthy(),
  );
  await fireEvent.press(screen.getByText('Nyungwe forest trip'));
  await waitFor(() => expect(screen.getByText(/On the list/)).toBeTruthy());
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  calendar([]);
});

describe('the calendar', () => {
  it('lists what is coming up, with the kind and the time', async () => {
    calendar([activity()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nyungwe forest trip')).toBeTruthy(),
    );
    expect(screen.getByText(/^Trip.*Nyungwe$/)).toBeTruthy();
    expect(screenTitle()).toBe('Activities');
  });

  /**
   * Slips outstanding is the state somebody has to act on, so it outranks the
   * register on the row.
   */
  it('says when slips are still needed', async () => {
    calendar([activity()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Slips needed')).toBeTruthy());
  });

  it('says when a register is expected instead', async () => {
    calendar([activity({ requiresConsent: false })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Register')).toBeTruthy());
  });

  // Called off outranks everything: a slip signed for a cancelled trip is
  // worse than no slip at all.
  it('says plainly when something has been called off', async () => {
    calendar([activity({ isCancelled: true })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Called off')).toBeTruthy());
    expect(screen.queryByText('Slips needed')).toBeNull();
  });

  it('says nothing at all about one that needs neither', async () => {
    calendar([
      activity({ requiresConsent: false, tracksAttendance: false }),
    ]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nyungwe forest trip')).toBeTruthy(),
    );
    expect(screen.queryByText('Register')).toBeNull();
    expect(screen.queryByText('Slips needed')).toBeNull();
  });

  it('says what would appear here when nothing has', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing on the calendar')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Clubs, matches, assemblies and trips appear here once the office puts them on.',
      ),
    ).toBeTruthy();
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/activities/upcoming': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/activities/upcoming');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

/**
 * The day before a trip, "who has not answered" is the only question anybody
 * is actually asking, so the three counts sit at the top.
 */
describe('one activity', () => {
  it('counts who has answered and who has not', async () => {
    calendar(
      [activity()],
      {},
      {
        given: [{ id: 'p1' }, { id: 'p2' }],
        refused: [{ id: 'p3' }],
        pending: [{ id: 'p4' }, { id: 'p5' }, { id: 'p6' }],
      },
    );
    const screen = await open();

    await openDetail(screen);

    await waitFor(() => expect(screen.getByText('Not answered')).toBeTruthy());
    expect(screen.getByText('Agreed')).toBeTruthy();
    expect(screen.getByText('Refused')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('asks for none of that when nothing needs permission', async () => {
    calendar([activity({ requiresConsent: false })], {
      requiresConsent: false,
    });
    const screen = await open();

    await openDetail(screen);

    expect(screen.queryByText('Not answered')).toBeNull();
    expect(http.get).not.toHaveBeenCalledWith(
      '/activities/activity-1/consent',
      expect.anything(),
    );
  });

  it('names it, says when, and says what it is', async () => {
    calendar([activity()]);
    const screen = await open();

    await openDetail(screen);

    expect(screenTitle()).toBe('Nyungwe forest trip');
    expect(screen.getByText('Leaving from the main gate')).toBeTruthy();
  });

  it('goes back to the calendar', async () => {
    calendar([activity()]);
    const screen = await open();
    await openDetail(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Back to the calendar' }),
    );

    await waitFor(() => expect(screen.getByText('Coming up')).toBeTruthy());
  });

  it('shows a placeholder while the detail loads', async () => {
    calendar([activity()]);
    givenApi({ '/activities/activity-1': () => new Promise(() => {}) });
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Nyungwe forest trip')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Nyungwe forest trip'));

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

describe('who is on the list', () => {
  it('names each of them, and counts them in the heading', async () => {
    calendar([activity()], { participants: [participant()] });
    const screen = await open();

    await openDetail(screen);

    expect(screen.getByText('On the list (1)')).toBeTruthy();
    expect(screen.getByText('Aline Uwase')).toBeTruthy();
    expect(screen.getByText('STD-2025-0417')).toBeTruthy();
  });

  it.each([
    ['GIVEN', 'Agreed'],
    ['REFUSED', 'No'],
    ['PENDING', 'Waiting'],
  ])('says where a %s slip has got to', async (consent, label) => {
    calendar([activity()], { participants: [participant({ consent })] });
    const screen = await open();

    await openDetail(screen);

    await waitFor(() =>
      expect(screen.getAllByText(label).length).toBeGreaterThan(0),
    );
  });

  it('says nothing about slips where none are needed', async () => {
    calendar([activity({ requiresConsent: false })], {
      requiresConsent: false,
      participants: [participant()],
    });
    const screen = await open();

    await openDetail(screen);

    expect(screen.queryByText('Waiting')).toBeNull();
  });

  it('draws a detail the API sent almost empty', async () => {
    calendar([activity()]);
    givenApi({ '/activities/activity-1': {} });
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Nyungwe forest trip')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Nyungwe forest trip'));

    await waitFor(() => expect(screen.getByText('On the list (0)')).toBeTruthy());
    expect(screenTitle()).toBe('Activity');
  });

  it('says so when nobody has signed up', async () => {
    calendar([activity()]);
    const screen = await open();

    await openDetail(screen);

    expect(screen.getByText('Nobody has signed up yet.')).toBeTruthy();
  });
});

/**
 * The register the phone was made for: taken in the room, not written on
 * paper that reaches the office next week.
 */
describe('taking the register', () => {
  it('says how, since a tap on a name is not obvious', async () => {
    calendar([activity()], { participants: [participant()] });
    const screen = await open();

    await openDetail(screen);

    expect(
      screen.getByText(
        'Tap a name to mark them present or take the mark off again.',
      ),
    ).toBeTruthy();
  });

  it('marks somebody present in one tap', async () => {
    calendar([activity()], { participants: [participant()] });
    const screen = await open();
    await openDetail(screen);

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/activities/activity-1/attendance',
        { records: [{ studentId: 'student-1', attended: true }] },
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Register taken');
  });

  it('takes the mark off again just as easily', async () => {
    calendar([activity()], {
      participants: [participant({ attended: true })],
    });
    const screen = await open();
    await openDetail(screen);

    expect(screen.getByText('Came')).toBeTruthy();
    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/activities/activity-1/attendance',
        { records: [{ studentId: 'student-1', attended: false }] },
      ),
    );
  });

  it('says what the school said when it refused', async () => {
    calendar([activity()], { participants: [participant()] });
    givenApiFails('/activities/activity-1/attendance', {
      response: { data: { message: 'That trip has not happened yet' } },
    });
    const screen = await open();
    await openDetail(screen);

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That trip has not happened yet',
      ),
    );
  });

  it('has something to say when the school said nothing', async () => {
    calendar([activity()], { participants: [participant()] });
    givenApiFails('/activities/activity-1/attendance', new Error('offline'));
    const screen = await open();
    await openDetail(screen);

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not take the register'),
    );
  });

  // Nothing to mark means nothing to say about marking.
  it('says nothing about a register where none is kept', async () => {
    calendar([activity({ tracksAttendance: false })], {
      tracksAttendance: false,
      participants: [participant()],
    });
    const screen = await open();

    await openDetail(screen);

    expect(screen.queryByText(/Tap a name/)).toBeNull();
    expect(screen.queryByText('Mark')).toBeNull();
  });
});
