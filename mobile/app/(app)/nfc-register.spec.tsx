import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  admin,
  pressableCount,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import NfcRegister from './nfc-register';

/**
 * Binding a physical card to a student.
 *
 * Done at a desk with a stack of cards and a queue of students, so it works
 * the way that actually goes: pick the person, then read the card. The card
 * number is typed or scanned into one field and the field clears itself,
 * because the next student is already standing there.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const student = (over: Record<string, unknown> = {}) => ({
  id: 'student-1',
  userId: 'user-9',
  studentIdNumber: 'STD-2025-0417',
  nfcCardId: null,
  firstName: 'Aline',
  lastName: 'Uwase',
  ...over,
});

const desk = (students: unknown[]) =>
  givenApi({
    '/academic/sections': [{ id: 'section-1', name: 'Senior 3 A' }],
    '/attendance/class-students': students,
    '/attendance/register-nfc': { bound: true },
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<NfcRegister />);
};

const pick = async (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  name = 'Aline Uwase',
) => {
  await waitFor(() => expect(screen.getByText(name)).toBeTruthy());
  await fireEvent.press(screen.getByText(name));
  await waitFor(() => expect(screen.getByLabelText('Card number')).toBeTruthy());
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  desk([student()]);
});

// Pick the person, then read the card: the order it actually happens in.
describe('the order the desk works in', () => {
  it('asks for the student first', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('1. Pick the student')).toBeTruthy(),
    );
    expect(screen.queryByLabelText('Card number')).toBeNull();
    expect(screenTitle()).toBe('Bind a card');
  });

  it('asks for the card once somebody is picked, and names them', async () => {
    const screen = await open();

    await pick(screen);

    expect(screen.getByText('2. Read the card for Aline')).toBeTruthy();
    expect(screen.getByText('Chosen')).toBeTruthy();
  });

  it('sets the card field in mono, since a code is read character by character', async () => {
    const screen = await open();

    await pick(screen);

    expect(styleOf(screen.getByLabelText('Card number')).fontFamily).toContain(
      'JetBrains',
    );
  });

  it('lets whoever is at the desk pick somebody else', async () => {
    const screen = await open();
    await pick(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Pick somebody else' }),
    );

    await waitFor(() =>
      expect(screen.queryByLabelText('Card number')).toBeNull(),
    );
    expect(screen.getByText('1. Pick the student')).toBeTruthy();
  });

  it('counts who is bound and who is still waiting', async () => {
    desk([
      student(),
      student({ id: 'student-2', firstName: 'Eric', nfcCardId: 'ABCD-EFGH' }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Bound')).toBeTruthy());
    expect(screen.getByText('Waiting')).toBeTruthy();
  });
});

describe('binding a card', () => {
  it('binds the number to the student who was picked', async () => {
    const screen = await open();
    await pick(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Card number'),
      ' ABCD-EFGH-JKMN ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Bind it' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/attendance/register-nfc', {
        studentId: 'student-1',
        nfcCardId: 'ABCD-EFGH-JKMN',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Card bound to Aline');
  });

  it('binds from the keyboard as well as the button', async () => {
    const screen = await open();
    await pick(screen);

    await fireEvent.changeText(
      screen.getByLabelText('Card number'),
      'ABCD-EFGH',
    );
    await fireEvent(screen.getByLabelText('Card number'), 'submitEditing');

    await waitFor(() => expect(http.post).toHaveBeenCalled());
  });

  /**
   * The next student is already standing there, so the screen goes back to
   * the list rather than staying on a filled-in form.
   */
  it('clears itself for the next student in the queue', async () => {
    const screen = await open();
    await pick(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Card number'),
      'ABCD-EFGH',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Bind it' }));

    await waitFor(() =>
      expect(screen.queryByLabelText('Card number')).toBeNull(),
    );
  });

  it('will not bind an empty card number', async () => {
    const screen = await open();
    await pick(screen);

    expect(
      screen.getByRole('button', { name: 'Bind it' }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  // A card already in use somewhere else is the usual failure at a desk with
  // a stack of them.
  it('says what the school said when the card is already in use', async () => {
    givenApiFails('/attendance/register-nfc', {
      response: { data: { message: 'That card belongs to Eric Habimana' } },
    });
    const screen = await open();
    await pick(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Card number'),
      'ABCD-EFGH',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Bind it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That card belongs to Eric Habimana',
      ),
    );
  });

  it('guesses at that when the school said nothing', async () => {
    givenApiFails('/attendance/register-nfc', new Error('offline'));
    const screen = await open();
    await pick(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Card number'),
      'ABCD-EFGH',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Bind it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That card could not be bound. It may be in use.',
      ),
    );
  });
});

/**
 * Binding a second card silently orphans the first, so students who already
 * have one are shown but not offered.
 */
describe('students who already have a card', () => {
  it('are listed separately, with the card they hold', async () => {
    desk([student({ nfcCardId: 'ABCD-EFGH' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Already bound')).toBeTruthy());
    expect(screen.getByText('ABCD-EFGH')).toBeTruthy();
  });

  it('cannot be picked, so the first card is never orphaned', async () => {
    desk([student({ nfcCardId: 'ABCD-EFGH' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Already bound')).toBeTruthy());
    expect(pressableCount(screen)).toBe(1);
  });

  it('says why, and what to do instead', async () => {
    desk([student({ nfcCardId: 'ABCD-EFGH' })]);

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Binding a second card would orphan the first, so these are not offered here. Revoke the old card from the ID cards screen first.',
        ),
      ).toBeTruthy(),
    );
  });

  it('says so when the whole class is done', async () => {
    desk([student({ nfcCardId: 'ABCD-EFGH' })]);

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('Every student in this class has a card.'),
      ).toBeTruthy(),
    );
  });
});

describe('choosing a class', () => {
  it('reads the roster for the one picked', async () => {
    givenApi({
      '/academic/sections': [
        { id: 'section-1', name: 'Senior 3 A' },
        { id: 'section-2', name: 'Senior 4 B' },
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

  it('says so when a class has nobody in it', async () => {
    desk([]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('No students')).toBeTruthy());
    expect(screen.getByText('Pick a class with students in it.')).toBeTruthy();
  });

  it('shows a placeholder while the roster loads', async () => {
    givenApi({ '/attendance/class-students': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});
