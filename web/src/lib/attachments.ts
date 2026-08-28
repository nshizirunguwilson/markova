/**
 * What may be attached to a message, and what to do with it once it is there.
 *
 * The limits mirror `backend/src/common/attachment-limits.ts`, which is where
 * the reasoning behind the numbers is written down and which is what actually
 * enforces them. They are repeated here so a person is told a 60MB video is
 * too large before spending five minutes uploading it, rather than after.
 */

export type AttachmentKind = "image" | "video" | "audio" | "document";

const MB = 1024 * 1024;

/** The most a file of each kind may weigh. */
export const MAX_ATTACHMENT_BYTES: Record<AttachmentKind, number> = {
  image: 10 * MB,
  video: 50 * MB,
  audio: 16 * MB,
  document: 25 * MB,
};

/**
 * Every type the API accepts, as an `accept` attribute for the file picker.
 *
 * Worth listing rather than accepting anything at all: the picker then greys
 * out a file
 * that would be refused, which is a better place to learn it than an error
 * after the upload.
 */
export const ACCEPTED_ATTACHMENTS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
].join(",");

/** Which of the four a mime type counts as. */
export function kindOfMime(mimetype: string): AttachmentKind | null {
  const type = (mimetype || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type) return "document";
  return null;
}

const EXTENSION_KINDS: Record<string, AttachmentKind> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  ogv: "video",
  mp3: "audio",
  m4a: "audio",
  weba: "audio",
  ogg: "audio",
};

/**
 * Which of the four a stored file is, worked out from the name it is stored
 * under.
 *
 * A message carries a URL, not a mime type, and the extension on that URL was
 * chosen by the API from the verified type rather than by whoever uploaded it
 * — so it is trustworthy in a way a filename normally is not. Anything not in
 * the table is a document, which is the treatment that always works: a row
 * with a name and a download.
 */
export function kindOfUrl(fileUrl: string | null | undefined): AttachmentKind {
  const ext = (fileUrl ?? "").split("?")[0].split(".").pop()?.toLowerCase();
  return (ext && EXTENSION_KINDS[ext]) || "document";
}

/** "10 MB", "1.5 MB", "800 KB" — a size in words a person reads. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / MB;
  return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/**
 * Why this file cannot be sent, or null when it can.
 *
 * Checked before the upload starts, so somebody on a Rwandan mobile line is
 * not asked to push 60MB up before being told it was never going to fit.
 */
export function whyNotSendable(file: {
  type: string;
  size: number;
  name: string;
}): string | null {
  const kind = kindOfMime(file.type);

  if (!kind || !ACCEPTED_ATTACHMENTS.includes(file.type.toLowerCase())) {
    return `${file.name} is not a kind of file that can be sent here. Photos, videos, audio, PDFs, Word, Excel, PowerPoint and text files can.`;
  }

  if (file.size === 0) {
    return `${file.name} is empty.`;
  }

  const cap = MAX_ATTACHMENT_BYTES[kind];
  if (file.size > cap) {
    const noun = kind === "document" ? "A document" : `A ${kind}`;
    return `${noun} may be up to ${humanSize(cap)}; ${file.name} is ${humanSize(file.size)}.`;
  }

  return null;
}

/**
 * A filename short enough to sit in a bubble.
 *
 * Cut in the middle rather than at the end, because the extension is the part
 * that says what the file is: "Term 1 report…ol.pdf" beats "Term 1 repor…".
 */
export function shortFilename(name: string, max = 28): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(4, max - ext.length - 1);
  return `${stem.slice(0, keep)}…${ext}`;
}
