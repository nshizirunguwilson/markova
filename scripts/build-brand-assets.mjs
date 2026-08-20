#!/usr/bin/env node
/**
 * Rasterises the Markova mark into every icon slot the two clients need.
 *
 *   node scripts/build-brand-assets.mjs
 *
 * Sources (hand-authored, committed):
 *   design/logo-mark.svg   navy badge + white monogram
 *   design/logo-glyph.svg  monogram only, currentColor, transparent ground
 *
 * Uses sharp from web/node_modules, so run `npm install` in web/ first.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
const DENSITY = 1200;

const markSvg = readFileSync(join(root, 'design/logo-mark.svg'));
const glyphSrc = readFileSync(join(root, 'design/logo-glyph.svg'), 'utf8');
const whiteGlyph = Buffer.from(glyphSrc.replace(/currentColor/g, '#FFFFFF'));

const render = (svg, size) =>
  sharp(svg, { density: DENSITY }).resize(size, size).png();

/** Centre `inner` (a square png buffer) on a `size` canvas covering `ratio` of it. */
async function inset(inner, size, ratio, background) {
  const box = Math.round(size * ratio);
  const pad = Math.round((size - box) / 2);
  const scaled = await sharp(inner).resize(box, box).toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, left: pad, top: pad }])
    .png()
    .toBuffer();
}

const jobs = [
  // ── web ──────────────────────────────────────────────────────────────────
  {
    out: 'web/src/app/apple-icon.png',
    note: 'iOS home-screen icon; opaque, no transparency allowed',
    make: () => render(markSvg, 180).flatten({ background: NAVY }).toBuffer(),
  },

  // ── mobile ───────────────────────────────────────────────────────────────
  {
    out: 'mobile/assets/icon.png',
    note: 'iOS/Expo app icon; must be opaque and full-bleed',
    make: () => render(markSvg, 1024).flatten({ background: NAVY }).toBuffer(),
  },
  {
    out: 'mobile/assets/favicon.png',
    note: 'Expo web favicon',
    make: () => render(markSvg, 48).toBuffer(),
  },
  {
    out: 'mobile/assets/splash-icon.png',
    note: 'shown on the navy splash background, so the glyph is white',
    make: async () => inset(await render(whiteGlyph, 1024).toBuffer(), 1024, 0.62),
  },
  {
    out: 'mobile/assets/android-icon-background.png',
    note: 'adaptive icon background layer: flat brand navy',
    make: () =>
      sharp({
        create: { width: 1024, height: 1024, channels: 3, background: NAVY },
      })
        .png()
        .toBuffer(),
  },
  {
    out: 'mobile/assets/android-icon-foreground.png',
    note: 'adaptive foreground; content kept inside the 66/108 safe zone',
    make: async () => inset(await render(whiteGlyph, 1024).toBuffer(), 1024, 0.52),
  },
  {
    out: 'mobile/assets/android-icon-monochrome.png',
    note: 'themed-icon layer: silhouette only, same safe zone',
    make: async () => inset(await render(whiteGlyph, 1024).toBuffer(), 1024, 0.52),
  },
];

for (const job of jobs) {
  const path = join(root, job.out);
  const buf = await job.make();
  writeFileSync(path, buf);
  console.log(`  ${existsSync(path) ? 'written' : 'created'}  ${job.out}  — ${job.note}`);
}

console.log(`\n${jobs.length} brand assets rebuilt from design/logo-mark.svg.`);
