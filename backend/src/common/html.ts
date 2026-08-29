import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';

/**
 * Turning values into HTML safely.
 *
 * Everything a school types - its own name, a student's name, a discipline
 * note - ends up inside a report card that is rendered to a page and then to a
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

/**
 * How faint the watermark is printed.
 *
 * Six per cent. The mark sits at 90% of the page width directly behind body
 * text, so this number is the whole difference between stationery and an
 * unreadable report card. At twelve the navy comes out around 3:1 against the
 * black text over it, which is under the line for body copy; at three it has
 * all but vanished by the time a page comes off a school printer.
 *
 * Nothing in the build will catch a regression here. The accessibility audit
 * reads web pages and never opens a PDF, so this constant is the only thing
 * standing between a school and a document nobody can read.
 */
export const WATERMARK_OPACITY = 0.06;

/** How much of the page width the mark spans. */
export const WATERMARK_WIDTH = '90%';

/**
 * The school's stamp, printed across the middle of every document it issues.
 *
 * Returns the markup and the stylesheet for it, or empty strings when the
 * school has uploaded no stamp. There is no house fallback on purpose: a
 * school with no stamp of its own would otherwise have Markova's mark printed
 * across its report cards, which is the same mistake the letterhead already
 * refuses to make with the signature.
 *
 * Two details carry the whole thing:
 *
 *   `position: fixed` rather than absolute, because Chrome repeats a fixed
 *   element on every printed page and a transcript runs to three or four. An
 *   absolutely positioned mark appears on page one and nowhere else.
 *
 *   `filter: grayscale(1)` because a navy mark at any opacity tints the text
 *   over it towards blue. Grey takes contrast away evenly instead, which is
 *   what a watermark is supposed to do.
 *
 * It is hidden on screen and shown only in print, which is the same rule the
 * verification QR follows and for the same reason: a watermark is a property
 * of the issued document, not of the preview somebody reads it in. Chrome
 * renders a PDF through its print stylesheet, so print covers the download
 * too, and the reader looking at a card in the browser gets a clean sheet.
 */
export function watermark(
  stampUrl?: string | null,
  opts: {
    uploadDir?: string;
    exists?: (p: string) => boolean;
    read?: (p: string) => Buffer;
  } = {},
): { css: string; html: string } {
  const stamp = logoDataUri(stampUrl, { ...opts, fallback: null });
  if (!stamp) return { css: '', html: '' };

  return {
    css: `
      .watermark{
        /* On paper only. Shown in print and in the generated PDF, hidden in
           an on-screen preview, exactly as the verification strip is. */
        display:none;
        position:fixed; top:50%; left:50%;
        width:${WATERMARK_WIDTH}; transform:translate(-50%,-50%);
        opacity:${WATERMARK_OPACITY}; filter:grayscale(1);
        z-index:0; pointer-events:none;
        /* Chrome drops backgrounds and low-opacity art from a print unless
           told otherwise, and the PDF renderer is a print. */
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .watermark img{ width:100%; display:block; }
      @media print{ .watermark{ display:block; } }
      /* Everything the reader came for sits above it. */
      .sheet, .page{ position:relative; z-index:1; }
    `,
    html: `<div class="watermark" aria-hidden="true"><img src="${stamp}" alt="" /></div>`,
  };
}
