import { redirectedTo } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';
import { useAuthStore } from '@/stores/auth-store';

import Index from './index';

/**
 * The first fork in the app: three states, and they are checked in the order
 * they are because a blocked sign in outranks the other two.
 */

beforeEach(resetHarness);

describe('opening the app', () => {
  it('goes to the sign in screen when nobody is signed in', async () => {
    await renderScreen(<Index />);

    expect(redirectedTo()).toBe('/(auth)/login');
  });

  it('goes straight in when somebody is', async () => {
    signedInAs(teacher);

    await renderScreen(<Index />);

    expect(redirectedTo()).toBe('/(app)/(tabs)');
  });

  /**
   * A student's password was right, so dropping them back on the sign in
   * screen would only invite them to try the same thing and fail the same way.
   */
  it('explains itself to a student rather than bouncing them', async () => {
    useAuthStore.setState({ blockedRole: 'STUDENT', blockedName: 'Divine' });

    await renderScreen(<Index />);

    expect(redirectedTo()).toBe('/blocked');
  });

  it('does that even if a session somehow survived alongside it', async () => {
    signedInAs(teacher);
    useAuthStore.setState({ blockedRole: 'STUDENT' });

    await renderScreen(<Index />);

    expect(redirectedTo()).toBe('/blocked');
  });
});
