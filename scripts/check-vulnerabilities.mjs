#!/usr/bin/env node
/**
 * Fails on any dependency advisory that has not been written down and reasoned
 * about.
 *
 *   node scripts/check-vulnerabilities.mjs
 *
 * `npm audit` on its own is not a gate. It either passes, or it fails on
 * something with no fix available and somebody adds `|| true` to the CI step,
 * and from then on it reports nothing forever. That is worse than not running
 * it, because it looks like it is working.
 *
 * So every advisory has to be in one of two states: fixed, or listed below with
 * a reason, a date and the condition that would make it urgent. Anything else
 * fails the build. An allowlist entry is a decision somebody made, not a
 * silence.
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Advisories we have looked at and decided to carry.
 *
 * Keep this short. If it grows past a handful, the honest reading is that the
 * dependency tree needs work rather than that the list needs another entry.
 */
const ACCEPTED = [
  {
    package: 'extract-zip',
    advisory: 'GHSA-jmr9-qjv8-65gv',
    since: '2026-08-31',
    why: [
      'Reached only through @puppeteer/browsers, which downloads and unpacks a',
      'Chrome build. We use puppeteer-core, which ships no browser and never',
      'downloads one: reports.service.ts launches the binary at CHROME_PATH,',
      'and the Dockerfile sets it. The vulnerable code is present in the tree',
      'and unreachable at runtime. extract-zip 2.0.1 is the latest release, so',
      'there is nothing to upgrade to.',
    ].join(' '),
    urgentIf:
      'anything starts calling @puppeteer/browsers, or a deployment lets ' +
      'puppeteer download its own Chrome instead of setting CHROME_PATH.',
  },
];

const projects = ['backend', 'web'];

function auditOf(project) {
  try {
    const out = execSync('npm audit --omit=dev --json', {
      cwd: join(root, project),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (error) {
    // npm audit exits non-zero when it finds anything, and still prints the
    // report on stdout. That is the normal case here, not a failure to run.
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

const accepted = (name, urls) =>
  ACCEPTED.find(
    (a) => a.package === name && urls.some((u) => u.includes(a.advisory)),
  );

let unexplained = 0;
let carried = 0;

console.log('Dependency advisories\n');

for (const project of projects) {
  const report = auditOf(project);
  const vulns = Object.values(report.vulnerabilities ?? {});
  const direct = vulns.filter((v) => typeof v.via?.[0] === 'object');

  console.log(`  ${project.toUpperCase()}`);
  if (direct.length === 0) console.log('    nothing reported');

  for (const v of direct) {
    const urls = v.via
      .filter((entry) => typeof entry === 'object')
      .map((entry) => entry.url ?? '');
    const known = accepted(v.name, urls);
    if (known) {
      carried++;
      console.log(
        `    carried  ${v.severity.padEnd(8)} ${v.name}  (${known.advisory}, since ${known.since})`,
      );
    } else {
      unexplained++;
      console.log(`    NEW      ${v.severity.padEnd(8)} ${v.name}`);
      for (const url of urls.filter(Boolean)) console.log(`             ${url}`);
    }
  }
  console.log('');
}

if (unexplained) {
  console.error(
    `${unexplained} advisory(s) with no decision recorded.\n\n` +
      'Fix them, or add an entry to ACCEPTED in this file saying why the\n' +
      'vulnerable code cannot be reached and what would change that.',
  );
  process.exit(1);
}

console.log(
  carried
    ? `No new advisories. ${carried} carried with a written reason.`
    : 'No advisories.',
);
