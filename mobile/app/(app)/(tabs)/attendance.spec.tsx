import { fireEvent, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';

import { defaultTheme } from '@/design/theme';
import { touch } from '@/design/tokens';
import * as queue from '@/lib/offline-queue';
import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import {
  meterFill,
  onAndroid,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
  teacher,
} from '@/test/harness';

import Register from './attendance';

/**
 * The register: the tightest constraints in the app.
 *
 * Used standing up, at the start of a lesson, with thirty names to get
 * through before teaching can begin, often on a phone with no signal in a
 * classroom with thick walls. Three things follow from that, and each is a
 * group of tests below: everyone starts present, the three states are one tap
 * each and always on screen, and saving survives having no signal.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);
jest.mock('@/lib/offline-queue');

const held = queue as jest.Mocked<typeof queue>;
const notify = toast as jest.Mocked<typeof toast>;

const today = new Date().toISOString().slice(0, 10);

const student = (id: string, firstName: string, lastName = 'Uwase') => ({
  id,
  userId: `user-${id}`,
  studentIdNumber: `STD-2025-${id}`,
  firstName,
  lastName,
});

const classroom = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/assignments': [
      { id: 'a1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
    ],
    '/attendance/class-students': [
      student('1', 'Aline'),
      student('2', 'Eric'),
      student('3', 'Divine'),
    ],
    // The API's reply: a summary, with the list in `students`.
    '/attendance/class': { students: [] },
    '/attendance/bulk': { saved: true },
    ...over,
  });

const open = async () => {
  signedInAs(teacher);
  return renderScreen(<Register />);
};

const waitForRoll = async (screen: Awaited<ReturnType<typeof renderScreen>>) =>
  waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  held.getQueueSize.mockResolvedValue(0);
  held.processQueue.mockResolvedValue(0);
  held.enqueueAttendance.mockResolvedValue({ id: 'q1' } as never);
  classroom();
});

/**
 * A register where a teacher taps thirty times to record what is already true
 * is a register that gets filled in later from memory, which is worse than
 * not having one. They mark the exceptions, which on a normal day is two or
 * three people.
 */
describe('everyone starts present', () => {
  it('marks the whole class present before anybody is touched', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await waitFor(() =>
      expect(screen.getByText('3 present, 0 late, 0 absent')).toBeTruthy(),
    );
  });

  it('shows each name and ID number', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(screen.getByText('STD-2025-1')).toBeTruthy();
    expect(screen.getByText('Eric Uwase')).toBeTruthy();
  });

  /**
   * A register already taken today is not overwritten blind. Starting from
   * what is on record is what lets a teacher correct one name rather than
   * retaking the whole thing.
   */
  it('starts from a register already taken today', async () => {
    classroom({
      '/attendance/class': {
        students: [
          { studentId: '1', status: 'ABSENT' },
          { studentId: '2', status: 'LATE' },
        ],
      },
    });

    const screen = await open();
    await waitForRoll(screen);

    await waitFor(() =>
      expect(screen.getByText('1 present, 1 late, 1 absent')).toBeTruthy(),
    );
  });

  it('reads the class for today’s date, not for some other day', async () => {
    await open();

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/attendance/class', {
        params: { classSectionId: 'section-1', date: today },
      }),
    );
  });

  it('copes with a record the school left half filled in', async () => {
    classroom({
      '/attendance/class-students': [{ id: '1', firstName: 'Aline' }],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('Mark Aline present')).toBeTruthy(),
    );
    expect(
      screen.getByRole('button', { name: 'Save the register' }).props
        .accessibilityState.disabled,
    ).toBe(false);
  });

  it('draws a row with no name at all rather than falling over', async () => {
    classroom({ '/attendance/class-students': [{ id: '1' }] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('Mark  present')).toBeTruthy(),
    );
  });
});

/**
 * Three states, one tap each, side by side and always on screen. No sheets,
 * no long press, no swipe: a hidden gesture is one that gets demonstrated
 * once and then forgotten.
 */
describe('marking the exceptions', () => {
  it('offers all three states for every name, without hiding any', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(screen.getByLabelText('Mark Aline Uwase present')).toBeTruthy();
    expect(screen.getByLabelText('Mark Aline Uwase late')).toBeTruthy();
    expect(screen.getByLabelText('Mark Aline Uwase absent')).toBeTruthy();
  });

  it('marks somebody absent in one tap', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase absent'));

    await waitFor(() =>
      expect(screen.getByText('2 present, 0 late, 1 absent')).toBeTruthy(),
    );
  });

  it('marks somebody late in one tap', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(screen.getByLabelText('Mark Eric Uwase late'));

    await waitFor(() =>
      expect(screen.getByText('2 present, 1 late, 0 absent')).toBeTruthy(),
    );
  });

  it('lets a mistake be corrected in one tap too', async () => {
    const screen = await open();
    await waitForRoll(screen);
    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase absent'));

    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase present'));

    await waitFor(() =>
      expect(screen.getByText('3 present, 0 late, 0 absent')).toBeTruthy(),
    );
  });

  it('says which state a name is in, out loud', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(
      screen.getByLabelText('Mark Aline Uwase present').props
        .accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByLabelText('Mark Aline Uwase absent').props.accessibilityState,
    ).toMatchObject({ selected: false });
  });

  it('fills the state that is chosen and outlines the rest', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(
      styleOf(screen.getByLabelText('Mark Aline Uwase present')).backgroundColor,
    ).toBe(defaultTheme.status.positive.solid);
    expect(
      styleOf(screen.getByLabelText('Mark Aline Uwase absent')).backgroundColor,
    ).toBe('transparent');
  });

  it('keeps every tap target big enough to hit while standing up', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(
      styleOf(screen.getByLabelText('Mark Aline Uwase present')).width,
    ).toBeGreaterThanOrEqual(touch.min);
  });

  it('marks just as well on a phone with no haptic engine', async () => {
    const back = onAndroid();
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase absent'));

    await waitFor(() =>
      expect(screen.getByText('2 present, 0 late, 1 absent')).toBeTruthy(),
    );
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    back();
  });

  it('acknowledges each tap in the hand', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase absent'));

    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });
});

describe('the shape of the class at a glance', () => {
  it('reads as healthy when nobody is away', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await waitFor(() =>
      expect(
        screen.getByLabelText('3 present, 0 late, 0 absent'),
      ).toBeTruthy(),
    );
    expect(meterFill(screen).backgroundColor).toBe(
      defaultTheme.status.positive.solid,
    );
  });

  it('warns once somebody is away', async () => {
    // One away out of eight is a normal morning; one out of three is not, so
    // the class has to be big enough for the threshold to mean anything.
    classroom({
      '/attendance/class-students': Array.from({ length: 8 }, (_, i) =>
        student(String(i + 1), i === 0 ? 'Aline' : `Pupil${i}`),
      ),
    });
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase absent'));

    expect(meterFill(screen).backgroundColor).toBe(
      defaultTheme.status.caution.solid,
    );
  });

  // More than a quarter of the class missing is not a normal morning.
  it('reads as serious once a quarter of the class is missing', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase absent'));
    await fireEvent.press(screen.getByLabelText('Mark Eric Uwase absent'));

    expect(meterFill(screen).backgroundColor).toBe(
      defaultTheme.status.critical.solid,
    );
  });

  it('counts a late arrival as somebody who turned up', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase late'));

    expect(meterFill(screen).width).toBe('100%');
  });
});

describe('choosing which class', () => {
  it('starts on the first class a teacher has', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
  });

  it('offers every class they teach', async () => {
    classroom({
      '/academic/assignments': [
        { id: 'a1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
        { id: 'a2', classSection: { id: 'section-2', name: 'Senior 4 B' } },
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));
  });

  it('reads the roster for the class that was picked', async () => {
    classroom({
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

  it('skips a row the API sent with no class on it', async () => {
    classroom({ '/academic/assignments': [{ id: 'orphan' }] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No classes to register')).toBeTruthy(),
    );
  });

  it('says who assigns a class, since a teacher cannot', async () => {
    classroom({ '/academic/assignments': [] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Once the office assigns you a class, the register will appear here.',
        ),
      ).toBeTruthy(),
    );
  });

  it('shows a placeholder while the roster loads', async () => {
    classroom({ '/attendance/class-students': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('Loading')).toBeTruthy(),
    );
  });
});

describe('saving it', () => {
  it('sends every name with the state it is in', async () => {
    const screen = await open();
    await waitForRoll(screen);
    await fireEvent.press(screen.getByLabelText('Mark Aline Uwase absent'));

    await fireEvent.press(
      screen.getByRole('button', { name: 'Save the register' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/attendance/bulk', {
        classSectionId: 'section-1',
        date: today,
        type: 'DAILY',
        records: [
          { studentId: '1', status: 'ABSENT' },
          { studentId: '2', status: 'PRESENT' },
          { studentId: '3', status: 'PRESENT' },
        ],
      }),
    );
  });

  it('confirms it with the figure that matters', async () => {
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Save the register' }),
    );

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Register saved. 3 present.'),
    );
  });

  it('cannot be saved before there is anybody to save', async () => {
    classroom({ '/attendance/class-students': [] });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());

    expect(
      screen.getByRole('button', { name: 'Save the register' }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  /**
   * No signal in a classroom is the normal case here, not the exception. The
   * offline queue was already in the app and this screen did not use it, so a
   * register taken behind thick walls was simply lost.
   */
  it('keeps a register on the phone when there is no signal', async () => {
    givenApiFails('/attendance/bulk', { message: 'Network Error' });
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Save the register' }),
    );

    await waitFor(() =>
      expect(held.enqueueAttendance).toHaveBeenCalledWith(
        expect.objectContaining({ classSectionId: 'section-1' }),
      ),
    );
    expect(notify.success).toHaveBeenCalledWith(
      'Saved on this phone. It will send itself once you have signal.',
    );
  });

  // A register the server refused is a different problem, and queueing it
  // would mean retrying something that will be refused again forever.
  it('says so rather than queueing when the school refused it', async () => {
    givenApiFails('/attendance/bulk', {
      response: { status: 400, data: { message: 'That term is closed' } },
    });
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Save the register' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That term is closed'),
    );
    expect(held.enqueueAttendance).not.toHaveBeenCalled();
  });

  it('has something to say when the school refused it silently', async () => {
    givenApiFails('/attendance/bulk', { response: { status: 500 } });
    const screen = await open();
    await waitForRoll(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Save the register' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Could not save that register',
      ),
    );
  });

  it('says how many registers are still waiting to send', async () => {
    held.getQueueSize.mockResolvedValue(2);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('2 registers waiting to send')).toBeTruthy(),
    );
  });

  it('says one register properly', async () => {
    held.getQueueSize.mockResolvedValue(1);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('1 register waiting to send')).toBeTruthy(),
    );
  });

  it('says nothing about the queue when it is empty', async () => {
    const screen = await open();
    await waitForRoll(screen);

    expect(screen.queryByText(/waiting to send/)).toBeNull();
  });
});

/**
 * A student suspended or away today is on the register, saying so, with
 * nothing to tap, and is left out of what is saved: their family is not told
 * they were absent on a day the school sent them home.
 */
describe('a student out of school on the register', () => {
  const withSuspended = () =>
    classroom({
      '/attendance/class': {
        students: [
          {
            studentId: '3',
            status: null,
            pause: {
              kind: 'SUSPENDED',
              label: 'Suspended',
              endsOn: '2026-10-15T00:00:00.000Z',
            },
          },
        ],
      },
    });

  it('says suspended until when, with nothing to tap', async () => {
    withSuspended();
    const screen = await open();
    await waitForRoll(screen);
    await waitFor(() =>
      expect(screen.getByTestId('paused-3')).toHaveTextContent('Suspended until 15 October'),
    );
    expect(screen.queryByLabelText('Mark Divine Uwase absent')).toBeNull();
    expect(
      screen.getByText('2 present, 0 late, 0 absent, 1 suspended or away'),
    ).toBeTruthy();
  });

  it('leaves them out of what is saved', async () => {
    withSuspended();
    const screen = await open();
    await waitForRoll(screen);
    await waitFor(() => expect(screen.getByTestId('paused-3')).toBeTruthy());
    fireEvent.press(screen.getByText('Save the register'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/attendance/bulk',
        expect.objectContaining({
          records: [
            { studentId: '1', status: 'PRESENT' },
            { studentId: '2', status: 'PRESENT' },
          ],
        }),
      ),
    );
  });
});
