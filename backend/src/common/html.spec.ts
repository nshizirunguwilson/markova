import {
  WATERMARK_OPACITY,
  escapeHtml,
  logoDataUri,
  sanitizeColor,
  watermark,
} from './html';

/**
 * Turning a school's own data into a page.
 *
 * Everything here is text a person typed into a form, on its way into a report
 * card that is rendered as HTML and then printed to PDF. A page is a program,
 * so none of it can go in raw.
 */
describe('escapeHtml', () => {
  it('neutralises a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  // The ampersand has to go first, or escaping `<` produces `&lt;` and the
  // second pass turns it into `&amp;lt;`.
  it('escapes the ampersand before the rest, not after', () => {
    expect(escapeHtml('<a & b>')).toBe('&lt;a &amp; b&gt;');
  });

  // A quote closes an attribute, which is a way in that needs no angle
  // brackets at all.
  it('escapes a quote that would break out of an attribute', () => {
    expect(escapeHtml('" onload="alert(1)')).toBe(
      '&quot; onload=&quot;alert(1)',
    );
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Divine Niyonkuru')).toBe('Divine Niyonkuru');
  });

  it('leaves accented and Kinyarwanda text alone', () => {
    expect(escapeHtml('Nshimiyimana Uwase')).toBe('Nshimiyimana Uwase');
  });

  it.each([null, undefined, ''])('gives an empty string for %s', (input) => {
    expect(escapeHtml(input)).toBe('');
  });
});

/**
 * A colour goes straight into a stylesheet. `red;} body { display:none }`
 * would rewrite the whole sheet, so anything that is not a colour is refused
 * rather than cleaned up.
 */
describe('sanitizeColor', () => {
  it.each(['#1B4F72', '#fff', '#FFAA00CC', 'rebeccapurple', 'navy'])(
    'accepts %s',
    (color) => {
      expect(sanitizeColor(color)).toBe(color);
    },
  );

  it.each([
    'red;}body{display:none}',
    '#fff;}html{}',
    'url(javascript:alert(1))',
    'rgb(1,2,3)',
    '#12',
    '../../etc',
    '<script>',
  ])('refuses %s and falls back', (color) => {
    expect(sanitizeColor(color)).toBe('#1B4F72');
  });

  it.each([null, undefined, ''])('falls back for %s', (color) => {
    expect(sanitizeColor(color)).toBe('#1B4F72');
  });

  it('falls back to whatever the caller nominated', () => {
    expect(sanitizeColor('red;}body{}', '#000000')).toBe('#000000');
  });

  /**
   * Any single word passes, because that is what a CSS colour keyword is.
   * A word that is not a real keyword simply does not render; it cannot
   * escape the declaration, which is the only thing this guards against.
   */
  it('lets an unrecognised single word through, since it cannot escape', () => {
    expect(sanitizeColor('notacolour')).toBe('notacolour');
  });
});

/**
 * The PDF is produced with `setContent()`, which has no base URL, so a stored
 * path like `/uploads/branding/x.png` can never be fetched by Chrome. It has
 * to be embedded.
 */
describe('logoDataUri', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const opts = (exists: string[], read = () => png) => ({
    uploadDir: '/app/uploads',
    fallback: '/app/assets/logo-horizontal.png',
    exists: (p: string) => exists.includes(p),
    read,
  });

  it('inlines the school’s own uploaded logo', () => {
    const uri = logoDataUri(
      '/uploads/branding/school.png',
      opts(['/app/uploads/branding/school.png']),
    );
    expect(uri).toBe(`data:image/png;base64,${png.toString('base64')}`);
  });

  it('copes with a path stored without the leading slash', () => {
    const uri = logoDataUri(
      'uploads/branding/school.png',
      opts(['/app/uploads/branding/school.png']),
    );
    expect(uri).toMatch(/^data:image\/png/);
  });

  it.each([
    ['school.jpg', 'image/jpeg'],
    ['school.jpeg', 'image/jpeg'],
    ['school.svg', 'image/svg+xml'],
    ['school.png', 'image/png'],
    ['school.webp', 'image/png'],
  ])('types %s as %s', (file, mime) => {
    const uri = logoDataUri(
      `/uploads/branding/${file}`,
      opts([`/app/uploads/branding/${file}`]),
    );
    expect(uri).toContain(`data:${mime};base64,`);
  });

  // A remote logo would mean a network fetch inside the PDF renderer, which
  // is the worst possible moment to discover a host is down.
  it('does not try to fetch a remote logo', () => {
    const exists = jest.fn().mockReturnValue(false);
    logoDataUri('https://cdn.example.com/logo.png', {
      uploadDir: '/app/uploads',
      fallback: '/app/assets/logo-horizontal.png',
      exists,
      read: () => png,
    });
    for (const [path] of exists.mock.calls) {
      expect(path).not.toContain('cdn.example.com');
    }
  });

  it('falls back to the house mark when the school uploaded none', () => {
    const uri = logoDataUri(null, opts(['/app/assets/logo-horizontal.png']));
    expect(uri).toMatch(/^data:image\/png/);
  });

  // A logo row pointing at a file somebody deleted must not produce a report
  // card with a broken image on it.
  it('falls back when the stored file is no longer on disk', () => {
    const uri = logoDataUri(
      '/uploads/branding/gone.png',
      opts(['/app/assets/logo-horizontal.png']),
    );
    expect(uri).toMatch(/^data:image\/png/);
  });

  it('falls back when the stored file cannot be read', () => {
    let call = 0;
    const uri = logoDataUri('/uploads/branding/locked.png', {
      uploadDir: '/app/uploads',
      fallback: '/app/assets/logo-horizontal.png',
      exists: () => true,
      read: () => {
        call += 1;
        if (call === 1) throw new Error('EACCES');
        return png;
      },
    });
    expect(uri).toMatch(/^data:image\/png/);
  });

  it('gives nothing at all rather than a broken image', () => {
    expect(logoDataUri(null, opts([]))).toBeNull();
  });
});

/**
 * The stamp printed across every document the school issues.
 *
 * The opacity is the whole thing. Nothing in the build catches a regression
 * here, because the accessibility audit reads web pages and never opens a
 * PDF, so these cases are the only guard on a document staying readable.
 */
describe('the document watermark', () => {
  const stamped = (url = '/uploads/branding/stamp.png') =>
    watermark(url, { exists: () => true, read: () => Buffer.from('x') });

  it('prints the stamp the school uploaded', () => {
    expect(stamped().html).toContain('data:image/png;base64,');
  });

  it('spans 90% of the page width, centred both ways', () => {
    const { css } = stamped();
    expect(css).toContain('width:90%');
    expect(css).toContain('top:50%');
    expect(css).toContain('left:50%');
    expect(css).toContain('translate(-50%,-50%)');
  });

  it('prints at six per cent', () => {
    expect(stamped().css).toContain(`opacity:${WATERMARK_OPACITY}`);
    expect(WATERMARK_OPACITY).toBe(0.06);
  });

  /*
    A navy mark at any opacity tints the text over it towards blue. Grey takes
    contrast away evenly, which is what a watermark is for.
  */
  it('prints grey rather than in the school colour', () => {
    expect(stamped().css).toContain('grayscale(1)');
  });

  /**
   * Chrome repeats a fixed element on every printed page. An absolutely
   * positioned mark appears on page one and nowhere else, and a transcript
   * runs to three or four.
   */
  it('is fixed, so it repeats on every page of a long document', () => {
    expect(stamped().css).toContain('position:fixed');
    expect(stamped().css).not.toContain('position:absolute');
  });

  // Chrome drops low-opacity art from a print unless told otherwise, and the
  // PDF renderer is a print.
  it('asks the renderer to keep it', () => {
    expect(stamped().css).toContain('print-color-adjust:exact');
  });

  it('sits behind the content rather than over it', () => {
    const { css } = stamped();
    expect(css).toContain('z-index:0');
    expect(css).toContain('.sheet, .page{ position:relative; z-index:1; }');
  });

  it('is hidden from anything reading the document aloud', () => {
    expect(stamped().html).toContain('aria-hidden="true"');
  });

  /**
   * No house fallback, deliberately. A school with no stamp of its own would
   * otherwise have Markova's mark printed across its report cards, which is
   * the mistake the letterhead already refuses to make with the signature.
   */
  it('draws nothing at all when the school has uploaded no stamp', () => {
    expect(watermark(null)).toEqual({ css: '', html: '' });
    expect(watermark(undefined)).toEqual({ css: '', html: '' });
  });

  it('draws nothing when the stamp is recorded but gone from disk', () => {
    expect(watermark('/uploads/branding/gone.png', { exists: () => false })).toEqual({
      css: '',
      html: '',
    });
  });
});
