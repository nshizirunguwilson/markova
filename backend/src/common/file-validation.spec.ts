import {
  isAllowedImageMime,
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
});
