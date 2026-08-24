import { useAuthStore } from '@/stores/auth-store';
import { redirectedTo } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';

import AuthLayout from './_layout';

/** The sign-in stack, and who is not allowed to sit on it. */

beforeEach(resetHarness);

describe('the sign in stack', () => {
  it('shows itself to somebody who is not signed in', async () => {
    const screen = await renderScreen(<AuthLayout />);

    expect(redirectedTo()).toBeUndefined();
    expect(screen.toJSON()).toBeTruthy();
  });

  it('sends somebody already signed in into the app', async () => {
    signedInAs(teacher);

    await renderScreen(<AuthLayout />);

    expect(redirectedTo()).toBe('/(app)/(tabs)');
  });

  /**
   * Checked before the signed-in redirect. A blocked sign in clears the
   * tokens, so without this the layout would bounce a student straight back to
   * the sign in screen and they would never see the one explaining what
   * happened.
   */
  it('sends a blocked student to the screen that explains it', async () => {
    useAuthStore.setState({ blockedRole: 'STUDENT' });

    await renderScreen(<AuthLayout />);

    expect(redirectedTo()).toBe('/blocked');
  });

  it('does that even when a session survived alongside the block', async () => {
    signedInAs(teacher);
    useAuthStore.setState({ blockedRole: 'STUDENT' });

    await renderScreen(<AuthLayout />);

    expect(redirectedTo()).toBe('/blocked');
  });
});
