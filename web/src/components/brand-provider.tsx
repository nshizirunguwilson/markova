"use client";

import { useEffect } from "react";
import { useBrandStore } from "@/stores/brand-store";
import { DEFAULT_BRAND_COLOR } from "@/lib/chart-colors";
import { brandPalette } from "@/lib/brand-color";

const API = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Repaint the app in the school's colour.
 *
 * These are the `--brand-*` variables tokens.css declares on `:root` and the
 * Tailwind theme resolves through. Setting `--color-primary` directly did
 * nothing: the theme block is `@theme inline`, so every utility had the hex
 * baked into it at build time and a saved brand colour never showed up
 * anywhere.
 *
 * The washes are derived rather than fixed, or a school that chose maroon
 * would keep Markova's blue sidebar highlight — but they are derived to hold
 * WCAG AA rather than by a fixed mix, because the fixed mix that suits a navy
 * leaves a mid-green's badge text at 4.23:1. When the colour cannot support a
 * readable wash at all, the designed neutrals are left in place; see
 * lib/brand-color.ts.
 */
export function applyColor(hex: string) {
  const root = document.documentElement;
  const palette = brandPalette(hex);

  root.style.setProperty("--brand-primary", palette.primary);
  root.style.setProperty("--brand-primary-light", palette.primaryLight);
  root.style.setProperty("--brand-primary-dark", palette.primaryDark);
  root.style.setProperty("--brand-info", palette.primary);
  root.style.setProperty("--brand-on-primary", palette.onPrimary);

  // The default colour is left exactly as the designers specified it, so an
  // untouched install renders byte for byte as it always has.
  const isDefault =
    hex.trim().toLowerCase() === DEFAULT_BRAND_COLOR.toLowerCase();

  if (isDefault || !palette.accent || !palette.accentLight) {
    root.style.removeProperty("--brand-accent");
    root.style.removeProperty("--brand-accent-light");
    root.style.removeProperty("--brand-info-wash");
    return;
  }

  root.style.setProperty("--brand-accent", palette.accent);
  root.style.setProperty("--brand-accent-light", palette.accentLight);
  root.style.setProperty("--brand-info-wash", palette.accentLight);
}

/**
 * Loads the school's public branding (name, colour, logo) once on mount and
 * applies the colour to CSS variables + stores name/logo for the shell to use.
 * Re-applied live whenever the brand store changes (e.g. after Settings save).
 */
export function BrandProvider({ children }: { children: React.ReactNode }) {
  const setBrand = useBrandStore((s) => s.setBrand);
  const primaryColor = useBrandStore((s) => s.primaryColor);
  const schoolName = useBrandStore((s) => s.schoolName);

  useEffect(() => {
    let active = true;
    fetch(`${API}/school-config/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (active && b) setBrand(b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [setBrand]);

  useEffect(() => {
    if (primaryColor) applyColor(primaryColor);
  }, [primaryColor]);

  useEffect(() => {
    if (schoolName) document.title = `${schoolName} — School Management`;
  }, [schoolName]);

  return <>{children}</>;
}
