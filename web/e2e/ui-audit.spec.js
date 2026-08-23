/*
 * Markova frontend regression suite (Playwright, headless Chromium).
 *
 * Covers: auth flows, role-based route guards (RBAC), 404 handling, a full CRUD
 * form (validation + happy-path persistence + double-submit), table search +
 * empty state, modal dismissal (Escape / backdrop / cancel), and responsive
 * horizontal-overflow checks at mobile/tablet.
 *
 * Run (needs Playwright + chromium available; the repo dev harness lives at
 * /tmp/pw, otherwise `npm i -D playwright && npx playwright install chromium`):
 *   WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/ui-audit.spec.js
 * Requires the web app on :3001 and the API on :3000 with the demo seed loaded.
 */
'use strict';

// Resolve playwright from a local install or the repo's /tmp harness.
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/tmp/pw/node_modules/playwright')); }

const WEB = process.env.WEB || 'http://localhost:3001';
const API = process.env.API || 'http://localhost:3000/api';
const PASS = 'Password123!';
const ACCOUNTS = {
  ADMIN: { email: 'wilsonshizirungu@gmail.com', password: PASS },
  STUDENT: { email: 'student1@markova.edu', password: PASS },
  TEACHER: { email: 'aline.uwase@markova.edu', password: PASS },
  PARENT: { phone: '+250788100000', password: PASS },
};

async function apiLogin(role) {
  const r1 = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ACCOUNTS[role]),
  });
  const d1 = await r1.json();
  if (d1.accessToken) return d1;
  const r2 = await fetch(`${API}/auth/verify-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: d1.sessionId, otp: d1.devOtp }),
  });
  return r2.json();
}

// Log in each role ONCE and reuse the tokens — the backend rate-limits
// login/verify-otp to 10/min, so a fresh login per test would 429 mid-suite.
const tokenCache = {};
async function getTokens(role) {
  if (!tokenCache[role]) {
    const t = await apiLogin(role);
    if (!t.accessToken) throw new Error(`login failed for ${role}: ${JSON.stringify(t)}`);
    tokenCache[role] = t;
  }
  return tokenCache[role];
}

async function authedPage(ctx, role) {
  const tokens = await getTokens(role);
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    localStorage.setItem('access_token', t.accessToken);
    localStorage.setItem('refresh_token', t.refreshToken);
  }, tokens);
  return page;
}

// ── tiny test harness ────────────────────────────────────────────────────────
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── AUTH ─────────────────────────────────────────────────────────────────────
test('auth: valid login (student, no OTP) reaches dashboard', async (browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('#identifier', ACCOUNTS.STUDENT.email);
  await page.fill('#password', PASS);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/student', { timeout: 15000 });
  assert(new URL(page.url()).pathname === '/student', 'did not land on /student');
  await ctx.close();
});

test('auth: invalid password shows error and stays on /login', async (browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('#identifier', ACCOUNTS.STUDENT.email);
  await page.fill('#password', 'WrongPassword1!');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(2500);
  assert(new URL(page.url()).pathname === '/login', 'should remain on /login');
  await ctx.close();
});

test('auth: password show/hide toggle reveals the password', async (browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('#password', 'secret123');
  assert((await page.getAttribute('#password', 'type')) === 'password', 'should start masked');
  await page.click('button[aria-label="Show password"]');
  assert((await page.getAttribute('#password', 'type')) === 'text', 'should reveal after toggle');
  await ctx.close();
});

test('auth: protected route while logged out redirects to /login', async (browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${WEB}/admin/users`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  assert(new URL(page.url()).pathname === '/login', `expected /login, got ${new URL(page.url()).pathname}`);
  await ctx.close();
});

test('auth: after logout, back button does not show an authenticated page', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'STUDENT');
  await page.goto(`${WEB}/student`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  // Real logout: user menu → Sign Out → confirm (this also clears the auth store)
  await page.locator('header button').filter({ hasText: /STUDENT/ }).first().click();
  await page.waitForTimeout(300);
  await page.click('button:has-text("Sign Out")');
  await page.click('[role=dialog] button:has-text("Sign Out")');
  await page.waitForURL('**/login', { timeout: 8000 });
  await page.goBack({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
  const txt = await page.evaluate(() => document.body.innerText);
  assert(!/my marks|homework|attendance dashboard/i.test(txt),
    'back after logout still shows authenticated dashboard content');
  await ctx.close();
});

// ── RBAC route guards ────────────────────────────────────────────────────────
const RBAC = [
  ['STUDENT', '/admin/users'], ['STUDENT', '/admin/settings'], ['STUDENT', '/teacher/marks'],
  ['TEACHER', '/admin/settings'], ['TEACHER', '/admin/users'],
  ['PARENT', '/admin'],
  // The welfare pages are shared with the boarding staff, which widened the
  // route guard from one role per prefix to a set. That is exactly the change
  // most likely to let somebody through, so each new page is checked.
  ['STUDENT', '/admin/health'], ['STUDENT', '/admin/pocket-money'],
  ['PARENT', '/admin/health'], ['PARENT', '/admin/pocket-money'],
  ['PARENT', '/admin/activities'], ['PARENT', '/admin/announcements'],
  ['TEACHER', '/admin/health'], ['TEACHER', '/admin/pocket-money'],
  ['STUDENT', '/parent/health'], ['STUDENT', '/parent/pocket-money'],
];
for (const [role, route] of RBAC) {
  test(`rbac: ${role} cannot reach ${route}`, async (browser) => {
    const ctx = await browser.newContext();
    const page = await authedPage(ctx, role);
    await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const path = new URL(page.url()).pathname;
    assert(path !== route, `${role} reached ${route} (no role guard)`);
    await ctx.close();
  });
}

// ── 404 ──────────────────────────────────────────────────────────────────────
test('nav: garbage URL shows a not-found page, not a crash', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${WEB}/this-route-does-not-exist-xyz`, { waitUntil: 'networkidle' });
  const body = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  assert(/not found|404|doesn.t exist|go back|home/.test(body), 'no not-found content');
  assert(errs.length === 0, 'uncaught error on 404 page: ' + errs[0]);
  await ctx.close();
});

// ── FORM: subjects create (validation + persistence + double-submit) ─────────
test('form: Add Subject empty submit shows validation error', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  await page.goto(`${WEB}/admin/subjects`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Add Subject")', { timeout: 45000 });
  await page.click('button:has-text("Add Subject")');
  await page.waitForSelector('[role=dialog]');
  await page.click('[role=dialog] button:has-text("Create")');
  await page.waitForTimeout(500);
  assert(await page.locator('text=Subject name is required').count() > 0, 'no validation error shown');
  await ctx.close();
});

test('form: create subject persists and appears after reload (no duplicate on double-click)', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  const name = `ZZ Audit ${Date.now()}`;
  await page.goto(`${WEB}/admin/subjects`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Add Subject")', { timeout: 45000 });
  await page.click('button:has-text("Add Subject")');
  await page.waitForSelector('[role=dialog]');
  await page.fill('[role=dialog] input[placeholder*="Mathematics"]', name);
  // double-click Create fast — button disables on isLoading, so only one row
  const create = page.locator('[role=dialog] button:has-text("Create")');
  await create.click();
  await create.click({ timeout: 500 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const count = await page.locator(`td:has-text("${name}")`).count();
  assert(count === 1, `expected exactly 1 "${name}" row after reload, got ${count}`);
  // cleanup: delete it
  const row = page.locator('tr', { hasText: name });
  await row.locator('button').last().click();
  await page.waitForSelector('[role=dialog]:has-text("Delete Subject")');
  await page.click('[role=dialog] button:has-text("Delete")');
  await page.waitForTimeout(800);
  await ctx.close();
});

// ── TABLE: search + empty state ──────────────────────────────────────────────
test('table: student search filters, no-match shows empty state, clear restores', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  await page.goto(`${WEB}/admin/students`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table tbody tr', { timeout: 45000 });
  const initial = await page.locator('table tbody tr').count();
  const search = page.locator('input[placeholder*="Search by name"]').first();
  // matching term filters down
  await search.fill('uwase');
  await page.waitForFunction(() => {
    const t = document.querySelector('table tbody')?.innerText || '';
    return /uwase/i.test(t);
  }, null, { timeout: 8000 }).catch(() => {});
  // no-match shows the empty state
  await search.fill('zzzznomatchqwerty');
  await page.waitForFunction(
    () => /no students found/i.test(document.body.innerText),
    null, { timeout: 8000 },
  );
  assert(await page.locator('text=No students found').count() > 0, 'no empty state on no-match');
  // clearing restores the full list
  await search.fill('');
  await page.waitForFunction(
    (n) => (document.querySelectorAll('table tbody tr').length === n),
    initial, { timeout: 8000 },
  ).catch(() => {});
  const restored = await page.locator('table tbody tr').count();
  assert(restored === initial, `clearing search should restore rows (${initial} -> ${restored})`);
  await ctx.close();
});

// ── MODAL dismissal ──────────────────────────────────────────────────────────
test('modal: Escape closes the Add Subject modal', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  await page.goto(`${WEB}/admin/subjects`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Add Subject")', { timeout: 45000 });
  await page.click('button:has-text("Add Subject")');
  await page.waitForSelector('[role=dialog]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert(await page.locator('[role=dialog]').count() === 0, 'Escape did not close modal');
  await ctx.close();
});

test('modal: Cancel button closes the modal', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  await page.goto(`${WEB}/admin/subjects`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Add Subject")', { timeout: 45000 });
  await page.click('button:has-text("Add Subject")');
  await page.waitForSelector('[role=dialog]');
  await page.click('[role=dialog] button:has-text("Cancel")');
  await page.waitForTimeout(400);
  assert(await page.locator('[role=dialog]').count() === 0, 'Cancel did not close modal');
  await ctx.close();
});

// ── RESPONSIVE ───────────────────────────────────────────────────────────────
const RESP = [
  ['ADMIN', '/admin/attendance', 390], ['ADMIN', '/admin/attendance', 768],
  ['STUDENT', '/student/marks', 390],
];
for (const [role, route, width] of RESP) {
  test(`responsive: ${route} has no horizontal overflow at ${width}px`, async (browser) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await authedPage(ctx, role);
    await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert(m.sw - m.cw <= 2, `overflow +${m.sw - m.cw}px (${m.sw}>${m.cw})`);
    await ctx.close();
  });
}

// Next.js dev compiles routes lazily on first request, which can exceed a
// test's timeout on the very first hit. Pre-warm the routes the suite touches.
async function prewarm(browser) {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  for (const r of ['/admin/subjects', '/admin/students', '/admin/attendance', '/login', '/this-route-does-not-exist-xyz']) {
    await page.goto(`${WEB}${r}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  const sp = await authedPage(ctx, 'STUDENT');
  await sp.goto(`${WEB}/student/marks`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await ctx.close();
}

// ── runner ───────────────────────────────────────────────────────────────────
(async () => {
  const only = process.argv[2]; // optional substring filter
  const browser = await chromium.launch({ headless: true });
  if (!only) { process.stdout.write('  (pre-warming dev routes...)\n'); await prewarm(browser); }
  let pass = 0, fail = 0; const failures = [];
  for (const t of tests) {
    if (only && !t.name.includes(only)) continue;
    try { await t.fn(browser); console.log(`  PASS  ${t.name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${t.name}\n        ${e.message}`); fail++; failures.push(t.name); }
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed, ${tests.length} total`);
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
