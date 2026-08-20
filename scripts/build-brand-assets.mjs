#!/usr/bin/env node
/**
 * Regenerates the derived icon slots from Markova's brand artwork.
 *
 *   node scripts/build-brand-assets.mjs
 *
 * Source of truth (hand-authored, committed — do not generate these):
 *   brand/noText.png     the mark alone: graduation cap, tassel and pencil
 *   brand/text.png       the wordmark
 *   brand/allBeside.png  horizontal lockup
 *   brand/allAbove.png   stacked lockup
 *
 * The per-platform files under web/public/brand, backend/assets and
 * mobile/assets were exported from those sources at the sizes each platform
 * needs. This script re-derives the square icon slots so they stay in step if
 * the artwork is ever updated.
 *
 * Uses sharp from web/node_modules, so run `npm install` in web/ first.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'web/package.json'));

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp not found. Run `npm install` inside web/ first.');
  process.exit(1);
}

const NAVY = '#1B4F72';
const MARK = join(root, 'brand/noText.png');

/** Trim the source's transparent margin so padding is ours to control. */
const trimmed = () => sharp(MARK).trim();

/**
 * Centre the mark on a square canvas, covering `ratio` of the edge.
 *
 * The source artwork is navy on transparent, so anything drawn on a navy
 * ground must be recoloured white first — otherwise the mark disappears into
 * its own background.
 */
async function square(size, ratio, { background, white } = {}) {
  const box = Math.round(size * ratio);
  let inner = trimmed().resize(box, box, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (white) {
    // Keep the alpha channel, force every visible pixel to white.
    inner = sharp(await inner.png().toBuffer())
      .ensureAlpha()
      .linear(0, 255)
      .toColourspace('b-w');
    const alpha = await trimmed()
      .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extractChannel('alpha')
      .toBuffer();
    inner = sharp({
      create: { width: box, height: box, channels: 3, background: '#FFFFFF' },
    }).joinChannel(alpha);
  }
  const buf = await inner.png().toBuffer();
  const meta = await sharp(buf).metadata();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: buf,
        left: Math.round((size - meta.width) / 2),
        top: Math.round((size - meta.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

const jobs = [
  {
    out: 'web/src/app/icon.png',
    note: 'browser tab icon',
    make: () => square(512, 0.86),
  },
  {
    out: 'web/src/app/apple-icon.png',
    note: 'iOS home-screen icon: white mark on navy, opaque',
    make: async () =>
      sharp(
        await square(180, 0.66, {
          background: { r: 27, g: 79, b: 114, alpha: 1 },
          white: true,
        }),
      )
        .flatten({ background: NAVY })
        .png()
        .toBuffer(),
  },
  {
    out: 'web/public/brand/icon-192.png',
    note: 'PWA icon',
    make: () => square(192, 0.86),
  },
  {
    out: 'web/public/brand/icon-512.png',
    note: 'PWA icon',
    make: () => square(512, 0.86),
  },
  {
    out: 'web/public/brand/icon-512-maskable.png',
    note: 'PWA maskable icon: white mark on navy, inside the safe circle',
    make: () =>
      square(512, 0.55, {
        background: { r: 27, g: 79, b: 114, alpha: 1 },
        white: true,
      }),
  },
];

for (const job of jobs) {
  writeFileSync(join(root, job.out), await job.make());
  console.log(`  written  ${job.out}  — ${job.note}`);
}

console.log(`\n${jobs.length} icon slots re-derived from brand/noText.png.`);
console.log(
  'mobile/assets and web/public/brand/logo-*.png are exported artwork — left untouched.',
);
