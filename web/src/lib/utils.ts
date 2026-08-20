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

/** Format a Date to YYYY-MM-DD using local timezone (avoids UTC shift from toISOString). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
