/*
 * WCAG 2.1 A and AA audit across every navigable page, as every role.
 *
 * Run against a live dashboard and API, the same way ui-audit.spec.js is:
 *
 *   WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/a11y-audit.spec.js
 *
 * Exits non-zero on any violation. Nothing here is advisory: the violations it
 * found on its first run (icon buttons with no accessible name, unlabelled
 * selects, a contrast pairing that used an ad-hoc opacity instead of the wash
 * token) were all real, and all shipped.
 */
const path = require('path');

const WEB = process.env.WEB || 'http://localhost:3001';
const API = process.env.API || 'http://localhost:3000/api';
const PASS = 'Password123!';

function req(name) {
  for (const base of [path.join(__dirname, '..', 'node_modules'), path.join(process.cwd(), 'node_modules')]) {
    try {
      return require(path.join(base, name));
    } catch {
      /* try the next location */
    }
  }
  return require(name);
}

const { chromium } = req('playwright');
const { AxeBuilder } = req('@axe-core/playwright');

// Matches the demo seed. See CLAUDE.md.
const ACCOUNTS = {
  ADMIN: { email: 'wilsonshizirungu@gmail.com', password: PASS },
  TEACHER: { email: 'aline.uwase@markova.edu', password: PASS },
  STUDENT: { email: 'student1@markova.edu', password: PASS },
  PARENT: { phone: '+250788100000', password: PASS },
  LIBRARIAN: { email: 'librarian@markova.edu', password: PASS },
  BURSAR: { email: 'bursar@markova.edu', password: PASS },
  HEAD_TEACHER: { email: 'headteacher@markova.edu', password: PASS },
  PATRON: { email: 'patron@markova.edu', password: PASS },
  MATRON: { email: 'matron@markova.edu', password: PASS },
  NURSE: { email: 'nurse@markova.edu', password: PASS },
};

const ROUTES = {
  ADMIN: ['/admin', '/admin/users', '/admin/students', '/admin/teachers', '/admin/subjects',
    /* Marks, the register and report card generation moved to the Director
       of Studies, and the shell redirects the principal off them - scanning
       them here would quietly be scanning the dashboard instead. */
    '/admin/classes', '/admin/timetable', '/admin/id-cards',
    '/admin/promotion', '/admin/discipline', '/admin/library',
    '/admin/homework', '/admin/messages', '/admin/announcements', '/admin/analytics',
    '/admin/pocket-money', '/admin/health', '/admin/activities', '/admin/settings',
    '/admin/help', '/admin/onboarding', '/admin/profile',
    '/admin/admissions', '/admin/admissions/intakes', '/admin/report-cards',
    '/grading'],
  TEACHER: ['/teacher', '/teacher/marks', '/teacher/homework', '/teacher/attendance',
    '/teacher/discipline', '/teacher/messages', '/teacher/announcements',
    '/teacher/activities',
    '/teacher/analytics', '/teacher/profile', '/admin/report-cards', '/grading',
    '/help'],
  STUDENT: ['/student', '/student/marks', '/student/reports', '/student/homework',
    '/student/attendance', '/student/library', '/student/messages', '/student/analytics',
    '/student/discipline', '/student/activities', '/student/fees', '/student/profile',
    '/grading', '/help'],
  PARENT: ['/parent', '/parent/marks', '/parent/attendance', '/parent/discipline',
    '/parent/reports', '/parent/messages', '/parent/pocket-money', '/parent/health',
    '/parent/activities', '/parent/analytics', '/parent/fees', '/parent/profile',
    '/grading', '/help'],
  LIBRARIAN: ['/librarian', '/librarian/books', '/librarian/loans', '/librarian/messages',
    '/librarian/profile', '/help'],
  // The bursar keeps the fee ledger and nothing else.
  BURSAR: ['/admin/finance', '/admin/finance/structure', '/messages', '/help'],
  // The head teacher runs the academic side and nothing else.
  HEAD_TEACHER: ['/head-teacher', '/admin/report-cards', '/admin/marks', '/admin/reports',
    '/admin/classes',
    '/admin/timetable', '/admin/teachers', '/admin/attendance', '/grading',
    '/profile', '/messages', '/help'],
  // The boarding staff and the nurse: their own dashboards, plus the welfare
  // pages under /admin the shell lets them through to.
  PATRON: ['/boarding', '/admin/pocket-money', '/admin/health', '/admin/activities',
    '/messages', '/help'],
  MATRON: ['/boarding', '/admin/pocket-money', '/admin/health', '/messages', '/help'],
  NURSE: ['/nurse', '/admin/health', '/messages', '/help'],
};

/* Reached without an account at all: a family applying, and a family
   checking on what they sent. */
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/admissions', '/admissions/apply'];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `/auth/login` allows ten attempts a minute. This audit signs in as eight
 * roles, so running it beside the browser suite spends that window - and a
 * throttled reply carries no `sessionId`, which used to surface as
 * "sessionId must be a string" rather than as the rate limit it is.
 */
async function login(role, attempt = 0) {
  const first = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ACCOUNTS[role]),
  });
  const data = await first.json();
  if (data.accessToken) return data;
  if (!data.sessionId) {
    if (first.status === 429 && attempt < 3) {
      await wait(20000);
      return login(role, attempt + 1);
    }
    throw new Error(
      first.status === 429
        ? `login for ${role} is rate limited; the audit is being run too often`
        : `login for ${role} failed: ${JSON.stringify(data)}`,
    );
  }
  const second = await fetch(`${API}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: data.sessionId, otp: data.devOtp }),
  });
  const verified = await second.json();
  if (!verified.accessToken) {
    throw new Error(`login failed for ${role}: ${JSON.stringify(verified).slice(0, 200)}`);
  }
  return verified;
}

/**
 * Wait for the page to actually be the page before judging it.
 *
 * A flat 500ms after `domcontentloaded` was a race, and it lost often enough
 * to matter: three runs of this suite in a row reported twenty contrast
 * failures on one page, then nothing at all, then two missing document
 * titles somewhere else. Every one of those was a skeleton being scanned -
 * grey placeholder bars really do fail contrast, and the title really is
 * absent until the route resolves.
 *
 * A gate that cries wolf is worse than no gate, because the first thing
 * anybody does with it is stop believing it.
 */
async function settle(page) {
  // The route has resolved once it has a title of its own.
  await page
    .waitForFunction(() => document.title && document.title.trim().length > 0, {
      timeout: 15000,
    })
    .catch(() => {});

  // And once nothing is still spinning. Pages here draw a spinner while their
  // queries are in flight, which is exactly the state that scans as a wall of
  // low-contrast grey.
  await page
    .waitForFunction(() => !document.querySelector('.animate-spin'), {
      timeout: 15000,
    })
    .catch(() => {});

  // A beat for the paint that follows.
  await page.waitForTimeout(400);
}

async function scan(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations;
}

(async () => {
  const browser = await chromium.launch();
  const findings = [];
  let scanned = 0;

  // Signed-out pages first: they need no token and are the first thing anyone
  // with a screen reader meets.
  /*
    THEME=dark runs the whole sweep on the dark palette.

    Contrast is the failure a dark theme actually ships with, and axe measures
    exactly that - so rather than a second audit that would drift from this
    one, the same 108 pages are scanned again with the OS asking for dark and
    nothing stamped, which is the state most readers are in.
  */
  const dark = process.env.THEME === 'dark';
  const scheme = dark ? 'dark' : 'light';
  if (dark) console.log('Scanning the dark palette.\n');

  const publicCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  for (const route of PUBLIC_ROUTES) {
    const page = await publicCtx.newPage();
    for (const v of await scan(page, WEB + route)) {
      findings.push({ route, role: 'signed out', id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length });
    }
    scanned += 1;
    await page.close();
  }
  await publicCtx.close();

  for (const [role, routes] of Object.entries(ROUTES)) {
    const tokens = await login(role);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    await ctx.addInitScript((t) => {
      localStorage.setItem('access_token', t.accessToken);
      localStorage.setItem('refresh_token', t.refreshToken);
    }, tokens);

    for (const route of routes) {
      const page = await ctx.newPage();
      for (const v of await scan(page, WEB + route)) {
        findings.push({ route, role, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length });
      }
      /* A page that sent its reader to sign in was not scanned at all, only
         the sign in page was. Student sign ins are short now (a shared
         computer), so this is worth saying rather than passing quietly. */
      if (new URL(page.url()).pathname === '/login') {
        findings.push({ route, role, id: 'signed-out', impact: 'serious', help: 'Landed on the sign in page, so the page itself was not scanned', nodes: 0 });
      }
      scanned += 1;
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();

  if (findings.length === 0) {
    console.log(`\n${scanned} pages scanned, 0 WCAG 2.1 AA violations.`);
    process.exit(0);
  }

  console.error(`\n${scanned} pages scanned, ${findings.length} violations:\n`);
  for (const f of findings) {
    console.error(`  ${f.impact.padEnd(8)} ${f.id.padEnd(24)} x${String(f.nodes).padEnd(3)} ${f.role} ${f.route}`);
    console.error(`           ${f.help}`);
  }
  process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
