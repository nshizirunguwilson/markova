"use client";

import { useEffect } from "react";
import { useBrandStore } from "@/stores/brand-store";
import { useThemeStore } from "@/stores/theme-store";
import { DEFAULT_BRAND_COLOR } from "@/lib/chart-colors";
import {
  brandPalette,
  onPrimaryFor,
  readableLift,
  readableOnDark,
  shade,
} from "@/lib/brand-color";
import type { ResolvedTheme } from "@/lib/theme";

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
 * would keep Markova's blue sidebar highlight - but they are derived to hold
 * WCAG AA rather than by a fixed mix, because the fixed mix that suits a navy
 * leaves a mid-green's badge text at 4.23:1. When the colour cannot support a
 * readable wash at all, the designed neutrals are left in place; see
 * lib/brand-color.ts.
 */
const BRAND_VARS = [
  "--brand-primary",
  "--brand-primary-light",
  "--brand-primary-dark",
  "--brand-info",
  "--brand-on-primary",
  "--brand-accent",
  "--brand-accent-light",
  "--brand-info-wash",
];

/**
 * Hand every brand variable back to the stylesheet.
 *
 * These are set as inline styles, which beat any rule in a stylesheet
 * including the dark palette's. So the default install must clear them
 * rather than re-assert the light values: setting `--brand-primary` to the
 * designed navy would win over the dark block and leave a near-invisible
 * navy on a dark card, on the one install nobody has customised.
 */
function releaseToStylesheet(root: HTMLElement) {
  for (const name of BRAND_VARS) root.style.removeProperty(name);
}

export function applyColor(hex: string, theme: ResolvedTheme = "light") {
  const root = document.documentElement;

  // The default colour is left exactly as the designers specified it, so an
  // untouched install renders byte for byte as it always has - and in dark
  // mode gets the dark palette's brand, which is what the stylesheet holds.
  const isDefault =
    hex.trim().toLowerCase() === DEFAULT_BRAND_COLOR.toLowerCase();
  if (isDefault) {
    releaseToStylesheet(root);
    return;
  }

  /*
    A school's own colour, put on whichever ground it will sit on. The hue
    stays theirs either way; on the dark palette it is lightened until it
    reads, because a deep brand navy on a dark card is not a colour, it is an
    absence of one.
  */
  const palette = brandPalette(hex);
  const onDark = theme === "dark";
  const primary = onDark ? readableOnDark(hex) : palette.primary;

  const onPrimary = onDark ? onPrimaryFor(primary) : palette.onPrimary;

  root.style.setProperty("--brand-primary", primary);
  /* Lightened only as far as the text on it still reads. This is the fill
     behind the secondary button, not merely a hover tint, so a fixed lift is
     a fixed chance of failing AA on a colour nobody checked. */
  root.style.setProperty("--brand-primary-light", readableLift(primary, onPrimary));
  root.style.setProperty(
    "--brand-primary-dark",
    onDark ? shade(primary, -0.18) : palette.primaryDark,
  );
  root.style.setProperty("--brand-info", primary);
  root.style.setProperty("--brand-on-primary", onPrimary);

  /*
    The washes are pale tints, which have no dark equivalent that is still
    recognisably the school's colour. On the dark palette the designed
    neutrals are left in place instead - the same fallback this already took
    for a colour too weak to carry a readable wash.
  */
  if (onDark || !palette.accent || !palette.accentLight) {
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
  const resolved = useThemeStore((s) => s.resolved);
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

  /* Re-derived when the ground changes as well as when the colour does: the
     same brand hex needs a different treatment on a dark card, and switching
     theme without this left the school's colour derived for the wrong one. */
  useEffect(() => {
    if (primaryColor) applyColor(primaryColor, resolved);
  }, [primaryColor, resolved]);

  useEffect(() => {
    if (schoolName) document.title = `${schoolName} - School Management`;
  }, [schoolName]);

  return <>{children}</>;
}
