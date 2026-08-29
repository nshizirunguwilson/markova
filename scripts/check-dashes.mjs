#!/usr/bin/env node
/**
 * Keeps the repository free of em dashes and en dashes.
 *
 *   node scripts/check-dashes.mjs           report and fail on any found
 *   node scripts/check-dashes.mjs --fix     replace them with a hyphen
 *
 * Both characters are written here as escapes rather than literally, so this
 * file passes its own check.
 *
 * A hyphen is the substitute, everywhere. It is what the dash was standing in
 * for in every case the repository actually had: an aside in prose, a range
 * between two numbers, and the placeholder a table draws where a record has
 * no value.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const EM = '\u2014';
const EN = '\u2013';

/** Build output, dependencies, and anything else nobody writes by hand. */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.expo',
  '.turbo',
  'uploads',
  '.vercel',
  'ios',
  'android',
]);

/**
 * Files this cannot hold to the rule.
 *
 * `web/AGENTS.md` is written and re-added by `next dev` itself, so stripping
 * it only makes it come back on the next start of the dev server. Excluded
 * rather than fought with.
 */
const SKIP_FILES = new Set(['web/AGENTS.md']);

/** Read as text; anything that is not is skipped rather than reported. */
const BINARY = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.icns',
  '.pdf', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.otf', '.mp3',
  '.mp4', '.wav', '.webm', '.keystore', '.jks',
]);

const fix = process.argv.includes('--fix');

/** Every file worth reading, depth first. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (!BINARY.has(extname(entry).toLowerCase())) {
      yield path;
    }
  }
}

const offenders = [];
let fixed = 0;

for (const path of walk(root)) {
  const rel = relative(root, path);
  if (SKIP_FILES.has(rel)) continue;

  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  // A file read as UTF-8 that was not is full of replacement characters, and
  // reporting a dash inside one would be noise.
  if (text.includes('\uFFFD')) continue;
  if (!text.includes(EM) && !text.includes(EN)) continue;

  if (fix) {
    fixed += text.split(EM).length - 1 + (text.split(EN).length - 1);
    writeFileSync(path, text.split(EM).join('-').split(EN).join('-'));
    continue;
  }

  // Reported by line, so the output is something a person can act on.
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM) || line.includes(EN)) {
      offenders.push({ rel, line: i + 1, text: line.trim().slice(0, 100) });
    }
  });
}

if (fix) {
  console.log(`Replaced ${fixed} dash${fixed === 1 ? '' : 'es'} with a hyphen.`);
  process.exit(0);
}

if (offenders.length === 0) {
  console.log('No em dashes or en dashes found.');
  process.exit(0);
}

console.error(`${offenders.length} line${offenders.length === 1 ? '' : 's'} carry an em dash or an en dash:\n`);
for (const o of offenders.slice(0, 40)) {
  console.error(`  ${o.rel}:${o.line}  ${o.text}`);
}
if (offenders.length > 40) {
  console.error(`  ... and ${offenders.length - 40} more`);
}
console.error('\nRun: node scripts/check-dashes.mjs --fix');
process.exit(1);
