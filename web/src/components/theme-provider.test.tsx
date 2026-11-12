import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { ThemeProvider } from "./theme-provider";
import { useThemeStore } from "@/stores/theme-store";

/**
 * The theme: the stored choice adopted on load, and "system" following the
 * machine as it changes, so the brand colour is computed for the right ground.
 */
describe("ThemeProvider", () => {
  let listeners: ((e: { matches: boolean }) => void)[];
  let removed: number;

  beforeEach(() => {
    listeners = [];
    removed = 0;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
        removeEventListener: () => (removed += 1),
      })),
    );
    try {
      localStorage.clear();
    } catch {
      /* no storage */
    }
    useThemeStore.setState({ theme: "system", resolved: "light", ready: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("adopts the stored theme and shows what it wraps", () => {
    render(
      <ThemeProvider>
        <p>The page</p>
      </ThemeProvider>,
    );
    expect(screen.getByText("The page")).toBeInTheDocument();
    expect(useThemeStore.getState().ready).toBe(true);
  });

  it("follows the machine while on system, and stops listening when gone", () => {
    const { unmount } = render(<ThemeProvider>x</ThemeProvider>);
    act(() => listeners[0]({ matches: true }));
    expect(useThemeStore.getState().resolved).toBe("dark");
    act(() => listeners[0]({ matches: false }));
    expect(useThemeStore.getState().resolved).toBe("light");
    unmount();
    expect(removed).toBe(1);
  });

  it("keeps an explicit choice when the machine changes", () => {
    render(<ThemeProvider>x</ThemeProvider>);
    act(() => useThemeStore.getState().setTheme("light"));
    act(() => listeners[0]({ matches: true }));
    expect(useThemeStore.getState().resolved).toBe("light");
  });

  it("carries on when the browser cannot answer about the machine", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => {
        throw new Error("not supported");
      }),
    );
    expect(() => render(<ThemeProvider>still here</ThemeProvider>)).not.toThrow();
    expect(screen.getByText("still here")).toBeInTheDocument();
  });
});
