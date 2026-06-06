"use client";

import { useEffect } from "react";
import { useBrandStore } from "@/stores/brand-store";

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

function applyColor(hex: string) {
  const root = document.documentElement;
  root.style.setProperty("--color-primary", hex);
  root.style.setProperty("--color-primary-light", shade(hex, 0.18));
  root.style.setProperty("--color-primary-dark", shade(hex, -0.18));
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
