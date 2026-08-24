import { Text as RNText } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import { givenApi, givenApiFails, resetApi } from '@/test/api-mock';
import { buildTheme, defaultTheme } from './theme';
import { DesignProvider, useTheme } from './provider';

/**
 * The two things that are only known at runtime: whether the typeface has
 * loaded, and what colour this particular school runs under.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);
const fonts = useFonts as jest.Mock;
const splash = SplashScreen as jest.Mocked<typeof SplashScreen>;

function ShowsTheBrand() {
  const theme = useTheme();
  return <RNText>{theme.brand.raw}</RNText>;
}

const draw = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <DesignProvider>
        <ShowsTheBrand />
      </DesignProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  resetApi();
  jest.clearAllMocks();
  jest.useFakeTimers();
  fonts.mockReturnValue([true, null]);
  givenApi({
    '/school-config/public': {
      schoolName: 'Groupe Scolaire Kigali',
      schoolMotto: 'Learn and lead',
      primaryColor: '#8E44AD',
      logoUrl: '',
    },
  });
});

afterEach(() => jest.useRealTimers());

describe('the school this app is running for', () => {
  it('wears the colour the school configured', async () => {
    const screen = await draw();

    await waitFor(() => expect(screen.getByText('#8E44AD')).toBeTruthy());
  });

  /**
   * A school with a slow connection still gets in, just in the default navy
   * until the real colour lands. Branding is never allowed to hold the app
   * hostage.
   */
  it('opens in the house colour when the school cannot be reached', async () => {
    givenApiFails('/school-config/public');

    const screen = await draw();

    await waitFor(() =>
      expect(screen.getByText(defaultTheme.brand.raw)).toBeTruthy(),
    );
  });

  it('falls back to the house colour when the school set none', async () => {
    givenApi({ '/school-config/public': { schoolName: 'A school' } });

    const screen = await draw();

    await waitFor(() =>
      expect(screen.getByText(defaultTheme.brand.raw)).toBeTruthy(),
    );
  });

  it('derives the whole theme from that one colour', async () => {
    const derived = buildTheme('#8E44AD');

    expect(derived.bg.fillSelected).toBe(derived.brand.tint);
    expect(derived.brand.raw).toBe('#8E44AD');
  });

  it('reads the branding without anybody being signed in', async () => {
    const { http } = require('@/test/api-mock');
    await draw();

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/school-config/public'),
    );
  });
});

/**
 * Nothing paints before the typeface has resolved, because text that reflows
 * from a fallback face to Poppins is worse than a moment of splash screen.
 */
describe('waiting for the typeface', () => {
  it('draws nothing at all while the fonts are still loading', async () => {
    fonts.mockReturnValue([false, null]);

    const screen = await draw();

    expect(screen.queryByText('#8E44AD')).toBeNull();
  });

  // A font that fails to load is not a reason to show a blank screen forever.
  // The system face is a worse look, not a broken app.
  it('carries on in the system face when a font file will not load', async () => {
    fonts.mockReturnValue([false, new Error('font file missing')]);

    const screen = await draw();

    await waitFor(() => expect(screen.getByText('#8E44AD')).toBeTruthy());
  });
});

describe('the splash screen', () => {
  it('is held up until the app has something to show', async () => {
    expect(splash.preventAutoHideAsync).toBeDefined();
  });

  it('goes once the fonts and the branding have both arrived', async () => {
    await draw();

    await waitFor(() => expect(splash.hideAsync).toHaveBeenCalled());
  });

  /**
   * Branding is given a moment so the first paint is not in the wrong colour,
   * but a school on a slow connection cannot be left staring at a splash
   * screen. After a second and a bit it goes regardless.
   */
  it('goes anyway when the branding is taking too long', async () => {
    let answer!: (value: unknown) => void;
    givenApi({
      '/school-config/public': () =>
        new Promise((resolve) => {
          answer = resolve as never;
        }),
    });

    await draw();
    jest.advanceTimersByTime(1200);

    await waitFor(() => expect(splash.hideAsync).toHaveBeenCalled());
    answer?.({});
  });
});
