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
