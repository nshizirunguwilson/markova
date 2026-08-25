import { BadRequestException } from '@nestjs/common';

const readFileSync = jest.fn();
const unlinkSync = jest.fn();
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: (...args: unknown[]) => readFileSync(...args),
    unlinkSync: (...args: unknown[]) => unlinkSync(...args),
  };
});

import { validateUploadedImage } from './file-validation';

/**
 * Checking an upload after multer has already written it to disk.
 *
 * The browser's declared mime type is whatever the uploader says it is, so a
 * school crest is checked by its first few bytes instead. A file that is not
 * an image is deleted rather than left sitting in the uploads folder where the
 * static handler would serve it.
 */
describe('an uploaded school image', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a real PNG and leaves it where it is', () => {
    readFileSync.mockReturnValue(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    expect(() =>
      validateUploadedImage('/uploads/branding/logo.png'),
    ).not.toThrow();
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  // A .png that is really an HTML page would be served back as one.
  it('deletes anything that is not an image, and says so', () => {
    readFileSync.mockReturnValue(Buffer.from('<html><script>alert(1)'));

    expect(() => validateUploadedImage('/uploads/branding/logo.png')).toThrow(
      BadRequestException,
    );
    expect(unlinkSync).toHaveBeenCalledWith('/uploads/branding/logo.png');
  });

  it('says which way it was rejected', () => {
    readFileSync.mockReturnValue(Buffer.from('not an image at all'));

    expect(() => validateUploadedImage('/uploads/branding/logo.png')).toThrow(
      /does not match a supported image format/,
    );
  });

  // A file multer wrote and something else removed before this ran.
  it('refuses a file it cannot read at all', () => {
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() => validateUploadedImage('/uploads/branding/gone.png')).toThrow(
      /Failed to validate uploaded file/,
    );
  });

  it('does not try to delete a file it could not read', () => {
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() =>
      validateUploadedImage('/uploads/branding/gone.png'),
    ).toThrow();
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});
