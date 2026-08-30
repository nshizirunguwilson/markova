"use client";

import { useMemo } from "react";

import { chartChrome } from "@/lib/chart-theme";
import { useThemeStore } from "@/stores/theme-store";

/**
 * The chart furniture for whichever ground the page is currently on.
 *
 * Memoised on the resolved theme because ECharts treats a new options object
 * as a reason to re-render the whole chart, and rebuilding these on every
 * parent render made every chart in the app flicker.
 */
export function useChartTheme() {
  const resolved = useThemeStore((s) => s.resolved);
  return useMemo(() => chartChrome(resolved), [resolved]);
}
