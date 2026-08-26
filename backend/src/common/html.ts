import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';

/**
 * Turning values into HTML safely.
 *
 * Everything a school types — its own name, a student's name, a discipline
 * note — ends up inside a report card that is rendered to a page and then to a
 * PDF. A page is a program, so none of it can go in raw.
 */

/** The five characters that would otherwise change the shape of the markup. */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A colour, or the house colour.
 *
 * This value is interpolated straight into a stylesheet, where something like
 * `red;} body { display:none }` would rewrite the whole sheet. Anything that
 * is not a hex code or a plain colour word is refused rather than cleaned.
 */
export function sanitizeColor(
  color: string | null | undefined,
  fallback = '#1B4F72',
): string {
  if (!color) return fallback;
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(color) ? color : fallback;
}

/**
 * A school's logo, inlined so the PDF renderer needs no network.
 *
 * Falls back to Markova's own mark when the school has not uploaded one, or
 * points at a file that is no longer on disk.
 */
export function logoDataUri(
  logoUrl?: string | null,
  opts: {
    uploadDir?: string;
    /**
     * What to inline when the school has uploaded nothing. Markova's own mark
     * for the crest, but `null` for anything that is not a crest: a school
     * with no stamp and no signature had the house logo printed in both
     * places, so every letter went out signed by a logo.
     */
    fallback?: string | null;
    exists?: (p: string) => boolean;
    read?: (p: string) => Buffer;
  } = {},
): string | null {
  const exists = opts.exists ?? existsSync;
  const read = opts.read ?? readFileSync;
  const uploadDir =
    opts.uploadDir ?? join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  const fallback =
    opts.fallback === undefined
      ? join(process.cwd(), 'assets', 'logo-horizontal.png')
      : opts.fallback;

  const candidates: string[] = [];
  // A remote logo is left to the page: inlining it would mean a network fetch
  // inside the PDF renderer, which is the slowest and least reliable moment
  // to discover a host is down.
  if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
    candidates.push(join(uploadDir, logoUrl.replace(/^\/?uploads\//, '')));
  }
  if (fallback) candidates.push(fallback);

  for (const file of candidates) {
    try {
      if (!exists(file)) continue;
      const ext = extname(file).toLowerCase();
      const mime =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.svg'
            ? 'image/svg+xml'
            : 'image/png';
      return `data:${mime};base64,${read(file).toString('base64')}`;
    } catch {
      // Unreadable file: try the next candidate rather than failing the report.
    }
  }
  return null;
}
