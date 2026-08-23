import { escapeHtml, logoDataUri, sanitizeColor } from './html';

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
