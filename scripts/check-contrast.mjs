#!/usr/bin/env node
/**
 * Verifies every foreground/background pairing in design/tokens.json against
 * WCAG 2.1. Run standalone or in CI:  node scripts/check-contrast.mjs
 *
 *   body text            >= 4.5:1  (AA)
 *   UI component bounds  >= 3.0:1  (AA non-text)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { color, chartCategorical } = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
const c = (name) => color[name].value;

const toRgb = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const channel = (v) => {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = (h) => {
  const [r, g, b] = toRgb(h);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [label, foreground, background, threshold] */
const checks = [
  ['foreground on surface', 'foreground', 'surface', 4.5],
  ['foreground on background', 'foreground', 'background', 4.5],
  ['foreground on surfaceMuted', 'foreground', 'surfaceMuted', 4.5],
  ['foregroundMuted on surface', 'foregroundMuted', 'surface', 4.5],
  ['muted on surface', 'muted', 'surface', 4.5],
  ['muted on background', 'muted', 'background', 4.5],
  ['muted on surfaceMuted', 'muted', 'surfaceMuted', 4.5],
  ['muted on accentLight', 'muted', 'accentLight', 4.5],
  ['primary on surface', 'primary', 'surface', 4.5],
  ['primary on background', 'primary', 'background', 4.5],
  ['primary on accent', 'primary', 'accent', 4.5],
  ['primary on accentLight', 'primary', 'accentLight', 4.5],
  ['white on primary', 'white', 'primary', 4.5],
  ['white on primaryDark', 'white', 'primaryDark', 4.5],
  ['success on surface', 'success', 'surface', 4.5],
  ['success on successWash', 'success', 'successWash', 4.5],
  ['white on success', 'white', 'success', 4.5],
  ['warning on surface', 'warning', 'surface', 4.5],
  ['warning on warningWash', 'warning', 'warningWash', 4.5],
  ['white on warning', 'white', 'warning', 4.5],
  ['danger on surface', 'danger', 'surface', 4.5],
  ['danger on dangerWash', 'danger', 'dangerWash', 4.5],
  ['white on danger', 'white', 'danger', 4.5],
  ['info on infoWash', 'info', 'infoWash', 4.5],
  ['borderInput on surface', 'borderInput', 'surface', 3.0],
  ['borderInput on background', 'borderInput', 'background', 3.0],
  ['primaryLight focus ring on surface', 'primaryLight', 'surface', 3.0],
];

// Categorical chart fills carry white labels, so each must clear 4.5:1.
chartCategorical.values.forEach((hex, i) => {
  color[`__category${i + 1}`] = { value: hex };
  checks.push([`white on categorical ${i + 1} (${hex})`, 'white', `__category${i + 1}`, 4.5]);
});

let failed = 0;
console.log('WCAG contrast — design/tokens.json\n');
for (const [label, fg, bg, min] of checks) {
  const r = ratio(c(fg), c(bg));
  const ok = r >= min;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(6)}:1  (min ${min})  ${label}`,
  );
}

if (failed) {
  console.error(`\n${failed} contrast check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} contrast checks passed.`);
