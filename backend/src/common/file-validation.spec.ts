import {
  fileFilterFor,
  filenameFor,
  isAllowedAttachmentMime,
  isAllowedImageMime,
  removeStoredFile,
  safeAttachmentExtension,
  safeImageExtension,
  storedFilename,
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

  /**
   * The name an upload lands on disk under.
   *
   * Written once and shared by the avatar, branding and attachment routes,
   * because the same six lines were pasted into three controllers and one of
   * them drifting is all it would take to serve an uploaded page back from the
   * API's own origin.
   */
  describe('the stored filename', () => {
    const id = () => 'a1b2c3';

    it('is a uuid with the extension the type implies', () => {
      expect(storedFilename('image/png', 'image', id)).toBe('a1b2c3.png');
      expect(storedFilename('application/pdf', 'attachment', id)).toBe(
        'a1b2c3.pdf',
      );
    });

    it('refuses a type the kind does not accept', () => {
      expect(storedFilename('image/svg+xml', 'image', id)).toBeNull();
      expect(storedFilename('text/html', 'attachment', id)).toBeNull();
    });

    // An avatar is an image. A PDF is a perfectly good attachment and a
    // perfectly bad profile photo.
    it('holds an avatar to images even though attachments allow more', () => {
      expect(storedFilename('application/pdf', 'image', id)).toBeNull();
      expect(storedFilename('application/pdf', 'attachment', id)).toBe(
        'a1b2c3.pdf',
      );
    });

    it('never takes the extension from the name the file arrived with', () => {
      // The caller does not even pass the original name, which is the point.
      expect(storedFilename('image/gif', 'image', id)).toBe('a1b2c3.gif');
    });
  });

  describe('the multer filename callback', () => {
    const id = () => 'a1b2c3';

    it('hands back the safe name', () => {
      const cb = jest.fn();
      filenameFor('image', id, 'no')(null, { mimetype: 'image/png' }, cb);
      expect(cb).toHaveBeenCalledWith(null, 'a1b2c3.png');
    });

    // A refused file must never reach disk under a name of its own choosing.
    it('refuses with an error and no name at all', () => {
      const cb = jest.fn();
      filenameFor('image', id, 'Only image files are allowed')(
        null,
        { mimetype: 'text/html' },
        cb,
      );
      expect(cb).toHaveBeenCalledWith(expect.any(Error), '');
      expect(cb.mock.calls[0][0].message).toBe('Only image files are allowed');
    });
  });

  describe('the multer file filter', () => {
    it('accepts what the kind allows', () => {
      const cb = jest.fn();
      fileFilterFor('attachment', 'no')(null, { mimetype: 'application/pdf' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('refuses what it does not, by the message given', () => {
      const cb = jest.fn();
      fileFilterFor('attachment', 'That kind of file cannot be sent')(
        null,
        { mimetype: 'image/svg+xml' },
        cb,
      );
      expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
      expect(cb.mock.calls[0][0].message).toBe(
        'That kind of file cannot be sent',
      );
    });

    it('is not fooled by a type that merely ends in an allowed word', () => {
      const cb = jest.fn();
      fileFilterFor('image', 'no')(null, { mimetype: 'application/png' }, cb);
      expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
    });
  });

  /**
   * Best effort on purpose: a replaced logo should not sit on disk forever,
   * but a missing old file must never stop the new one being saved.
   */
  describe('removing a file the record no longer points at', () => {
    const resolve = (p: string) => `/root${p}`;

    it('removes the file when it is there', () => {
      const fs = { existsSync: () => true, unlinkSync: jest.fn() };
      expect(removeStoredFile('/uploads/a.png', fs, resolve)).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/root/uploads/a.png');
    });

    it('does nothing when there was never a file', () => {
      const fs = { existsSync: () => true, unlinkSync: jest.fn() };
      expect(removeStoredFile(null, fs, resolve)).toBe(false);
      expect(removeStoredFile(undefined, fs, resolve)).toBe(false);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('does nothing when the file has already gone', () => {
      const fs = { existsSync: () => false, unlinkSync: jest.fn() };
      expect(removeStoredFile('/uploads/a.png', fs, resolve)).toBe(false);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    // A read-only volume or a permissions problem is untidy. Failing the
    // upload over it would be worse.
    it('swallows a failure rather than failing the upload', () => {
      const fs = {
        existsSync: () => true,
        unlinkSync: () => {
          throw new Error('EACCES');
        },
      };
      expect(removeStoredFile('/uploads/a.png', fs, resolve)).toBe(false);
    });
  });
});