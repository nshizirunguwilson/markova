import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DARK_BRAND_GROUND,
  readableOnDark,
  contrastRatio,
  MIN_TEXT_CONTRAST,
} from "./brand-color";
import {
  applyTheme,
  isTheme,
  rememberTheme,
  resolveTheme,
  storedTheme,
  systemPrefersDark,
  THEMES,
  THEME_LABEL,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";
import tokens from "../../../design/tokens.json";

/**
 * Light, dark, or whatever the machine says.
 *
 * The rule everything here protects is that "system" is carried by stamping
 * nothing on the document. That is what lets the media query decide on its
 * own, and it is why every colour is defined on bare `:root` and only
 * redefined inside the dark blocks: a token defined solely under
 * `[data-theme]` would be undefined for the majority of readers, who have
 * never touched the control.
 */

/* Stubs must not leak between blocks: one test replaces localStorage with a
   throwing stand-in, and a later block that cleared it first would blow up. */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what counts as a theme", () => {
  it("knows the three", () => {
    expect(THEMES).toEqual(["light", "dark", "system"]);
    for (const t of THEMES) expect(isTheme(t)).toBe(true);
  });

  it("refuses anything else, including what an old build may have stored", () => {
    expect(isTheme("solarized")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });

  it("names each one for the reader", () => {
    for (const t of THEMES) expect(THEME_LABEL[t].length).toBeGreaterThan(2);
  });
});

describe("resolving a choice to a palette", () => {
  it("takes an explicit choice at its word, whatever the machine says", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the machine on system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("putting the choice on the document", () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement("html");
  });

  it("stamps an explicit choice", () => {
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  /*
    The mechanism, not a tidy-up. With the attribute gone the media query is
    what decides, so the page keeps following the machine with nothing else
    running. Setting data-theme="system" instead would match no rule at all
    and leave the page on the light palette for ever.
  */
  it("stamps nothing at all for system", () => {
    applyTheme("dark", root);
    applyTheme("system", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});

describe("remembering the choice", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("comes back as it went in", () => {
    rememberTheme("dark");
    expect(storedTheme()).toBe("dark");
  });

  it("says system when nothing has been chosen", () => {
    expect(storedTheme()).toBe("system");
  });

  it("ignores a value it does not recognise", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "midnight");
    expect(storedTheme()).toBe("system");
  });

  /*
    Storage can throw outright rather than come back empty: a private window,
    or a browser set to block site data, makes the accessor itself raise. A
    theme is not worth an error boundary.
  */
  it("survives a browser that refuses storage", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    expect(storedTheme()).toBe("system");
    expect(() => rememberTheme("dark")).not.toThrow();
  });

  it("assumes light when the machine cannot be asked", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("unsupported");
    });
    expect(systemPrefersDark()).toBe(false);
  });
});

/**
 * The script that runs before the first paint. Without it the page is painted
 * light and then corrected once React has hydrated, which is a full-screen
 * white flash on every navigation for anyone reading in the dark.
 */
describe("the pre-paint script", () => {
  it("reads the same key the app writes", () => {
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("stamps only an explicit choice, so system stays unstamped", () => {
    expect(THEME_SCRIPT).toContain('"dark"');
    expect(THEME_SCRIPT).toContain('"light"');
    expect(THEME_SCRIPT).not.toContain('"system"');
  });

  it("swallows its own errors rather than blocking the document", () => {
    expect(THEME_SCRIPT).toContain("catch");
  });

  /* It is inlined into the head and runs before anything else, so a syntax
     error in it would take the whole page down. */
  it("is valid javascript", () => {
    expect(() => new Function(THEME_SCRIPT)).not.toThrow();
  });

  it("actually applies a stored choice", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.removeAttribute("data-theme");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });
});

/**
 * The one number this file copies out of the token file.
 *
 * `readableOnDark` has to know the card colour it is lightening a school's
 * brand against, and ECharts cannot be handed a CSS variable. A copied number
 * is a number that goes stale, so it is held to the source here rather than
 * by hoping somebody remembers.
 */
describe("the dark ground the brand is checked against", () => {
  /*
    The accent, not the surface. Brand-coloured text sits on both - a link on
    a card, the active sidebar row on the accent behind it - and the accent is
    the lighter of the two, so it is the harder test. Checking only the card
    left the active nav row at 3.28:1 for a school whose colour was a green.
  */
  it("is the accent the token file actually ships", () => {
    expect(DARK_BRAND_GROUND.toLowerCase()).toBe(
      tokens.color.accent.dark.toLowerCase(),
    );
  });

  it("is the paler of the two grounds, so clearing it clears both", () => {
    expect(contrastRatio("#FFFFFF", tokens.color.accent.dark)).toBeLessThan(
      contrastRatio("#FFFFFF", tokens.color.surface.dark),
    );
  });

  it("lightens a deep brand colour until it reads on that card", () => {
    for (const brand of ["#1B4F72", "#4A235A", "#7B241C", "#0E6251"]) {
      const lifted = readableOnDark(brand);
      expect(contrastRatio(lifted, DARK_BRAND_GROUND)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    }
  });

  it("leaves a colour that already reads on dark exactly as it is", () => {
    const pale = "#8FCAEF";
    expect(readableOnDark(pale)).toBe(pale);
  });
});
