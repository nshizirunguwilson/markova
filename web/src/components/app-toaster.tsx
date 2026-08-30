"use client";

import { Toaster } from "sonner";

import { useThemeStore } from "@/stores/theme-store";

/**
 * The toasts, painted on the same ground as the page.
 *
 * Sonner draws its own surface rather than inheriting one, so left alone it
 * puts a white card with dark text over a dark dashboard. It takes the
 * resolved theme rather than the reader's choice, because "system" is not
 * something it can render.
 */
export function AppToaster() {
  const resolved = useThemeStore((s) => s.resolved);
  return <Toaster position="top-right" richColors theme={resolved} />;
}
