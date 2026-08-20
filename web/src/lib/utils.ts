import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolve an uploaded-file path against the API origin.
 *
 * The backend stores uploads as root-relative paths (`/uploads/photos/x.png`)
 * and serves them from its own origin, outside the `/api` prefix. The web app
 * runs on a different port, so rendering those paths as-is asks the Next.js
 * server for a file it does not have. Everything that displays a stored image
 * — avatars, the school logo, stamps, signatures — must go through here.
 *
 * Absolute URLs and data URIs are returned untouched.
 */
export function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;

  const api = process.env.NEXT_PUBLIC_API_URL || "";
  // NEXT_PUBLIC_API_URL points at `<origin>/api`; uploads sit next to it.
  const origin = api.replace(/\/api\/?$/, "");
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Format a Date to YYYY-MM-DD using local timezone (avoids UTC shift from toISOString). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
