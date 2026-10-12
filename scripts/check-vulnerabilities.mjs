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
    package: '@opentelemetry/core',
    advisory: 'GHSA-8988-4f7v-96qf',
    since: '2026-08-31',
    why: [
      'Pulled in by @sentry/nestjs, which ships a coordinated set of',
      '@opentelemetry packages and expects them to move together. Overriding',
      'this one alone was tried and makes the SDK fail at boot with "Cannot',
      'read properties of undefined (reading AlwaysOn)", which takes the API',
      'down on start. The advisory concerns trace context handling in a',
      'telemetry path we only reach when SENTRY_DSN is set.',
    ].join(' '),
    urgentIf:
      'Sentry ships a release with the newer @opentelemetry set, at which ' +
      'point upgrading @sentry/nestjs resolves it properly.',
  },
  {
    package: '@opentelemetry/instrumentation-knex',
    advisory: 'GHSA-qqmp-wf37-98f9',
    since: '2026-10-12',
    why: [
      'Part of the @opentelemetry set @sentry/node 9 pins (see @opentelemetry/core',
      'above). The advisory is that these instrumentations put the database user',
      'name into traces. Each one only wraps its own driver, and Markova loads',
      'none of them: it talks to PostgreSQL through Prisma, never through knex,',
      'mysql or tedious (SQL Server). Traces leave only when SENTRY_DSN is set.',
    ].join(' '),
    urgentIf:
      'the API starts using knex, mysql or tedious, or @sentry/nestjs is ' +
      'upgraded to the release with @opentelemetry 0.65 or later (fixes this).',
  },
  {
    package: '@opentelemetry/instrumentation-mysql',
    advisory: 'GHSA-qqmp-wf37-98f9',
    since: '2026-10-12',
    why: [
      'Part of the @opentelemetry set @sentry/node 9 pins (see @opentelemetry/core',
      'above). The advisory is that these instrumentations put the database user',
      'name into traces. Each one only wraps its own driver, and Markova loads',
      'none of them: it talks to PostgreSQL through Prisma, never through knex,',
      'mysql or tedious (SQL Server). Traces leave only when SENTRY_DSN is set.',
    ].join(' '),
    urgentIf:
      'the API starts using knex, mysql or tedious, or @sentry/nestjs is ' +
      'upgraded to the release with @opentelemetry 0.65 or later (fixes this).',
  },
  {
    package: '@opentelemetry/instrumentation-tedious',
    advisory: 'GHSA-qqmp-wf37-98f9',
    since: '2026-10-12',
    why: [
      'Part of the @opentelemetry set @sentry/node 9 pins (see @opentelemetry/core',
      'above). The advisory is that these instrumentations put the database user',
      'name into traces. Each one only wraps its own driver, and Markova loads',
      'none of them: it talks to PostgreSQL through Prisma, never through knex,',
      'mysql or tedious (SQL Server). Traces leave only when SENTRY_DSN is set.',
    ].join(' '),
    urgentIf:
      'the API starts using knex, mysql or tedious, or @sentry/nestjs is ' +
      'upgraded to the release with @opentelemetry 0.65 or later (fixes this).',
  },
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
