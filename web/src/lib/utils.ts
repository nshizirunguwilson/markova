import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display name for a class: "Senior 2 A" at O-Level, "Level 4 SWD A" when the
 * section belongs to a trade.
 */
export function classDisplayName(
  section:
    | {
        name?: string | null;
        classLevel?: { name?: string | null } | null;
        trade?: { code?: string | null } | null;
      }
    | null
    | undefined,
): string {
  if (!section) return "";
  return [section.classLevel?.name, section.trade?.code, section.name]
    .filter(Boolean)
    .join(" ");
}

/**
 * A section's name within a level that has already been chosen: "A" at
 * O-Level, "SWD A" where the section belongs to a trade.
 *
 * Every A-Level level runs one section per trade, so a picker that lists the
 * bare `name` shows "A, A, A, A, B, B, B, B" and there is no way to tell the
 * software developers from the tourism students. The level itself is left out
 * because these lists always sit under a level picker; use
 * `classDisplayName` where the level is not already established.
 */
export function sectionLabel(
  section:
    | { name?: string | null; trade?: { code?: string | null } | null }
    | null
    | undefined,
): string {
  if (!section) return "";
  return [section.trade?.code, section.name].filter(Boolean).join(" ");
}

/** Format a Date to YYYY-MM-DD using local timezone (avoids UTC shift from toISOString). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
