import { readFileSync, unlinkSync } from 'fs';
import { BadRequestException } from '@nestjs/common';

const IMAGE_SIGNATURES: { ext: string; bytes: number[] }[] = [
  { ext: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

/**
 * The only image types accepted, and the extension each one is stored under.
 *
 * The stored extension is taken from here rather than from the uploaded
 * filename. `extname(file.originalname)` is attacker controlled, and the magic
 * byte check below only inspects the first few bytes, so a file beginning
 * `GIF89a` and continuing into `<script>` passed validation and was saved as
 * `<uuid>.html`. Express serves `/uploads` by extension, so that file came back
 * as text/html and ran on the API's own origin.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/** True when this is a mime type uploads are allowed to use at all. */
export function isAllowedImageMime(mimetype: string): boolean {
  return Object.hasOwn(EXTENSION_BY_MIME, mimetype.toLowerCase());
}

/**
 * The extension an upload of this type is stored under, or null when the type
 * is not one accepted. Never returns anything derived from the client filename.
 */
export function safeImageExtension(mimetype: string): string | null {
  return EXTENSION_BY_MIME[mimetype.toLowerCase()] ?? null;
}

export function validateImageMagicBytes(buffer: Buffer): boolean {
  return IMAGE_SIGNATURES.some((sig) =>
    sig.bytes.every((byte, i) => buffer.length > i && buffer[i] === byte),
  );
}

/**
 * Validates that the uploaded file has valid image magic bytes.
 * If invalid, deletes the file and throws BadRequestException.
 */
export function validateUploadedImage(filePath: string): void {
  try {
    const buffer = readFileSync(filePath);
    if (!validateImageMagicBytes(buffer)) {
      unlinkSync(filePath);
      throw new BadRequestException(
        'Invalid file: file content does not match a supported image format',
      );
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Failed to validate uploaded file');
  }
}

/**
 * What may be attached to a message.
 *
 * A teacher sending a marking scheme needs more than images, but the list is
 * still an exact allow-list rather than a suffix match, and the stored
 * extension still comes from here rather than from the uploaded filename. Both
 * for the reason above: Express serves `/uploads` by extension, so anything we
 * let through the name comes back with whatever content type that implies.
 *
 * Deliberately absent: `.svg` (executes script when opened), `.html`, and
 * anything executable.
 */
const ATTACHMENT_EXTENSION_BY_MIME: Record<string, string> = {
  ...EXTENSION_BY_MIME,
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/webm': '.weba',
  'audio/ogg': '.ogg',
};

export function isAllowedAttachmentMime(mimetype: string): boolean {
  return Object.hasOwn(ATTACHMENT_EXTENSION_BY_MIME, mimetype.toLowerCase());
}

/**
 * The extension an attachment of this type is stored under, or null when the
 * type is not accepted. Never derived from the client filename.
 */
export function safeAttachmentExtension(mimetype: string): string | null {
  return ATTACHMENT_EXTENSION_BY_MIME[mimetype.toLowerCase()] ?? null;
}

/**
 * The name an upload is stored under.
 *
 * A uuid plus an extension derived from the mime type, never from the name the
 * file arrived with. Written once and shared, because the same six lines were
 * pasted into three controllers and a single one of them drifting is all it
 * would take to serve an uploaded `.html` back from the API's own origin.
 *
 * `kind` decides which allow-list applies: an avatar is an image, a message
 * attachment may also be a document.
 */
export function storedFilename(
  mimetype: string,
  kind: 'image' | 'attachment',
  newId: () => string,
): string | null {
  const ext =
    kind === 'image'
      ? safeImageExtension(mimetype)
      : safeAttachmentExtension(mimetype);
  return ext ? `${newId()}${ext}` : null;
}

/**
 * The multer `filename` callback for a given kind of upload.
 *
 * Refuses rather than guessing when the type is not one we accept, so a
 * rejected file never reaches disk under a name of its own choosing.
 */
export function filenameFor(
  kind: 'image' | 'attachment',
  newId: () => string,
  refusal: string,
) {
  return (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, filename: string) => void,
  ) => {
    const name = storedFilename(file.mimetype, kind, newId);
    if (!name) return cb(new Error(refusal), '');
    cb(null, name);
  };
}

/**
 * The multer `fileFilter` for a given kind of upload.
 *
 * An exact list, not a suffix match: `application/png` is not an image and
 * `x-application/pdf` is not a PDF.
 */
export function fileFilterFor(kind: 'image' | 'attachment', refusal: string) {
  return (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    const allowed =
      kind === 'image'
        ? isAllowedImageMime(file.mimetype)
        : isAllowedAttachmentMime(file.mimetype);
    if (!allowed) return cb(new Error(refusal), false);
    cb(null, true);
  };
}

/**
 * Removes a file the record no longer points at.
 *
 * Best effort on purpose: a logo that was replaced should not sit on disk
 * forever, but a missing or unreadable old file must never stop the new one
 * being saved.
 */
export function removeStoredFile(
  fileUrl: string | null | undefined,
  fs: { existsSync: (p: string) => boolean; unlinkSync: (p: string) => void },
  resolve: (p: string) => string,
): boolean {
  if (!fileUrl) return false;
  try {
    const path = resolve(fileUrl);
    if (!fs.existsSync(path)) return false;
    fs.unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}
