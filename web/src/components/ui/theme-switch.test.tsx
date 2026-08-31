import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ThemeSwitch } from "./theme-switch";
import { useThemeStore } from "@/stores/theme-store";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Three buttons rather than a switch.
 *
 * A two-state toggle cannot express "follow the machine", and that is the
 * setting most readers actually want: the dashboard should go dark when the
 * laptop does. Hiding it behind a long-press means nobody finds it.
 */

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  useThemeStore.setState({ theme: "system", resolved: "light", ready: true });
});

describe("the theme control", () => {
  it("offers all three answers, not two", () => {
    render(<ThemeSwitch />);
    expect(screen.getByLabelText("Light theme")).toBeInTheDocument();
    expect(screen.getByLabelText("Dark theme")).toBeInTheDocument();
    expect(screen.getByLabelText("System theme")).toBeInTheDocument();
  });

  /* One setting with three values, so a screen reader should announce it as
     a radio group rather than as three unrelated buttons. */
  it("is one radio group, and says which is chosen", () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole("radiogroup", { name: /colour theme/i })).toBeInTheDocument();
    expect(screen.getByLabelText("System theme")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Dark theme")).toHaveAttribute("aria-checked", "false");
  });

  it("stamps the document when an explicit choice is made", () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByLabelText("Dark theme"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  /* Going back to system removes the attribute, which is what hands the
     decision back to the media query. */
  it("un-stamps the document when system is chosen again", () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByLabelText("Dark theme"));
    fireEvent.click(screen.getByLabelText("System theme"));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("remembers the choice for the next visit", () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByLabelText("Light theme"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  // Every option carries what it does, because "System" alone does not say.
  it("explains each option", () => {
    render(<ThemeSwitch />);
    expect(screen.getByLabelText("System theme")).toHaveAttribute(
      "title",
      expect.stringMatching(/follow this machine/i),
    );
  });
});

describe("what the machine says, once system is chosen", () => {
  it("follows the machine while on system", () => {
    useThemeStore.getState().systemChanged(true);
    expect(useThemeStore.getState().resolved).toBe("dark");
  });

  /* An explicit choice is a choice: a reader who picked light keeps light
     when the laptop goes dark at sunset. */
  it("ignores the machine once a choice has been made", () => {
    useThemeStore.getState().setTheme("light");
    useThemeStore.getState().systemChanged(true);
    expect(useThemeStore.getState().resolved).toBe("light");
  });
});

/**
 * What the store believes on the very first render.
 *
 * The CSS resolves the theme before any JavaScript runs, so a store that
 * starts on "light" and corrects itself in an effect leaves everything
 * derived in JavaScript one render behind the page: the school's brand colour
 * was computed against a white card and set on a dark one, and only put right
 * afterwards. A flash of unreadable brand colour on every load, and enough to
 * fail a contrast audit that measured the first paint.
 */
describe("what is painted before an effect runs", () => {
  const withSystem = (dark: boolean) => {
    window.localStorage.clear();
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: dark && q.includes("dark"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  };

  it("reads the machine rather than assuming light", async () => {
    withSystem(true);
    vi.resetModules();
    const { useThemeStore: fresh } = await import("@/stores/theme-store");
    expect(fresh.getState().resolved).toBe("dark");
    vi.unstubAllGlobals();
  });

  it("reads a stored choice over the machine", async () => {
    withSystem(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    vi.resetModules();
    const { useThemeStore: fresh } = await import("@/stores/theme-store");
    expect(fresh.getState().resolved).toBe("light");
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });
});
