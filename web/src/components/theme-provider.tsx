"use client";

import { useEffect } from "react";

import { useThemeStore } from "@/stores/theme-store";

/**
 * Adopts the stored theme, and keeps "system" following the machine.
 *
 * The CSS follows the machine on its own: with nothing stamped on the
 * document, `@media (prefers-color-scheme: dark)` decides, and it keeps
 * deciding as the machine changes without anything here running. What this
 * listener is for is the part of the app that is not CSS - the brand palette,
 * which is computed against whichever ground it will sit on - so the store's
 * `resolved` has to change at the same moment the media query does.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useThemeStore((s) => s.hydrate);
  const systemChanged = useThemeStore((s) => s.systemChanged);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      // A browser that cannot answer leaves the app on what it resolved to.
      return;
    }
    const onChange = (e: MediaQueryListEvent) => systemChanged(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [systemChanged]);

  return <>{children}</>;
}
