import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router, routerState, screenTitle } from '@/test/router-mock';
import {
  librarian,
  onAndroid,
  renderScreen,
  resetHarness,
  signedInAs,
  teacher,
} from '@/test/harness';

import Scan from './scan';

/**
 * The camera.
 *
 * One screen for two jobs, because it is the same gesture: point the phone at
 * a code. What the code means depends on where you came from, which arrives
 * as a param rather than as a mode switch somebody has to set.
 *
 * The camera stops the moment a code is read. Leaving it live means the next
 * accidental frame fires a second request, and at a library desk that is a
 * double checkout.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;
const permissions = useCameraPermissions as jest.Mock;

const grant = () =>
  permissions.mockReturnValue([
    { granted: true, canAskAgain: true, status: 'granted' },
    jest.fn(),
  ]);

const book = (over: Record<string, unknown> = {}) => ({
  id: 'book-1',
  title: 'Things Fall Apart',
  author: 'Chinua Achebe',
  quantity: 5,
  availableCount: 2,
  barcode: '9780385474542',
  isbn: '0385474547',
  isActive: true,
  ...over,
});

const shelves = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/library/books': [book()],
    '/attendance/nfc-scan': { studentName: 'Aline Uwase', status: 'PRESENT' },
    ...over,
  });

const scanCode = (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  data: string,
) => fireEvent(screen.getByLabelText('Camera'), 'barcodeScanned', { data });

/**
 * The catalogue is read but never drawn, so a test has nothing on screen to
 * wait for before a code can be looked up in it. Seeding it puts the screen's
 * own behaviour under test rather than the timing of a query.
 */
const openScanner = (books: unknown[] = [book()]) =>
  renderScreen(<Scan />, { seed: [[['books', ''], books]] });

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  grant();
  shelves();
});

/** The camera comes back on after a real pause, so the test takes one. */
const pause = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe('before the camera is allowed', () => {
  it('says it is checking while it asks the phone', async () => {
    permissions.mockReturnValue([null, jest.fn()]);
    signedInAs(librarian);

    const screen = await renderScreen(<Scan />);

    expect(screen.getByText('Checking the camera')).toBeTruthy();
    expect(screenTitle()).toBe('Scan');
  });

  /**
   * Somebody refusing a camera permission wants to know what it is for and
   * that nothing leaves the phone.
   */
  it('says what the camera is for, and that nothing is uploaded', async () => {
    const request = jest.fn();
    permissions.mockReturnValue([{ granted: false }, request]);
    signedInAs(librarian);

    const screen = await renderScreen(<Scan />);

    expect(screen.getByText('The camera is off for this app')).toBeTruthy();
    expect(
      screen.getByText(
        'Scanning a card or a barcode needs it. Nothing is recorded or uploaded, the code is read on the phone.',
      ),
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn the camera on' }),
    );
    expect(request).toHaveBeenCalled();
  });
});

describe('scanning a book at the desk', () => {
  beforeEach(() => signedInAs(librarian));

  it('says what it is for', async () => {
    await renderScreen(<Scan />);

    expect(screenTitle()).toBe('Scan a book');
  });

  it('opens the book behind a barcode', async () => {
    const screen = await openScanner();
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, '9780385474542');

    expect(notify.success).toHaveBeenCalledWith('Things Fall Apart');
    expect(router.replace).toHaveBeenCalledWith('/(app)/books/book-1');
  });

  it('reads an ISBN as readily as a barcode', async () => {
    const screen = await openScanner();
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, '0385474547');

    expect(router.replace).toHaveBeenCalledWith('/(app)/books/book-1');
  });

  it('says so when the code belongs to nothing on the shelves', async () => {
    const screen = await openScanner([]);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, 'not-a-book');

    expect(notify.error).toHaveBeenCalledWith('No book with that code');
    expect(router.replace).not.toHaveBeenCalled();
  });

  /**
   * Leaving the camera live means the next accidental frame fires a second
   * request, which at a desk is a double checkout.
   */
  it('stops reading the moment a code is taken', async () => {
    const screen = await openScanner();
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, '9780385474542');
    await scanCode(screen, '9780385474542');

    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it('starts reading again a moment after a code it could not use', async () => {
    const screen = await openScanner();
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());
    await scanCode(screen, 'not-a-book');

    await scanCode(screen, 'not-a-book');
    expect(notify.error).toHaveBeenCalledTimes(1);

    await pause(1300);
    await scanCode(screen, '9780385474542');

    expect(router.replace).toHaveBeenCalledWith('/(app)/books/book-1');
  });

  it('says what to point the phone at', async () => {
    const screen = await renderScreen(<Scan />);

    expect(
      screen.getByText('Point at the barcode on the back of the book.'),
    ).toBeTruthy();
  });
});

describe('scanning cards into a register', () => {
  beforeEach(() => {
    signedInAs(teacher);
    routerState.params = { mode: 'attendance', classSectionId: 'section-1' };
  });

  it('says what it is for', async () => {
    await renderScreen(<Scan />);

    expect(screenTitle()).toBe('Scan a card');
  });

  it('marks whoever the card belongs to', async () => {
    const screen = await renderScreen(<Scan />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, 'ABCD-EFGH-JKMN');

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/attendance/nfc-scan', {
        nfcCardId: 'ABCD-EFGH-JKMN',
        classSectionId: 'section-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Aline Uwase marked present');
  });

  it('says something sensible when the school named nobody', async () => {
    givenApi({ '/attendance/nfc-scan': {} });
    const screen = await renderScreen(<Scan />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, 'ABCD-EFGH-JKMN');

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Student marked present'),
    );
  });

  it('confirms each card in the hand, since nobody is watching the screen', async () => {
    const screen = await renderScreen(<Scan />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, 'ABCD-EFGH-JKMN');

    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  // A queue of thirty children at a door means the camera has to come back on
  // by itself, quickly.
  it('waits for the next card rather than being dismissed', async () => {
    const screen = await renderScreen(<Scan />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());
    await scanCode(screen, 'CARD-ONE');
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));

    await pause(1000);
    await scanCode(screen, 'CARD-TWO');

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(2));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('says what the school said about a card it does not know', async () => {
    givenApiFails('/attendance/nfc-scan', {
      response: { data: { message: 'That card belongs to another class' } },
    });
    const screen = await renderScreen(<Scan />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, 'ABCD-EFGH-JKMN');

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That card belongs to another class',
      ),
    );
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/attendance/nfc-scan', new Error('offline'));
    const screen = await renderScreen(<Scan />);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, 'ABCD-EFGH-JKMN');

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That card is not registered'),
    );
  });

  it('tells whoever is holding the phone what happens next', async () => {
    const screen = await renderScreen(<Scan />);

    expect(
      screen.getByText(
        'Hold a student card in front of the camera. It marks them present and waits for the next one.',
      ),
    ).toBeTruthy();
  });

  // Without a class there is nothing to mark anybody into, so it falls back to
  // looking the code up on the shelves rather than posting a bad register.
  it('does not mark anybody when no class came with the request', async () => {
    routerState.params = { mode: 'attendance' };
    const screen = await openScanner([]);
    await waitFor(() => expect(screen.getByLabelText('Camera')).toBeTruthy());

    await scanCode(screen, 'ABCD-EFGH-JKMN');

    expect(http.post).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('No book with that code');
  });
});

describe('a book with only one of the two codes on it', () => {
  it('is still found by the one it has', async () => {
    signedInAs(librarian);
    const screen = await openScanner([book({ barcode: null })]);

    await scanCode(screen, '0385474547');

    expect(router.replace).toHaveBeenCalledWith('/(app)/books/book-1');
  });
});

describe('on Android', () => {
  it('reads a card without a buzz to confirm it', async () => {
    const back = onAndroid();
    signedInAs(teacher);
    routerState.params = { mode: 'attendance', classSectionId: 'section-1' };
    const screen = await openScanner();

    await scanCode(screen, 'ABCD-EFGH-JKMN');

    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    back();
  });
});

describe('leaving', () => {
  it('goes back to whatever was underneath', async () => {
    signedInAs(librarian);
    const screen = await renderScreen(<Scan />);

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(router.back).toHaveBeenCalled();
  });
});
