import { create } from 'zustand';
import api from '@/lib/api';
import { API_URL } from '@/constants/config';
import { colors } from '@/constants/theme';

export interface Brand {
  schoolName: string;
  schoolMotto: string;
  primaryColor: string;
  logoUrl: string;
}

interface BrandState extends Brand {
  setBrand: (b: Partial<Brand>) => void;
  /** Fetch public branding. Safe to call before sign-in — the route is open. */
  loadBrand: () => Promise<void>;
}

/**
 * The school's own name, colour and crest.
 *
 * The web dashboard has read this since it was built; mobile did not, so it
 * hardcoded "Markova" on the login screen and Markova navy everywhere else. A
 * second school would have had a correctly branded dashboard and a wrongly
 * branded parent app.
 */
export const useBrandStore = create<BrandState>((set) => ({
  schoolName: 'Markova',
  schoolMotto: '',
  primaryColor: colors.primary,
  logoUrl: '',

  setBrand: (b) => set((s) => ({ ...s, ...b })),

  loadBrand: async () => {
    try {
      const { data } = await api.get('/school-config/public');
      if (data) {
        set((s) => ({
          ...s,
          ...data,
          // Never let a blank value blank out the fallback.
          schoolName: data.schoolName || s.schoolName,
          primaryColor: data.primaryColor || s.primaryColor,
        }));
      }
    } catch {
      // Offline or pre-onboarding: keep the defaults rather than block the UI.
    }
  },
}));

/**
 * Resolve a stored upload path against the API origin.
 *
 * The backend stores uploads as root-relative paths and serves them outside
 * the `/api` prefix, so they need the origin prepended before <Image> can load
 * them. Mirrors `mediaUrl` in the web app.
 */
export function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:)/i.test(path)) return path;
  const origin = API_URL.replace(/\/api\/?$/, '');
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}
