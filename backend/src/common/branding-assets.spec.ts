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

/**
 * The full-resolution artwork behind the shipped defaults.
 *
 * What ships is downscaled to roughly the size it prints at, because it is
 * inlined as base64 into every letter. The master has to live somewhere all
 * the same: a school's stamp is drawn once and re-exported for years, and a
 * downscaled copy is not something you can go back to. `uploads/` is
 * gitignored and a browser cache is not a backup — this folder is the only
 * version-controlled copy.
 */
describe('the full-resolution artwork behind them', () => {
  const originals = join(process.cwd(), 'assets', 'originals');

  const masters = [['stamp.png', 'the school stamp']] as const;

  it.each(masters)('keeps the master for %s — %s', (file) => {
    expect(existsSync(join(originals, file))).toBe(true);
  });

  it.each(masters)('%s master is a real image', (file) => {
    const path = join(originals, file);
    if (!existsSync(path)) return;
    expect(validateImageMagicBytes(readFileSync(path))).toBe(true);
  });

  // The point of keeping it is that it has detail the shipped copy lost.
  it.each(masters)('%s master is larger than what ships', (file) => {
    const master = join(originals, file);
    const shipped = join(process.cwd(), 'assets', file);
    if (!existsSync(master) || !existsSync(shipped)) return;
    expect(readFileSync(master).length).toBeGreaterThan(
      readFileSync(shipped).length,
    );
  });

  // It is never inlined, so it carries no size ceiling — but it is in git,
  // and a scan straight off a flatbed does not belong in a repository.
  it.each(masters)('%s master is still a sane size for git', (file) => {
    const path = join(originals, file);
    if (!existsSync(path)) return;
    expect(readFileSync(path).length).toBeLessThan(8 * 1024 * 1024);
  });
});
