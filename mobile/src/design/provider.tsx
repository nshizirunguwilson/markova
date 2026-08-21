import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useQuery } from '@tanstack/react-query';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';

import api from '@/lib/api';
import { buildTheme, defaultTheme, type Theme } from './theme';

/**
 * Holds the two things that are only known at runtime: whether the typeface
 * has loaded, and what colour this particular school runs under.
 *
 * Only five font files are bundled. Plex ships nine weights and an italic for
 * each, and shipping the lot would cost around a megabyte for weights the
 * interface never asks for. Hierarchy in this design comes from size and
 * space, so three sans weights and two mono weights cover every style in the
 * scale with nothing spare.
 */

const ThemeContext = createContext<Theme>(defaultTheme);

export const useTheme = () => use(ThemeContext);

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or the splash module is unavailable on this platform.
  // Neither is worth crashing over.
});

type PublicBranding = {
  schoolName: string;
  schoolMotto: string;
  primaryColor: string;
  logoUrl: string;
};

/**
 * The one call the app makes before anybody signs in. It is public by design,
 * because the login screen has to wear the school's name and colour before it
 * knows who is looking at it.
 */
function useBranding() {
  return useQuery({
    queryKey: ['branding'],
    queryFn: async () => {
      const { data } = await api.get<PublicBranding>('/school-config/public');
      return data;
    },
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}

export function DesignProvider({ children }: { children: ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  const { data: branding, isPending: brandingPending } = useBranding();

  const theme = useMemo(() => buildTheme(branding?.primaryColor), [branding?.primaryColor]);

  // The app is ready once the typeface is resolved. Branding is given a moment
  // to arrive so the first paint is not in the wrong colour, but it is never
  // allowed to hold the app hostage: a school with a slow connection still
  // gets in, just in the default navy until the real colour lands.
  const ready = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (ready && !brandingPending) SplashScreen.hideAsync().catch(() => {});
  }, [ready, brandingPending]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 1200);
    return () => clearTimeout(timer);
  }, [ready]);

  if (!ready) return null;

  return <ThemeContext value={theme}>{children}</ThemeContext>;
}
