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
/**
 * A mime type without its parameters.
 *
 * A browser recording announces itself as `audio/webm;codecs=opus`. The
 * allow-lists below are exact, which is the point of them, so the parameters
 * have to come off before the lookup or every voice note recorded in Chrome
 * or Firefox is refused. Only the parameters are dropped; the type itself is
 * still matched exactly.
 */
export function baseMime(mimetype: string): string {
  return (mimetype || '').split(';')[0].trim().toLowerCase();
}

export function isAllowedImageMime(mimetype: string): boolean {
  return Object.hasOwn(EXTENSION_BY_MIME, baseMime(mimetype));
}

/**
 * The extension an upload of this type is stored under, or null when the type
 * is not one accepted. Never returns anything derived from the client filename.
 */
export function safeImageExtension(mimetype: string): string | null {
  return EXTENSION_BY_MIME[baseMime(mimetype)] ?? null;
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
  /*
    Video. `video/quicktime` is what an iPhone sends, and half a school is on
    iPhones; without it every clip filmed on one is refused. All four of these
    play in a browser <video> without anything installed.
  */
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/ogg': '.ogv',
};

export function isAllowedAttachmentMime(mimetype: string): boolean {
  return Object.hasOwn(ATTACHMENT_EXTENSION_BY_MIME, baseMime(mimetype));
}

/**
 * The extension an attachment of this type is stored under, or null when the
 * type is not accepted. Never derived from the client filename.
 */
export function safeAttachmentExtension(mimetype: string): string | null {
  return ATTACHMENT_EXTENSION_BY_MIME[baseMime(mimetype)] ?? null;
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
    if (!name) return cb(refusalError(file.mimetype, refusal, kind), '');
    cb(null, name);
  };
}

/**
 * Why the file was turned away, in words someone can act on.
 *
 * A plain `Error` here is not an HttpException, so Nest's multer wrapper hands
 * it straight through and the client gets a bare 500. Every refused upload
 * therefore read as "Failed to upload logo" — the same message a server outage
 * produces — when the real answer was "that is a HEIC and we take JPEG or PNG".
 */
function refusalError(
  mimetype: string,
  refusal: string,
  kind: 'image' | 'attachment' = 'image',
): BadRequestException {
  /*
    The list of what would have been accepted, named by extension rather than
    by mime type — somebody told "accepted: image/jpeg" has to translate it,
    and somebody told "JPG, PNG" does not. This used to read off the image
    table whatever was being uploaded, so a refused message attachment was
    told PDFs were unacceptable when they are the commonest thing sent.
  */
  const table =
    kind === 'image' ? EXTENSION_BY_MIME : ATTACHMENT_EXTENSION_BY_MIME;
  const accepted = Object.values(table)
    .map((ext) => ext.replace('.', '').toUpperCase())
    .filter((ext, i, all) => all.indexOf(ext) === i)
    .join(', ');
  return new BadRequestException(
    `${refusal}. Received ${mimetype || 'an unknown file type'}; accepted: ${accepted}.`,
  );
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
    if (!allowed) return cb(refusalError(file.mimetype, refusal, kind), false);
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

/**
 * What the first bytes of each accepted kind of file look like.
 *
 * The mime type on an upload is whatever the client claimed, so a file is
 * also asked what it actually is. A type absent from here is one with no
 * signature worth checking — plain text and CSV are any bytes at all.
 *
 * `at` is where the marker sits: MP4 and QuickTime carry a four-byte length
 * first and only then `ftyp`, which is why they are checked at offset 4.
 */
const ATTACHMENT_SIGNATURES: Record<string, { at: number; bytes: number[] }[]> =
  {
    'application/pdf': [{ at: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
    // The modern Office formats are zip archives; the old ones are OLE2.
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
      { at: 0, bytes: [0x50, 0x4b] },
    ],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
      { at: 0, bytes: [0x50, 0x4b] },
    ],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      [{ at: 0, bytes: [0x50, 0x4b] }],
    'application/msword': [{ at: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
    'application/vnd.ms-excel': [{ at: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }],
    'application/vnd.ms-powerpoint': [
      { at: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] },
    ],
    // MP3 is either an ID3 tag or a bare frame header.
    'audio/mpeg': [
      { at: 0, bytes: [0x49, 0x44, 0x33] },
      { at: 0, bytes: [0xff, 0xfb] },
      { at: 0, bytes: [0xff, 0xf3] },
      { at: 0, bytes: [0xff, 0xf2] },
    ],
    'audio/mp4': [{ at: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // ....ftyp
    'audio/ogg': [{ at: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }], // OggS
    'video/ogg': [{ at: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }],
    // WebM is a Matroska container, and so is the audio the browser records.
    'audio/webm': [{ at: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
    'video/webm': [{ at: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
    'video/mp4': [{ at: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
    'video/quicktime': [{ at: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
  };

/**
 * Do these bytes look like the type they claim to be?
 *
 * True for a type we have no signature for — text really is any bytes, and
 * refusing a valid .txt because it does not start with a magic number would
 * be worse than the check is worth.
 */
export function attachmentMatchesType(
  buffer: Buffer,
  mimetype: string,
): boolean {
  const type = baseMime(mimetype);

  // Images already have their own signature table; reuse it rather than
  // keeping two lists of the same four formats.
  if (isAllowedImageMime(type)) return validateImageMagicBytes(buffer);

  const signatures = ATTACHMENT_SIGNATURES[type];
  if (!signatures) return true;

  return signatures.some((sig) =>
    sig.bytes.every(
      (byte, i) => buffer.length > sig.at + i && buffer[sig.at + i] === byte,
    ),
  );
}

/**
 * Checks an uploaded attachment against the type it claimed, and removes it
 * when the two disagree.
 *
 * The same reasoning as for images: the client's declared type decides the
 * extension the file is stored under, and `/uploads` is served by extension,
 * so a file that lied about its type would come back from the API's own
 * origin as whatever it really was.
 */
export function validateUploadedAttachment(
  filePath: string,
  mimetype: string,
): void {
  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    throw new BadRequestException('Failed to validate uploaded file');
  }

  if (!attachmentMatchesType(buffer, mimetype)) {
    try {
      unlinkSync(filePath);
    } catch {
      // Already gone, or unreadable. The refusal below still stands.
    }
    throw new BadRequestException(
      'Invalid file: the contents do not match the file type it was sent as',
    );
  }
}
