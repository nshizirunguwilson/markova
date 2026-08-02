/**
 * Proves every colour pair the interface can actually produce.
 *
 * Run with `npm run design:check`.
 *
 * This exists because the brand colour is not ours. Each school sets its own
 * primary_color, so the palette is only half decided at build time. A school
 * that picks a bright yellow would, without the derivation in theme.ts, get a
 * primary button with a label at Lc 33 against a floor of 75. That is not a
 * theoretical problem, it is what the raw value does, and this file is what
 * stops it shipping.
 *
 * Thresholds come from APCA's own size and weight guidance:
 *   Lc 90  preferred for body copy
 *   Lc 75  minimum for body copy at 16px regular
 *   Lc 60  large or heavier text, and icons that carry meaning
 *   Lc 30  solid non-text elements
 *   Lc 15  dividers, below which treat it as invisible
 */

import { contrast, identityColors } from '../src/design/color';
import { neutral, status } from '../src/design/tokens';
import { buildTheme } from '../src/design/theme';

const lc = (text: string, bg: string) => Math.abs(contrast(text, bg));

let failures = 0;
let checks = 0;

function expect(label: string, value: number, min: number) {
  checks++;
  const ok = value >= min;
  if (!ok) failures++;
  const mark = ok ? '  ok  ' : ' FAIL ';
  console.log(`${mark}${label.padEnd(52)} Lc ${value.toFixed(1).padStart(6)}   floor ${min}`);
}

function group(name: string) {
  console.log(`\n${name}`);
}

// Every hue a school might reasonably pick, including the ones that break
// naive palettes: yellow and light green cannot carry white, and pure black
// cannot be darkened any further.
const SCHOOL_COLOURS = [
  '#1B4F72', '#C0392B', '#27AE60', '#F1C40F', '#7D3C98',
  '#00BCD4', '#FF9800', '#8BC34A', '#000000', '#E91E63',
  '#FFFFFF', '#795548', '#3F51B5', '#CDDC39',
];

group('Neutral ink on every surface it can land on');
{
  const t = buildTheme();
  const surfaces = [
    ['page', t.bg.page],
    ['surface', t.bg.surface],
    ['fill', t.bg.fill],
    ['fill pressed', t.bg.fillPressed],
    ['fill selected', t.bg.fillSelected],
  ] as const;

  for (const [name, bg] of surfaces) {
    expect(`primary ink on ${name}`, lc(t.fg.primary, bg), 90);
    expect(`secondary ink on ${name}`, lc(t.fg.secondary, bg), 75);
    expect(`tertiary ink on ${name}`, lc(t.fg.tertiary, bg), 60);
  }
  expect('placeholder on page', lc(t.fg.placeholder, t.bg.page), 60);
  expect('hairline on page', lc(t.line.hairline, t.bg.page), 15);
  expect('border on page', lc(t.line.border, t.bg.page), 15);
  expect('strong line on page', lc(t.line.strong, t.bg.page), 30);
}

group('Status colours');
for (const [name, s] of Object.entries(status)) {
  expect(`white label on ${name} solid`, lc('#FFFFFF', s.solid), 75);
  expect(`${name} text on ${name} tint`, lc(s.text, s.tint), 75);
  expect(`${name} text on page`, lc(s.text, neutral[1]), 75);
  expect(`${name} border on page`, lc(s.border, neutral[1]), 15);
}

group('Brand, derived from whatever the school configured');
for (const hex of SCHOOL_COLOURS) {
  const t = buildTheme(hex);
  const tag = `${hex} -> ${t.brand.solid}`;
  expect(`${tag} label on solid`, lc(t.brand.onSolid, t.brand.solid), 75);
  expect(`${tag} label on solid pressed`, lc(t.brand.onSolid, t.brand.solidPressed), 75);
  expect(`${tag} brand text on page`, lc(t.brand.text, t.bg.page), 75);
  expect(`${tag} brand text on tint`, lc(t.brand.text, t.brand.tint), 75);
  expect(`${tag} primary ink on tint`, lc(t.fg.primary, t.brand.tint), 75);
  expect(`${tag} brand border on page`, lc(t.brand.border, t.bg.page), 15);
}

group('Avatar initials, coloured from the name itself');
{
  // Real Rwandan names from the seed, plus the edge cases: one word, a very
  // long name, and a name whose hash lands on the hues that are hardest to
  // keep legible.
  const names = [
    'Aline Uwase', 'Jean Bosco Nshimiyimana', 'Divine Ineza', 'Kwizera', 'Mucyo Gisa',
    'Marie Claire Mukamana', 'Thierry Habimana', 'Shema', 'Ange Kalisa', 'Yves Ndayisaba',
    'Immaculee Nyiraneza', 'Olivier Rukundo',
  ];
  let worst = Infinity;
  let worstName = '';
  for (const name of names) {
    const { bg, fg } = identityColors(name);
    const value = lc(fg, bg);
    if (value < worst) {
      worst = value;
      worstName = name;
    }
  }
  expect(`worst of ${names.length} names (${worstName})`, worst, 60);

  // Names are user data, so the guarantee has to hold for every hue the hash
  // can reach, not just the twelve above.
  let allHues = Infinity;
  for (let h = 0; h < 360; h++) {
    const probe = identityColors(String.fromCharCode(65 + (h % 26)).repeat(1 + (h % 5)) + h);
    allHues = Math.min(allHues, lc(probe.fg, probe.bg));
  }
  expect('initials on disc, swept across every hue', allHues, 60);

  // The generated background also has to separate from the page it sits on,
  // or a pale avatar disappears into the row.
  const page = buildTheme().bg.page;
  let worstBg = Infinity;
  for (const name of names) worstBg = Math.min(worstBg, lc(identityColors(name).bg, page));
  expect('palest avatar background against the page', worstBg, 15);
}

group('Junk input falls back rather than breaking');
for (const bad of ['', 'not a colour', '#12', 'rgb(1,2,3)', null, undefined]) {
  const t = buildTheme(bad as never);
  expect(`${JSON.stringify(bad)} falls back safely`, lc(t.brand.onSolid, t.brand.solid), 75);
}

console.log(
  failures === 0
    ? `\n${checks} checks, all pass.\n`
    : `\n${checks} checks, ${failures} failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
