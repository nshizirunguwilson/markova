/**
 * Uploaded files (logos, stamps, signatures, photos) are stored by the API as
 * root-relative paths like `/uploads/branding/<uuid>.png`. The API serves
 * `/uploads` *outside* its `/api` prefix, and it lives on a different origin
 * than the web app in development (:3000 vs :3001) - so a bare relative path
 * would be resolved against the web origin and 404.
 *
 * This turns such a path into an absolute URL against the API origin.
 */
export function resolveUploadUrl(url?: string | null): string | null {
  if (!url) return null;

  // Already absolute (or a data URI) - leave it alone.
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:")) return url;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  // Strip the trailing `/api` so we point at the origin that serves /uploads.
  const origin = apiBase.replace(/\/api\/?$/, "");

  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}
