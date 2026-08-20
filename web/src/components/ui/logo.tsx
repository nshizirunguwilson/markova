"use client";

import { useState } from "react";
import { cn, mediaUrl } from "@/lib/utils";
import { useBrandStore } from "@/stores/brand-store";

/**
 * Markova's own mark — the graduation cap and pencil from `brand/`, shown when
 * the school has not uploaded a logo of its own. Served from `web/public/brand`;
 * the same artwork backs the favicon, the PWA icons and the email header.
 */
const FALLBACK_MARK = "/brand/logo-mark.png";

interface LogoProps {
  /** Edge length of the square mark, in px. */
  size?: number;
  /** `mark` renders the mark alone; `lockup` adds the school name beside it. */
  variant?: "mark" | "lockup";
  /** Ignore any school logo and always show Markova's own mark. */
  productOnly?: boolean;
  className?: string;
  /** Applied to the wordmark in `lockup`, so callers control its scale/colour. */
  wordmarkClassName?: string;
}

/**
 * Renders the school's uploaded logo when it has one, and Markova's mark when
 * it does not. Every place a logo appears goes through this component, so
 * uploading a crest in Settings updates all of them at once.
 *
 * A school logo is user-uploaded and can point at a file that no longer exists,
 * so a load failure falls back to the Markova mark rather than leaving a broken
 * image.
 */
export function Logo({
  size = 32,
  variant = "mark",
  productOnly = false,
  className,
  wordmarkClassName,
}: LogoProps) {
  const schoolName = useBrandStore((s) => s.schoolName);
  const logoUrl = useBrandStore((s) => s.logoUrl);
  const [failed, setFailed] = useState(false);

  const schoolLogo = productOnly || failed ? null : mediaUrl(logoUrl);
  const src = schoolLogo ?? FALLBACK_MARK;

  const mark = (
    // eslint-disable-next-line @next/next/no-img-element -- runtime URL on the API origin, not a build-time asset
    <img
      src={src}
      alt={schoolLogo ? `${schoolName} logo` : "Markova"}
      width={size}
      height={size}
      className="object-contain"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );

  if (variant === "mark") {
    return (
      <span className={cn("inline-flex shrink-0", className)} title={schoolName}>
        {mark}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5 min-w-0", className)}>
      {mark}
      <span
        className={cn(
          "truncate text-lg font-bold text-primary",
          wordmarkClassName
        )}
      >
        {schoolName}
      </span>
    </span>
  );
}
