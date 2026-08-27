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
  PATRON: { email: 'patron@markova.edu', password: PASS },
  MATRON: { email: 'matron@markova.edu', password: PASS },
  NURSE: { email: 'nurse@markova.edu', password: PASS },
};

const ROUTES = {
  ADMIN: ['/admin', '/admin/users', '/admin/students', '/admin/teachers', '/admin/subjects',
    '/admin/classes', '/admin/timetable', '/admin/marks', '/admin/reports', '/admin/id-cards',
    '/admin/promotion', '/admin/attendance', '/admin/discipline', '/admin/library',
    '/admin/homework', '/admin/messages', '/admin/announcements', '/admin/analytics',
    '/admin/pocket-money', '/admin/health', '/admin/activities', '/admin/settings',
    '/admin/help', '/admin/onboarding', '/admin/profile'],
  TEACHER: ['/teacher', '/teacher/marks', '/teacher/homework', '/teacher/attendance',
    '/teacher/discipline', '/teacher/messages', '/teacher/announcements',
    '/teacher/activities',
    '/teacher/analytics', '/teacher/profile', '/help'],
  STUDENT: ['/student', '/student/marks', '/student/reports', '/student/homework',
    '/student/attendance', '/student/library', '/student/messages', '/student/analytics',
    '/student/discipline', '/student/activities', '/student/profile', '/help'],
  PARENT: ['/parent', '/parent/marks', '/parent/attendance', '/parent/discipline',
    '/parent/reports', '/parent/messages', '/parent/pocket-money', '/parent/health',
    '/parent/activities', '/parent/analytics', '/parent/profile', '/help'],
  LIBRARIAN: ['/librarian', '/librarian/books', '/librarian/loans', '/librarian/messages',
    '/librarian/profile', '/help'],
  // The boarding staff and the nurse: their own dashboards, plus the welfare
  // pages under /admin the shell lets them through to.
  PATRON: ['/boarding', '/admin/pocket-money', '/admin/health', '/admin/activities',
    '/messages', '/help'],
  MATRON: ['/boarding', '/admin/pocket-money', '/admin/health', '/messages', '/help'],
  NURSE: ['/nurse', '/admin/health', '/messages', '/help'],
};

const PUBLIC_ROUTES = ['/login', '/forgot-password'];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `/auth/login` allows ten attempts a minute. This audit signs in as eight
 * roles, so running it beside the browser suite spends that window — and a
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

async function scan(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(500);
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations;
}

(async () => {
  const browser = await chromium.launch();
  const findings = [];
  let scanned = 0;

  // Signed-out pages first: they need no token and are the first thing anyone
  // with a screen reader meets.
  const publicCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((t) => {
      localStorage.setItem('access_token', t.accessToken);
      localStorage.setItem('refresh_token', t.refreshToken);
    }, tokens);

    for (const route of routes) {
      const page = await ctx.newPage();
      for (const v of await scan(page, WEB + route)) {
        findings.push({ route, role, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length });
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
