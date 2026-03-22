import { readFileSync, unlinkSync } from 'fs';
import { BadRequestException } from '@nestjs/common';

const IMAGE_SIGNATURES: { ext: string; bytes: number[] }[] = [
  { ext: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

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
