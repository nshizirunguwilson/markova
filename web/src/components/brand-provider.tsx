"use client";

import { useEffect } from "react";
import { useBrandStore } from "@/stores/brand-store";
import { DEFAULT_BRAND_COLOR } from "@/lib/chart-colors";

const API = process.env.NEXT_PUBLIC_API_URL || "";

// Mix a hex colour toward white (amount>0) or black (amount<0).
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Repaint the app in the school's colour.
 *
 * These are the `--brand-*` variables tokens.css declares on `:root` and the
 * Tailwind theme resolves through. Setting `--color-primary` directly did
 * nothing: the theme block is `@theme inline`, so every utility had the hex
 * baked into it at build time and a saved brand colour never showed up
 * anywhere.
 *
 * The washes are derived rather than fixed, or a maroon school would keep
 * Markova's blue sidebar highlight. The default colour is left exactly as the
 * designers specified it, so an untouched install is unchanged.
 */
export function applyColor(hex: string) {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", hex);
  root.style.setProperty("--brand-primary-light", shade(hex, 0.18));
  root.style.setProperty("--brand-primary-dark", shade(hex, -0.18));
  root.style.setProperty("--brand-info", hex);

  if (hex.trim().toLowerCase() === DEFAULT_BRAND_COLOR.toLowerCase()) {
    root.style.removeProperty("--brand-accent");
    root.style.removeProperty("--brand-accent-light");
    root.style.removeProperty("--brand-info-wash");
    return;
  }
  const wash = shade(hex, 0.86);
  root.style.setProperty("--brand-accent", shade(hex, 0.78));
  root.style.setProperty("--brand-accent-light", wash);
  root.style.setProperty("--brand-info-wash", wash);
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
