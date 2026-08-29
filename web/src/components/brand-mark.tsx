"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/lib/assets";
import { useBrandStore } from "@/stores/brand-store";

/** Markova's own mark - used when the school hasn't uploaded a logo. */
const FALLBACK_MARK = "/brand/logo-mark.png";

interface BrandMarkProps {
  className?: string;
  /** Render only Markova's mark, ignoring any school logo (e.g. product chrome). */
  productOnly?: boolean;
}

/**
 * The school's uploaded logo when it has one, otherwise Markova's mark.
 *
 * Note the school logo is user-uploaded and can point at a file that no longer
 * exists (the demo seed ships a placeholder path), so a load failure falls back
 * to the Markova mark rather than leaving a broken image.
 */
export function BrandMark({ className, productOnly = false }: BrandMarkProps) {
  const logoUrl = useBrandStore((s) => s.logoUrl);
  const schoolName = useBrandStore((s) => s.schoolName);
  const [failed, setFailed] = useState(false);

  const schoolLogo = productOnly || failed ? null : resolveUploadUrl(logoUrl);
  const src = schoolLogo ?? FALLBACK_MARK;

  return (
    <img
      src={src}
      alt={schoolLogo ? `${schoolName} logo` : "Markova"}
      className={cn("object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}
