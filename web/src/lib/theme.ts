/**
 * Light, dark, or whatever the machine is set to.
 *
 * Three states rather than a boolean, because "system" is a real answer and
 * not a default for people who have not chosen. Somebody whose laptop goes
 * dark at sunset wants the dashboard to go with it; somebody who reads in a
 * bright room wants it light whatever the laptop says. A toggle can only say
 * one of those.
 *
 * The three states are carried differently on purpose:
 *
 *   light   ->  data-theme="light"   on the document
 *   dark    ->  data-theme="dark"
 *   system  ->  nothing stamped at all
 *
 * Stamping nothing is what lets `@media (prefers-color-scheme: dark)` decide
 * on its own, with no script involved and nothing to keep in sync. It also
 * means the un-stamped document is the common case, which is why every colour
 * is defined on bare `:root` and only redefined inside the media query: a
 * token defined solely under `[data-theme]` would be undefined for most
 * readers, and the page would render one theme's text on the other's ground.
 */

export type Theme = "light" | "dark" | "system";

/** What is actually painted, once "system" has been resolved. */
export type ResolvedTheme = "light" | "dark";

export const THEMES: Theme[] = ["light", "dark", "system"];

/** Where the choice is remembered. Read by the pre-paint script too. */
export const THEME_STORAGE_KEY = "markova-theme";

export const isTheme = (v: unknown): v is Theme =>
  typeof v === "string" && (THEMES as string[]).includes(v);

/**
 * What the reader chose last time, or "system" when they have not chosen.
 *
 * Reading storage can throw outright, not merely come back empty: a private
 * window, or a browser set to block site data, makes the accessor itself
 * raise. A theme is not worth an error boundary, so anything unreadable is
 * treated as no preference.
 */
export function storedTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function rememberTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A reader who cannot persist the choice still gets it for this visit.
  }
}

/** Whether the machine is asking for dark, with no assumption when it cannot say. */
export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Which of the two palettes a choice comes out as right now. */
export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

/**
 * Put the choice on the document.
 *
 * "system" removes the attribute rather than setting it to anything, which is
 * the whole mechanism: with nothing stamped, the media query is what decides,
 * so the page follows the machine from that moment on without this function
 * being called again.
 */
export function applyTheme(theme: Theme, root: HTMLElement): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/**
 * The script that runs before the first paint.
 *
 * Without it the page is painted light, then corrected once React has
 * hydrated, and a reader in a dark room gets a full-screen white flash on
 * every navigation. It is deliberately tiny and inlined into the document
 * head: anything fetched would already be too late.
 *
 * It only ever removes or sets one attribute, and it swallows its own errors,
 * so the worst a broken storage read can do is leave the page on the system
 * setting - which is the correct fallback anyway.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

/** How the choice is named to the reader. */
export const THEME_LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** What each choice does, for the control's accessible description. */
export const THEME_HINT: Record<Theme, string> = {
  light: "Always light, whatever this machine is set to",
  dark: "Always dark, whatever this machine is set to",
  system: "Follow this machine's setting",
};
