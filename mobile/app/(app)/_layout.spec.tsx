import { Text as RNText } from 'react-native';

import { defaultTheme } from '@/design/theme';
import { useAuthStore } from '@/stores/auth-store';
import { inheritedOptions, redirectedTo } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';

import AppLayout from './_layout';

/**
 * The authenticated stack, and the guard in front of it.
 *
 * Headers are native and configured once here rather than being a coloured
 * bar pasted onto every screen, which is what makes the back gesture, the
 * Android back button and title truncation behave the way the phone intends.
 */

beforeEach(resetHarness);

describe('who gets past it', () => {
  it('turns away somebody with no session', async () => {
    await renderScreen(<AppLayout />);

    expect(redirectedTo()).toBe('/(auth)/login');
  });

  it('lets a signed-in member of staff through', async () => {
    signedInAs(teacher);

    const screen = await renderScreen(<AppLayout />);

    expect(redirectedTo()).toBeUndefined();
    expect(screen.toJSON()).toBeTruthy();
    expect(RNText).toBeDefined();
  });

  it('sends a blocked student to the screen that explains it', async () => {
    signedInAs(teacher);
    useAuthStore.setState({ blockedRole: 'STUDENT' });

    await renderScreen(<AppLayout />);

    expect(redirectedTo()).toBe('/blocked');
  });
});

describe('the header every screen inherits', () => {
  it('is painted in the school’s own colours', async () => {
    signedInAs(teacher);

    await renderScreen(<AppLayout />);
    const options = inheritedOptions() as {
      headerStyle: { backgroundColor: string };
      contentStyle: { backgroundColor: string };
      headerShown: boolean;
      headerShadowVisible: boolean;
      headerTintColor: string;
    };

    expect(options.headerStyle.backgroundColor).toBe(defaultTheme.bg.page);
    expect(options.contentStyle.backgroundColor).toBe(defaultTheme.bg.page);
    expect(options.headerTintColor).toBe(defaultTheme.brand.text);
    expect(options.headerShown).toBe(true);
  });

  // A shadow under the header is the one decoration this design does not
  // spend; the page separates from it by space instead.
  it('has no shadow under it', async () => {
    signedInAs(teacher);

    await renderScreen(<AppLayout />);

    expect(inheritedOptions().headerShadowVisible).toBe(false);
  });

  it('sets its titles in the interface face, not the platform default', async () => {
    signedInAs(teacher);

    await renderScreen(<AppLayout />);
    const { headerTitleStyle } = inheritedOptions() as {
      headerTitleStyle: { fontFamily: string; color: string };
    };

    expect(headerTitleStyle.fontFamily).toContain('Poppins');
    expect(headerTitleStyle.color).toBe(defaultTheme.fg.primary);
  });
});
