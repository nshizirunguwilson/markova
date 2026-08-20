"use client";

import { cn, mediaUrl } from "@/lib/utils";
import { useBrandStore } from "@/stores/brand-store";

/**
 * The Markova monogram, inlined rather than fetched so it never 404s, never
 * flashes, and costs no request. Geometry is identical to design/logo-mark.svg
 * — change one, run `node scripts/build-brand-assets.mjs`, and change the other.
 */
function MarkovaMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" rx="11" fill="var(--color-primary)" />
      <path
        d="M12.5 33V15L24 33L35.5 15V33"
        fill="none"
        stroke="var(--color-white)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps {
  /** Edge length of the square mark, in px. */
  size?: number;
  /** `mark` renders the badge alone; `lockup` adds the school name beside it. */
  variant?: "mark" | "lockup";
  className?: string;
  /** Applied to the wordmark in `lockup`, so callers control its scale/colour. */
  wordmarkClassName?: string;
}

/**
 * Renders the school's uploaded logo when one exists, and the Markova mark
 * when it does not. Every place a logo appears goes through this component, so
 * uploading a crest in Settings updates all of them at once.
 */
export function Logo({
  size = 32,
  variant = "mark",
  className,
  wordmarkClassName,
}: LogoProps) {
  const schoolName = useBrandStore((s) => s.schoolName);
  const logoUrl = useBrandStore((s) => s.logoUrl);
  const resolved = mediaUrl(logoUrl);

  const mark = resolved ? (
    // eslint-disable-next-line @next/next/no-img-element -- runtime URL on the API origin, not a build-time asset
    <img
      src={resolved}
      alt=""
      width={size}
      height={size}
      className="rounded-lg object-contain"
      style={{ width: size, height: size }}
    />
  ) : (
    <MarkovaMark size={size} />
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
