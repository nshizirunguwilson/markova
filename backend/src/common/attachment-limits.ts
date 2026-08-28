/**
 * What may be attached to a message, how big, and what it is.
 *
 * ── Why these limits ──────────────────────────────────────────────────────
 *
 * Markova runs on the school's own machine, so every attachment is disk the
 * school pays for and bandwidth the school's line carries. The numbers below
 * are set against what the messaging apps people already use allow, adjusted
 * for that:
 *
 *   WhatsApp   photos and video 16MB, documents 2GB, voice notes unbounded
 *   Telegram   2GB of anything
 *   Slack      1GB per file, against a workspace-wide quota
 *   Gmail      25MB per message, which is the number most people have met
 *
 * A school does not need Telegram's ceiling, and a 2GB video sent to a class
 * group of forty is forty parents on mobile data. The 25MB document limit is
 * Gmail's, because it is the one people have already been trained by. Video
 * gets more room than a photograph because even a short clip filmed on a
 * phone clears 16MB, and a teacher filming a two-minute demonstration is a
 * real thing this system should allow; 50MB is roughly that clip at 720p.
 *
 * Voice notes are capped by length in the recorder rather than only by size,
 * but the cap here is the backstop: five minutes of Opus is comfortably under
 * 16MB, so anything larger did not come from our recorder.
 *
 * ── Why an allow-list ─────────────────────────────────────────────────────
 *
 * Types are matched exactly, never by suffix, and the extension a file is
 * stored under comes from its type rather than from the name it arrived with.
 * `/uploads` is served statically by extension, so anything permitted to name
 * itself comes back with whatever content type that name implies. Absent on
 * purpose: SVG (runs script when opened), HTML, and anything executable.
 */

export type AttachmentKind = 'image' | 'video' | 'audio' | 'document';

const MB = 1024 * 1024;

/** The most a file of each kind may weigh. */
export const MAX_ATTACHMENT_BYTES: Record<AttachmentKind, number> = {
  image: 10 * MB,
  video: 50 * MB,
  audio: 16 * MB,
  document: 25 * MB,
};

/** The largest anything may be, which is what multer is given. */
export const MAX_ANY_ATTACHMENT_BYTES = Math.max(
  ...Object.values(MAX_ATTACHMENT_BYTES),
);

/** Which of the four a mime type counts as, or null when it is not accepted. */
export function attachmentKind(mimetype: string): AttachmentKind | null {
  const type = (mimetype || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type) return 'document';
  return null;
}

/** The cap that applies to a file of this type. */
export function maxBytesFor(mimetype: string): number {
  const kind = attachmentKind(mimetype);
  return kind ? MAX_ATTACHMENT_BYTES[kind] : MAX_ATTACHMENT_BYTES.document;
}

/** "10 MB", "1.5 MB", "800 KB" — a size in words a person reads. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / MB;
  // 10 MB rather than 10.0 MB, but 1.5 MB rather than 2 MB.
  return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/**
 * Why a file was turned away for its size, in words somebody can act on.
 * "Too large" leaves a person guessing; this says what the ceiling is.
 */
export function tooLargeMessage(mimetype: string, size: number): string {
  const kind = attachmentKind(mimetype) ?? 'document';
  const noun = kind === 'document' ? 'A document' : `A ${kind}`;
  return `${noun} may be up to ${humanSize(MAX_ATTACHMENT_BYTES[kind])}; this one is ${humanSize(size)}.`;
}
