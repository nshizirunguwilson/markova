import { BadRequestException } from '@nestjs/common';
import {
  attachmentMatchesType,
  retireStoredFile,
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
      expect(cb.mock.calls[0][0].message).toContain(
        'Only image files are allowed',
      );
    });

    /**
     * A plain Error is not an HttpException, so Nest's multer wrapper hands it
     * through untouched and the client sees a bare 500 - indistinguishable
     * from the server being down. Every refused logo read as "Failed to
     * upload"; it has to say what was wrong with the file.
     */
    it('refuses with a 400 naming the type sent and the ones taken', () => {
      const cb = jest.fn();
      filenameFor('image', id, 'Only image files are allowed')(
        null,
        { mimetype: 'image/heic' },
        cb,
      );
      const error = cb.mock.calls[0][0];
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('image/heic');
      expect(error.message).toContain('PNG');
    });
  });

  describe('the multer file filter', () => {
    it('accepts what the kind allows', () => {
      const cb = jest.fn();
      fileFilterFor('attachment', 'no')(
        null,
        { mimetype: 'application/pdf' },
        cb,
      );
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
      const error = cb.mock.calls[0][0];
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('That kind of file cannot be sent');
      expect(error.message).toContain('image/svg+xml');
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

  /**
   * The mime type on an upload is whatever the client claimed. A file is also
   * asked what it actually is, because the declared type decides the
   * extension it is stored under and /uploads is served by extension.
   */
  describe('checking an attachment is what it says it is', () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const mp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    ]);
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02]);
    const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

    it('accepts a real PDF', () => {
      expect(attachmentMatchesType(pdf, 'application/pdf')).toBe(true);
    });

    it('accepts a real MP4, whose marker sits four bytes in', () => {
      expect(attachmentMatchesType(mp4, 'video/mp4')).toBe(true);
      expect(attachmentMatchesType(mp4, 'video/quicktime')).toBe(true);
    });

    it('accepts WebM, which is what the browser records', () => {
      expect(attachmentMatchesType(webm, 'video/webm')).toBe(true);
      expect(attachmentMatchesType(webm, 'audio/webm')).toBe(true);
    });

    it('accepts a modern Office file, which is a zip', () => {
      expect(
        attachmentMatchesType(
          docx,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBe(true);
    });

    // The whole point: a file claiming to be a video and carrying markup.
    it('refuses HTML dressed as a video', () => {
      const html = Buffer.from('<html><script>alert(1)</script>');
      expect(attachmentMatchesType(html, 'video/mp4')).toBe(false);
    });

    it('refuses a PDF that is not one', () => {
      expect(attachmentMatchesType(webm, 'application/pdf')).toBe(false);
    });

    it('still runs the image check for images', () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect(attachmentMatchesType(png, 'image/png')).toBe(true);
      expect(attachmentMatchesType(docx, 'image/png')).toBe(false);
    });

    // Text really is any bytes; refusing a valid .txt for having no magic
    // number would be worse than the check is worth.
    it('lets plain text through, having no signature to check', () => {
      expect(attachmentMatchesType(Buffer.from('Muraho'), 'text/plain')).toBe(
        true,
      );
      expect(attachmentMatchesType(Buffer.from('a,b,c'), 'text/csv')).toBe(
        true,
      );
    });

    it('refuses a file too short to carry its own marker', () => {
      expect(
        attachmentMatchesType(Buffer.from([0x25]), 'application/pdf'),
      ).toBe(false);
    });
  });

  /**
   * A teacher filming a two-minute demonstration on a phone. Half a school is
   * on iPhones, which send video/quicktime.
   */
  describe('video attachments', () => {
    it('accepts the four types a browser can play', () => {
      for (const type of [
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/ogg',
      ]) {
        expect(isAllowedAttachmentMime(type)).toBe(true);
      }
    });

    it('stores each under an extension taken from its type', () => {
      expect(safeAttachmentExtension('video/mp4')).toBe('.mp4');
      expect(safeAttachmentExtension('video/quicktime')).toBe('.mov');
    });

    it('still refuses anything that runs when opened', () => {
      expect(isAllowedAttachmentMime('image/svg+xml')).toBe(false);
      expect(isAllowedAttachmentMime('text/html')).toBe(false);
      expect(isAllowedAttachmentMime('application/x-msdownload')).toBe(false);
    });
  });

  /**
   * A browser recording announces itself as `audio/webm;codecs=opus`. The
   * lists are exact, which is the point of them, so the parameters have to
   * come off before the lookup - without this every voice note recorded in
   * Chrome or Firefox was refused.
   */
  describe('a type that arrives with its codec attached', () => {
    it('is accepted, on the type alone', () => {
      expect(isAllowedAttachmentMime('audio/webm;codecs=opus')).toBe(true);
      expect(isAllowedAttachmentMime('video/webm;codecs=vp9,opus')).toBe(true);
    });

    it('is stored under the extension for its type', () => {
      expect(safeAttachmentExtension('audio/webm;codecs=opus')).toBe('.weba');
    });

    it('is checked against its type\u2019s own signature', () => {
      const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      expect(attachmentMatchesType(webm, 'audio/webm;codecs=opus')).toBe(true);
    });

    // Only the parameters come off; the type itself is still matched exactly.
    it('does not let an unaccepted type through on its parameters', () => {
      expect(isAllowedAttachmentMime('text/html;charset=utf-8')).toBe(false);
      expect(isAllowedAttachmentMime('image/svg+xml;charset=utf-8')).toBe(
        false,
      );
    });

    it('applies to images too', () => {
      expect(isAllowedImageMime('image/png;something=1')).toBe(true);
    });
  });

  /**
   * Replacing a school's stamp used to unlink the old one on the spot. That
   * is fine right up until somebody replaces the wrong thing - at which point
   * the only copy of a mark drawn once and used for years is gone, with no
   * undo and nothing in the trash.
   */
  describe('retiring the file a replacement takes over from', () => {
    function attic() {
      const moved: [string, string][] = [];
      const made: string[] = [];
      const present = new Set(['/root/uploads/branding/old.png']);
      const fs = {
        existsSync: (p: string) => present.has(p),
        mkdirSync: (p: string) => {
          made.push(p);
        },
        renameSync: (from: string, to: string) => {
          moved.push([from, to]);
          present.delete(from);
          present.add(to);
        },
      };
      const resolve = (p: string) => `/root${p}`;
      const now = () => new Date('2026-08-28T19:41:07.000Z');
      return { fs, resolve, now, moved, made, present };
    }

    it('moves it aside instead of deleting it', () => {
      const a = attic();
      const to = retireStoredFile(
        '/uploads/branding/old.png',
        a.fs,
        a.resolve,
        a.now,
      );

      expect(a.moved).toHaveLength(1);
      expect(to).toBe(a.moved[0][1]);
      // Still on disk, just somewhere else.
      expect(a.present.has(to!)).toBe(true);
    });

    // Sortable, legal in a filename, and it says what the file was.
    it('names it by when it was retired and what it was', () => {
      const a = attic();
      const to = retireStoredFile(
        '/uploads/branding/old.png',
        a.fs,
        a.resolve,
        a.now,
      );

      expect(to).toBe('/root/uploads/replaced/2026-08-28T19-41-07-old.png');
    });

    it('makes the folder it retires into', () => {
      const a = attic();
      retireStoredFile('/uploads/branding/old.png', a.fs, a.resolve, a.now);
      expect(a.made).toContain('/root/uploads/replaced');
    });

    // Exactly like the deletion it replaces: never block the new upload.
    it('does nothing when there was no previous file', () => {
      const a = attic();
      expect(retireStoredFile(null, a.fs, a.resolve, a.now)).toBeNull();
      expect(retireStoredFile(undefined, a.fs, a.resolve, a.now)).toBeNull();
      expect(retireStoredFile('', a.fs, a.resolve, a.now)).toBeNull();
      expect(a.moved).toEqual([]);
    });

    it('does nothing when the previous file is already gone', () => {
      const a = attic();
      expect(
        retireStoredFile(
          '/uploads/branding/missing.png',
          a.fs,
          a.resolve,
          a.now,
        ),
      ).toBeNull();
      expect(a.moved).toEqual([]);
    });

    it('survives a filesystem that refuses the move', () => {
      const a = attic();
      const broken = {
        ...a.fs,
        renameSync: () => {
          throw new Error('read-only volume');
        },
      };
      expect(() =>
        retireStoredFile('/uploads/branding/old.png', broken, a.resolve, a.now),
      ).not.toThrow();
      expect(
        retireStoredFile('/uploads/branding/old.png', broken, a.resolve, a.now),
      ).toBeNull();
    });

    it('survives a folder it cannot create', () => {
      const a = attic();
      const broken = {
        ...a.fs,
        mkdirSync: () => {
          throw new Error('permission denied');
        },
      };
      expect(
        retireStoredFile('/uploads/branding/old.png', broken, a.resolve, a.now),
      ).toBeNull();
    });
  });
});
