import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { validateImageMagicBytes } from './file-validation';

/**
 * The branding images the school ships with.
 *
 * `uploads/` is gitignored and rebuilt by the seed on every fresh clone, so
 * these three files under `assets/` are the only copies in the repository.
 * The seed copies each one into `uploads/` and points a config key at it; a
 * missing file silently degrades to an empty config value, which renders a
 * blank crest, a placeholder stamp ring and an unsigned letter. Nobody would
 * notice until a school printed a transfer letter.
 *
 * These are also embedded into every generated PDF as base64, which is why
 * the size ceiling is asserted rather than left to chance.
 */
describe('the branding assets that ship with the school', () => {
  const assets = join(process.cwd(), 'assets');

  const shipped = [
    ['logo-mark.png', 'the crest on documents and the sidebar'],
    ['stamp.png', 'the school stamp beside the signature'],
    ['signature.png', "the head teacher's signature"],
  ] as const;

  it.each(shipped)('ships %s — %s', (file) => {
    expect(existsSync(join(assets, file))).toBe(true);
  });

  // A file that is present but not actually an image would be copied into
  // uploads and served, then fail to decode inside the PDF renderer.
  it.each(shipped)('%s is a real image', (file) => {
    const path = join(assets, file);
    if (!existsSync(path)) return;
    expect(validateImageMagicBytes(readFileSync(path))).toBe(true);
  });

  /**
   * Each one is inlined into every document the school issues, so a scan
   * straight off a flatbed would be carried by every letter, transcript and
   * report card. A quarter of a megabyte is generous for a signature.
   */
  it.each(shipped)('%s is small enough to inline', (file) => {
    const path = join(assets, file);
    if (!existsSync(path)) return;
    expect(readFileSync(path).length).toBeLessThan(256 * 1024);
  });
});
