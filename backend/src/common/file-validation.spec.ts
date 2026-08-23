import {
  isAllowedAttachmentMime,
  isAllowedImageMime,
  safeAttachmentExtension,
  safeImageExtension,
  validateImageMagicBytes,
} from './file-validation';

describe('file validation', () => {
  describe('validateImageMagicBytes()', () => {
    it.each([
      ['jpeg', [0xff, 0xd8, 0xff]],
      ['png', [0x89, 0x50, 0x4e, 0x47]],
      ['gif', [0x47, 0x49, 0x46, 0x38]],
      ['webp', [0x52, 0x49, 0x46, 0x46]],
    ])('accepts a %s header', (_name, bytes) => {
      expect(validateImageMagicBytes(Buffer.from(bytes))).toBe(true);
    });

    it('rejects a file with no image header', () => {
      expect(validateImageMagicBytes(Buffer.from('<html></html>'))).toBe(false);
    });
  });

  describe('safeImageExtension()', () => {
    it.each([
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/gif', '.gif'],
      ['image/webp', '.webp'],
    ])('stores %s as %s', (mime, ext) => {
      expect(safeImageExtension(mime)).toBe(ext);
    });

    it('is case insensitive about the mime type', () => {
      expect(safeImageExtension('IMAGE/PNG')).toBe('.png');
    });

    it.each(['text/html', 'image/svg+xml', 'application/png', ''])(
      'refuses %s',
      (mime) => {
        expect(safeImageExtension(mime)).toBeNull();
      },
    );
  });

  describe('isAllowedImageMime()', () => {
    it('accepts the supported image types', () => {
      expect(isAllowedImageMime('image/webp')).toBe(true);
    });

    // The old check was a suffix regex, so anything ending in the right word
    // slipped through.
    it('refuses a type that merely ends in an image word', () => {
      expect(isAllowedImageMime('application/png')).toBe(false);
    });

    it('refuses svg, which is a script carrier', () => {
      expect(isAllowedImageMime('image/svg+xml')).toBe(false);
    });
  });

  // The attack the extension whitelist exists for: a real GIF header followed
  // by markup, uploaded as `avatar.html`. The magic byte check passes, because
  // it only reads the first bytes. Before, the file was stored under the
  // client's own extension and served back as text/html from the API origin.
  describe('the GIF and HTML polyglot', () => {
    const polyglot = Buffer.concat([
      Buffer.from('GIF89a'),
      Buffer.from('<script>alert(document.domain)</script>'),
    ]);

    it('still passes the magic byte check, as it always did', () => {
      expect(validateImageMagicBytes(polyglot)).toBe(true);
    });

    it('cannot pick its own stored extension', () => {
      // Whatever the file is called, the stored name comes from the mime type.
      expect(safeImageExtension('image/gif')).toBe('.gif');
      expect(safeImageExtension('text/html')).toBeNull();
    });
  });

  /**
   * Message attachments are wider than avatars: a teacher sending a marking
   * scheme needs a PDF. The list stays an exact allow-list for the same reason
   * the image one is, because Express serves /uploads by extension.
   */
  describe('message attachments', () => {
    it.each([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'audio/mpeg',
    ])('accepts %s', (mime) => {
      expect(isAllowedAttachmentMime(mime)).toBe(true);
      expect(safeAttachmentExtension(mime)).toMatch(/^\./);
    });

    it('still accepts the image types avatars use', () => {
      expect(isAllowedAttachmentMime('image/png')).toBe(true);
      expect(safeAttachmentExtension('image/png')).toBe('.png');
    });

    // An SVG runs script the moment somebody opens it from the same origin,
    // which is exactly what an attachment invites a person to do.
    it('refuses SVG', () => {
      expect(isAllowedAttachmentMime('image/svg+xml')).toBe(false);
      expect(safeAttachmentExtension('image/svg+xml')).toBeNull();
    });

    it.each(['text/html', 'application/x-sh', 'application/x-msdownload'])(
      'refuses %s',
      (mime) => {
        expect(isAllowedAttachmentMime(mime)).toBe(false);
      },
    );

    it('is not fooled by a suffix that merely ends in an allowed word', () => {
      expect(isAllowedAttachmentMime('application/png')).toBe(false);
      expect(isAllowedAttachmentMime('x-application/pdf')).toBe(false);
    });

    it('matches regardless of case', () => {
      expect(isAllowedAttachmentMime('APPLICATION/PDF')).toBe(true);
      expect(safeAttachmentExtension('Application/Pdf')).toBe('.pdf');
    });
  });
});