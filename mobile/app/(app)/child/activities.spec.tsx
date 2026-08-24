import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import { parent, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import ChildActivities from './activities';

/**
 * The permission slip, in a parent's pocket.
 *
 * The strongest reason activities belong on a phone at all. The slip that
 * goes home in a schoolbag is why an office spends the evening before a trip
 * on the telephone, and why a child is left standing at the gate in the
 * morning. So whatever still needs an answer comes first, and nothing else
 * competes with it.
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
  myPlace: null,
  ...over,
});

const calendar = (items: unknown[]) =>
  givenApi({
    '/activities/student/student-1': items,
    '/activities/activity-1/consent': { recorded: true },
  });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildActivities />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  calendar([]);
});

describe('what still needs an answer', () => {
  it('comes first, and says how many', async () => {
    calendar([activity()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Waiting for your answer (1)')).toBeTruthy(),
    );
  });

  it('says what it is, when, and where from', async () => {
    calendar([activity()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nyungwe forest trip')).toBeTruthy(),
    );
    // The date line ends with the place it leaves from.
    expect(screen.getByText(/September.*Nyungwe$/)).toBeTruthy();
    expect(screen.getByText('Leaving from the main gate')).toBeTruthy();
  });

  it('names the child in the header', async () => {
    calendar([activity()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nyungwe forest trip')).toBeTruthy(),
    );
    expect(screenTitle()).toBe('Aline Uwase, activities');
  });

  it('records permission against the child and the activity', async () => {
    calendar([activity()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'I agree' })).toBeTruthy(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'I agree' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/activities/activity-1/consent', {
        studentId: 'student-1',
        consent: 'GIVEN',
        note: undefined,
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Permission given');
  });

  it('records a refusal just as plainly', async () => {
    calendar([activity()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Not going' })).toBeTruthy(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Not going' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/activities/activity-1/consent',
        expect.objectContaining({ consent: 'REFUSED' }),
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Recorded as not going');
  });

  /**
   * The note is the thing a paper slip never carried well: "gets travel sick,
   * please seat at the front" reaches whoever is running the trip.
   */
  it('carries a note to whoever is running it', async () => {
    calendar([activity()]);
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Anything the school should know'),
      ).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Anything the school should know'),
      'Gets travel sick, please seat her at the front',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'I agree' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/activities/activity-1/consent',
        expect.objectContaining({
          note: 'Gets travel sick, please seat her at the front',
        }),
      ),
    );
  });

  it('sends no note where only spaces were typed', async () => {
    calendar([activity()]);
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Anything the school should know'),
      ).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Anything the school should know'),
      '   ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'I agree' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/activities/activity-1/consent',
        expect.objectContaining({ note: undefined }),
      ),
    );
  });

  it('says what the school said when it refused', async () => {
    calendar([activity()]);
    givenApiFails('/activities/activity-1/consent', {
      response: { data: { message: 'That trip has already left' } },
    });
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'I agree' })).toBeTruthy(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'I agree' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That trip has already left'),
    );
  });

  it('has something to say when the school said nothing', async () => {
    calendar([activity()]);
    givenApiFails('/activities/activity-1/consent', new Error('offline'));
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'I agree' })).toBeTruthy(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'I agree' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not record that'),
    );
  });

  it('asks nothing about something that needs no permission', async () => {
    calendar([activity({ requiresConsent: false })]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Everything else')).toBeTruthy(),
    );
    expect(screen.queryByText(/Waiting for your answer/)).toBeNull();
  });

  it('asks nothing again once it has been answered', async () => {
    calendar([
      activity({ myPlace: { id: 'place-1', consent: 'GIVEN', attended: null } }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('You agreed')).toBeTruthy());
    expect(screen.queryByText(/Waiting for your answer/)).toBeNull();
  });
});

describe('everything else on the calendar', () => {
  it.each([
    ['CLUB', 'Club'],
    ['SPORT', 'Sport'],
    ['ASSEMBLY', 'Assembly'],
    ['TRIP', 'Trip'],
    ['VISITING_DAY', 'Visiting day'],
    ['SCHOOL_EVENT', 'School event'],
  ])('names a %s as "%s"', async (kind, label) => {
    calendar([activity({ kind, requiresConsent: false })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText(new RegExp(label))).toBeTruthy());
  });

  it('says where an answer was already given', async () => {
    calendar([
      activity({ myPlace: { id: 'place-1', consent: 'GIVEN', attended: null } }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('You agreed')).toBeTruthy());
  });

  it('says where one was refused', async () => {
    calendar([
      activity({
        myPlace: { id: 'place-1', consent: 'REFUSED', attended: null },
      }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('You said no')).toBeTruthy());
  });

  // A trip called off after a slip was signed is the one thing a parent has
  // to be told without opening anything.
  it('says plainly when something has been called off', async () => {
    calendar([
      activity({
        isCancelled: true,
        cancelledReason: 'Rain',
        myPlace: { id: 'place-1', consent: 'GIVEN', attended: null },
      }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Called off')).toBeTruthy());
  });

  it('says so when there is nothing else on', async () => {
    calendar([activity()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing else on the calendar.')).toBeTruthy(),
    );
  });
});

describe('when there is nothing at all', () => {
  it('says what would appear here', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing coming up')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Clubs, matches and trips your child is concerned by will show here.',
      ),
    ).toBeTruthy();
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/activities/student/student-1': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/activities/student/student-1');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
