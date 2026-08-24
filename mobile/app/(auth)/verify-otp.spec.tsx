import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';

import { defaultTheme } from '@/design/theme';
import { useAuthStore } from '@/stores/auth-store';
import { router, routerState } from '@/test/router-mock';
import { renderScreen, resetHarness, styleOf } from '@/test/harness';

import VerifyOtp from './verify-otp';

/**
 * The six digits.
 *
 * Separate boxes rather than one field, because a code arriving by email is
 * read in pairs and typed with pauses. It submits itself on the sixth digit:
 * asking somebody to press a button after typing the last character of a code
 * they just read is asking them to confirm something they already confirmed.
 */

const notify = toast as jest.Mocked<typeof toast>;

const verify = jest.fn();
const resend = jest.fn();

const box = (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  index: number,
) => screen.getByLabelText(`Digit ${index + 1} of 6`);

const typeCode = async (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  code: string,
) => {
  for (const [index, digit] of [...code].entries()) {
    await fireEvent.changeText(box(screen, index), digit);
  }
};

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  verify.mockResolvedValue({});
  resend.mockResolvedValue(undefined);
  useAuthStore.setState({ verifyOtp: verify as never, resendOtp: resend as never });
  routerState.params = { identifier: 'aline.uwase@markova.edu' };
});

describe('what the screen says', () => {
  it('says where the code went', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    expect(
      screen.getByText(/We sent a six digit code to aline.uwase@markova.edu/),
    ).toBeTruthy();
  });

  it('still makes sense when it does not know where', async () => {
    routerState.params = {};

    const screen = await renderScreen(<VerifyOtp />);

    expect(screen.getByText(/We sent a six digit code\./)).toBeTruthy();
  });

  it('offers six boxes, each named for a screen reader', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    for (let i = 0; i < 6; i++) expect(box(screen, i)).toBeTruthy();
  });

  it('marks a box that has a digit in it', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent.changeText(box(screen, 0), '1');

    expect(styleOf(box(screen, 0)).borderColor).toBe(defaultTheme.brand.solid);
    expect(styleOf(box(screen, 1)).borderColor).toBe(defaultTheme.line.border);
  });
});

describe('typing the code', () => {
  it('sends it on the sixth digit without anybody pressing anything', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123456');

    await waitFor(() => expect(verify).toHaveBeenCalledWith('123456'));
  });

  it('does not send half a code', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123');

    expect(verify).not.toHaveBeenCalled();
  });

  it('ignores anything that is not a digit', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent.changeText(box(screen, 0), 'a');

    expect(box(screen, 0).props.value).toBe('');
  });

  /**
   * Somebody who copies the code out of the email pastes the whole thing into
   * whichever box the cursor happens to be in.
   */
  it('spreads a pasted code across the row and sends it', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent.changeText(box(screen, 0), '123456');

    expect(box(screen, 5).props.value).toBe('6');
    await waitFor(() => expect(verify).toHaveBeenCalledWith('123456'));
  });

  it('spreads a partial paste without sending it', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent.changeText(box(screen, 0), '123');

    expect(box(screen, 2).props.value).toBe('3');
    expect(verify).not.toHaveBeenCalled();
  });

  it('keeps only the first six of a longer paste', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent.changeText(box(screen, 0), '1234567890');

    await waitFor(() => expect(verify).toHaveBeenCalledWith('123456'));
  });

  it('strips the spaces out of a pasted code', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent.changeText(box(screen, 0), '123 456');

    await waitFor(() => expect(verify).toHaveBeenCalledWith('123456'));
  });

  // Backspace on an empty box steps back a box, which is what somebody
  // correcting the code expects it to do.
  it('steps back on backspace in an empty box', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent(box(screen, 1), 'keyPress', {
      nativeEvent: { key: 'Backspace' },
    });

    expect(box(screen, 0)).toBeTruthy();
  });

  it('stays put on backspace in a box that has a digit', async () => {
    const screen = await renderScreen(<VerifyOtp />);
    await fireEvent.changeText(box(screen, 0), '1');

    await fireEvent(box(screen, 0), 'keyPress', {
      nativeEvent: { key: 'Backspace' },
    });

    expect(box(screen, 0).props.value).toBe('1');
  });

  it('ignores any other key', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent(box(screen, 1), 'keyPress', {
      nativeEvent: { key: 'Enter' },
    });

    expect(verify).not.toHaveBeenCalled();
  });
});

describe('when the code is right', () => {
  it('goes into the app', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123456');

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)'),
    );
  });

  it('confirms it in the hand as well as on screen', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123456');

    await waitFor(() =>
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      ),
    );
  });

  it('sends a student to the screen that explains itself', async () => {
    verify.mockResolvedValue({ blocked: true });
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123456');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/blocked'));
  });
});

describe('when the code is wrong', () => {
  beforeEach(() => {
    verify.mockRejectedValue({
      response: { data: { message: 'That code has expired' } },
    });
  });

  it('says what the school said about it', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123456');

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That code has expired'),
    );
  });

  it('has something to say even when the school said nothing', async () => {
    verify.mockRejectedValue(new Error('offline'));
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123456');

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That code is not right. Try again.',
      ),
    );
  });

  // Leaving the wrong digits on screen means somebody has to clear six boxes
  // before they can try the code again.
  it('clears the boxes so the next attempt can just be typed', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123456');

    await waitFor(() => expect(box(screen, 0).props.value).toBe(''));
    expect(box(screen, 5).props.value).toBe('');
  });

  it('says so in the hand too', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await typeCode(screen, '123456');

    await waitFor(() =>
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Error,
      ),
    );
  });
});

/**
 * The API enforces a thirty second cooldown. Showing sixty, as the previous
 * version did, made people wait twice as long as they had to.
 */
describe('asking for another code', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts down from thirty, not sixty', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    expect(
      screen.getByText('You can ask for another code in 30s'),
    ).toBeTruthy();
  });

  it('counts down while somebody waits', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.getByText('You can ask for another code in 27s')).toBeTruthy();
  });

  it('offers the button once the wait is over', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    expect(
      screen.getByRole('button', { name: 'Send another code' }),
    ).toBeTruthy();
  });

  it('sends another and starts the wait again', async () => {
    const screen = await renderScreen(<VerifyOtp />);
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Send another code' }),
    );

    await waitFor(() => expect(resend).toHaveBeenCalled());
    expect(notify.success).toHaveBeenCalledWith('A new code is on its way');
    expect(screen.getByText('You can ask for another code in 30s')).toBeTruthy();
  });

  it('says so when the school will not send another yet', async () => {
    resend.mockRejectedValue(new Error('429'));
    const screen = await renderScreen(<VerifyOtp />);
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Send another code' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Could not send another code just yet',
      ),
    );
  });
});

describe('going back', () => {
  it('offers a way out to somebody who used the wrong account', async () => {
    const screen = await renderScreen(<VerifyOtp />);

    await fireEvent.press(screen.getByText('Use a different account'));

    expect(router.back).toHaveBeenCalled();
  });
});
