import { create } from "zustand";

import {
  applyTheme,
  rememberTheme,
  resolveTheme,
  storedTheme,
  systemPrefersDark,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

/**
 * The reader's theme choice, and what that currently resolves to.
 *
 * `resolved` is kept alongside `theme` because "system" is not a colour: the
 * parts of the app that are drawn rather than styled - the brand palette,
 * a chart's grid lines - have to know which of the two grounds they are
 * actually sitting on, and asking the media query at every call site would
 * scatter the same three lines through the codebase.
 */
interface ThemeState {
  theme: Theme;
  resolved: ResolvedTheme;
  /** True once the stored choice has been read, so nothing renders on a guess. */
  ready: boolean;
  setTheme: (t: Theme) => void;
  /** Adopt the stored choice. Called once, from the provider. */
  hydrate: () => void;
  /** The machine changed its mind, which only matters while on "system". */
  systemChanged: (prefersDark: boolean) => void;
}

/**
 * What the page is painted as, from the very first render.
 *
 * Not "light" until an effect says otherwise. The CSS resolves the theme
 * before any JavaScript runs, so a store that assumes light leaves everything
 * derived in JavaScript one render behind the page it is sitting on: the
 * school's brand colour was computed for a white card and set on a dark one,
 * and the effect only corrected it afterwards. A flash of unreadable brand
 * colour, on every load.
 *
 * Guarded for the server, which has no viewport and renders first.
 */
const paintedAs = (): ResolvedTheme => {
  if (typeof window === "undefined") return "light";
  return resolveTheme(storedTheme(), systemPrefersDark());
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "system",
  resolved: paintedAs(),
  ready: false,

  setTheme: (theme) => {
    rememberTheme(theme);
    if (typeof document !== "undefined") {
      applyTheme(theme, document.documentElement);
    }
    set({ theme, resolved: resolveTheme(theme, systemPrefersDark()) });
  },

  hydrate: () => {
    const theme = storedTheme();
    /* The pre-paint script has already stamped the document, so this does not
       repaint anything. It runs anyway because the two must not be able to
       drift: if the script ever fails, the attribute is still put right here
       rather than the store believing something the page is not showing. */
    if (typeof document !== "undefined") {
      applyTheme(theme, document.documentElement);
    }
    set({ theme, resolved: resolveTheme(theme, systemPrefersDark()), ready: true });
  },

  systemChanged: (prefersDark) => {
    // Only "system" follows the machine. An explicit choice is a choice.
    if (get().theme !== "system") return;
    set({ resolved: prefersDark ? "dark" : "light" });
  },
}));
