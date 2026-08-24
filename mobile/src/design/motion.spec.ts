import { AccessibilityInfo } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { duration, easing, useReducedMotion, withReducedMotion } from './motion';

/**
 * Motion, and the right to switch it off.
 *
 * WCAG 2.3.3 covers animation triggered by interaction, and both platforms
 * expose a system setting for it. Motion that cannot be turned off can cause
 * dizziness and nausea in people with vestibular disorders, and an infinite
 * pulse like a skeleton loader is exactly the kind of thing that does it.
 */

describe('how long things take', () => {
  /**
   * A thing arriving needs longer than the same thing leaving: the eye has to
   * find something that appeared, and needs no time at all to let go of
   * something that has gone.
   */
  it('gives an entrance longer than an exit', () => {
    expect(duration.enter).toBeGreaterThan(duration.exit);
  });

  it('acknowledges a touch almost instantly', () => {
    expect(duration.feedback).toBeLessThan(duration.exit);
  });

  it('keeps a whole screen under the ceiling of 400ms', () => {
    expect(duration.screen).toBeLessThanOrEqual(400);
    expect(duration.screen).toBeGreaterThan(duration.enter);
  });
});

describe('the shape of a movement', () => {
  it('decelerates on the way in, so a thing settles instead of slamming', () => {
    expect(easing.enter[1]).toBeGreaterThan(easing.enter[0]);
  });

  it('accelerates on the way out, so a thing commits to leaving', () => {
    expect(easing.exit).toEqual([0.4, 0, 1, 1]);
  });

  // Nothing in the physical world moves at a constant speed, so a linear
  // curve reads as mechanical.
  it('is never linear', () => {
    for (const curve of Object.values(easing)) {
      expect([...curve]).not.toEqual([0, 0, 1, 1]);
    }
  });
});

describe('a duration when somebody has asked for less motion', () => {
  // Zero rather than something small: the guidance is to remove the
  // animation, not to perform it quickly. A fast animation is still one.
  it('collapses to nothing rather than to something quick', () => {
    expect(withReducedMotion(true, duration.enter)).toBe(0);
  });

  it('is left alone otherwise', () => {
    expect(withReducedMotion(false, duration.enter)).toBe(duration.enter);
  });
});

describe('asking the phone whether to move at all', () => {
  let isEnabled: jest.SpyInstance;
  let addListener: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    isEnabled = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    addListener = jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  it('assumes motion is wanted until the phone says otherwise', async () => {
    const { result } = await renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('reads the setting the person already had switched on', async () => {
    isEnabled.mockResolvedValue(true);

    const { result } = await renderHook(() => useReducedMotion());

    await waitFor(() => expect(result.current).toBe(true));
  });

  // Somebody who turns it on halfway through using the app did so for a
  // reason, and should not have to restart it.
  it('notices the setting being turned on while the app is open', async () => {
    let notify!: (value: boolean) => void;
    addListener.mockImplementation(((_event: string, handler: never) => {
      notify = handler;
      return { remove: jest.fn() };
    }) as never);

    const { result } = await renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    await act(() => notify(true));

    expect(result.current).toBe(true);
  });

  it('stops listening when the screen goes away', async () => {
    const remove = jest.fn();
    addListener.mockReturnValue({ remove } as never);

    const { unmount } = await renderHook(() => useReducedMotion());
    await unmount();

    expect(remove).toHaveBeenCalled();
  });

  // The read is asynchronous. If it lands after the screen closed, setting
  // state on a gone component is a warning at best and a leak at worst.
  it('does not answer a screen that has already closed', async () => {
    let settle!: (value: boolean) => void;
    isEnabled.mockReturnValue(
      new Promise<boolean>((resolve) => {
        settle = resolve;
      }),
    );
    const warn = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = await renderHook(() => useReducedMotion());
    await unmount();
    await act(async () => {
      settle(true);
    });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
