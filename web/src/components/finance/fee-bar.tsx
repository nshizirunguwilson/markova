"use client";

import { STATUS_BAR, settledPercent, type FeeStanding, type FeeStatus } from "@/lib/fees";

/**
 * How far through the bill a family is, as a bar.
 *
 * A column of numbers answers "how much" but not "how close", and a bursar
 * scanning four hundred rows for the ones to chase is asking the second. The
 * bar is the same colour as the status badge beside it, so the row reads as
 * one fact told twice rather than two facts to reconcile.
 *
 * Never the only carrier of the answer: the numbers are alongside it, and the
 * `aria-label` says it in words. Colour and length both fail for somebody.
 */
export function FeeBar({
  standing,
  status,
  className = "",
}: {
  standing: FeeStanding | null;
  status: FeeStatus;
  className?: string;
}) {
  const percent = settledPercent(standing);

  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-muted ${className}`}
      role="img"
      aria-label={
        status === "NOT_INVOICED"
          ? "Not billed for this term"
          : `${percent}% of the fees settled`
      }
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${STATUS_BAR[status]}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
