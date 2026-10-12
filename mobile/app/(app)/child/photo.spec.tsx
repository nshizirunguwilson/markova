import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import { parent, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import ChildPhoto from './photo';

/**
 * A child's photo, and what the family agrees to (B6). Three questions, each
 * answered with one tap; from 18 the student answers instead.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const consent = (over: Record<string, unknown> = {}) => ({
  forId: 'YES',
  inApp: 'NOT_ASKED',
  publicity: 'NOT_ASKED',
  answeredBy: 'FAMILY',
  mayAnswer: true,
  history: [
    {
      id: 'r1',
      how: 'ADMISSION_FORM',
      answeredBy: 'Jean Habimana (Father)',
      createdAt: '2026-01-10T08:00:00.000Z',
    },
  ],
  ...over,
});

const answers = (over: Record<string, unknown> = {}) =>
  givenApi({ '/students/student-1/photo-consent': consent(over) });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildPhoto />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  answers();
});

describe('the three questions', () => {
  it('asks each, and says where things stand', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('On the ID card and report card')).toBeTruthy(),
    );
    expect(screen.getByText('In the app, for classmates and other parents')).toBeTruthy();
    expect(screen.getByText("In the school's publicity")).toBeTruthy();
    expect(screen.getByText('Now: Yes')).toBeTruthy();
    expect(screen.getAllByText('Now: Not answered yet')).toHaveLength(2);
    expect(screen.getByText('Until you answer, the school counts publicity as No.')).toBeTruthy();
    expect(screen.getByText('Last answered by Jean Habimana (Father) on the admission form.')).toBeTruthy();
    expect(screenTitle()).toBe('Aline Uwase, photo');
  });

  it('saves one answer with one tap, keeping the others', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getAllByText('No')).toHaveLength(3));
    await fireEvent.press(screen.getAllByText('No')[1]);
    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith('/students/student-1/photo-consent', {
        forId: 'YES',
        inApp: 'NO',
        publicity: 'NOT_ASKED',
      }),
    );
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Saved'));
  });

  it('does nothing for a tap on the answer already given', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getAllByText('Yes')).toHaveLength(3));
    await fireEvent.press(screen.getAllByText('Yes')[0]);
    expect(http.put).not.toHaveBeenCalled();
  });

  it('says so when the answers will not load', async () => {
    givenApiFails(
      '/students/student-1/photo-consent',
      Object.assign(new Error('Forbidden'), {
        response: { status: 403, data: { message: 'Aline is 18 or over' } },
      }),
    );
    givenApi({});
    const screen = await open();
    await waitFor(() => expect(screen.getByText('That did not load')).toBeTruthy());
    expect(screen.queryByText('On the ID card and report card')).toBeNull();
  });

  it('says why when saving fails', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getAllByText('No')).toHaveLength(3));
    http.put.mockRejectedValueOnce({ response: { data: { message: 'Not allowed' } } });
    await fireEvent.press(screen.getAllByText('No')[2]);
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Not allowed'));
  });
});

describe('a child of 18', () => {
  it('says they decide now, and offers nothing to tap', async () => {
    answers({ answeredBy: 'STUDENT', mayAnswer: false, publicity: 'YES', history: [] });
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Aline is 18 or over, so Aline decides this now.')).toBeTruthy(),
    );
    expect(screen.queryByText('No')).toBeNull();
    expect(screen.queryByText(/Until you answer/)).toBeNull();
  });
});
