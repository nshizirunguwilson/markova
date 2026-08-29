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
  LIBRARIAN: { email: 'librarian@markova.edu', password: PASS },
  PATRON: { email: 'patron@markova.edu', password: PASS },
  MATRON: { email: 'matron@markova.edu', password: PASS },
  NURSE: { email: 'nurse@markova.edu', password: PASS },
  BURSAR: { email: 'bursar@markova.edu', password: PASS },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sign a role in, waiting out the throttle rather than falling over it.
 *
 * `/auth/login` allows ten attempts a minute. Running this suite twice in
 * quick succession - or beside the accessibility audit, which signs in as
 * every role of its own - spends that, and the throttled reply carries no
 * `sessionId`. The old code posted `verify-otp` with `sessionId: undefined`
 * anyway, so a rate limit was reported as "sessionId must be a string": an
 * error that says nothing about what actually happened.
 */
async function apiLogin(role, attempt = 0) {
  const r1 = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ACCOUNTS[role]),
  });
  const d1 = await r1.json();
  if (d1.accessToken) return d1;

  if (!d1.sessionId) {
    const throttled = r1.status === 429;
    if (throttled && attempt < 3) {
      // The window is a minute, so wait one out rather than hammering it.
      await wait(20000);
      return apiLogin(role, attempt + 1);
    }
    throw new Error(
      throttled
        ? `login for ${role} is rate limited; the suite is being run too often`
        : `login for ${role} failed: ${JSON.stringify(d1)}`,
    );
  }

  const r2 = await fetch(`${API}/auth/verify-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: d1.sessionId, otp: d1.devOtp }),
  });
  return r2.json();
}

// Log in each role ONCE and reuse the tokens - the backend rate-limits
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


/**
 * Go to a page and wait for it to be usable.
 *
 * Deliberately not `networkidle`. Every authenticated page in this app opens
 * a socket.io connection and keeps it open, so the network never goes quiet -
 * and `networkidle` waits for exactly that. It settles often enough to look
 * fine and fails under load, which is how this suite came to report a
 * different set of failures on every run, none of them about the code.
 *
 * Waiting for the document and then for the app to have painted something is
 * both faster and true: each test does its own waiting for whatever it is
 * actually asserting.
 */
async function visit(page, route, timeout = 60000) {
  await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout });
  await settled(page);
}

/**
 * Wait until the page has finished fetching what it renders.
 *
 * `domcontentloaded` fires before React has asked for anything, so a test
 * reading a table straight after it sees an empty one. The pages here show a
 * spinner while their queries are in flight and remove it when the data
 * lands, so its absence - over a body that has painted something - is the
 * signal that the page is ready to be read.
 */
async function settled(page) {
  await page
    .waitForFunction(
      () =>
        (document.body?.innerText || '').trim().length > 0 &&
        document.querySelectorAll('.animate-spin').length === 0,
      null,
      { timeout: 30000 },
    )
    .catch(() => {});
}

// ── tiny test harness ────────────────────────────────────────────────────────
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── AUTH ─────────────────────────────────────────────────────────────────────
test('auth: valid login (student, no OTP) reaches dashboard', async (browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await visit(page, `/login`);
  await page.fill('#identifier', ACCOUNTS.STUDENT.email);
  await page.fill('#password', PASS);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/student', { timeout: 90000 });
  assert(new URL(page.url()).pathname === '/student', 'did not land on /student');
  await ctx.close();
});

test('auth: invalid password shows error and stays on /login', async (browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await visit(page, `/login`);
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
  await visit(page, `/login`);
  await page.fill('#password', 'secret123');
  assert((await page.getAttribute('#password', 'type')) === 'password', 'should start masked');
  await page.click('button[aria-label="Show password"]');
  assert((await page.getAttribute('#password', 'type')) === 'text', 'should reveal after toggle');
  await ctx.close();
});

test('auth: protected route while logged out redirects to /login', async (browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await visit(page, `/admin/users`);
  await page.waitForTimeout(1500);
  assert(new URL(page.url()).pathname === '/login', `expected /login, got ${new URL(page.url()).pathname}`);
  await ctx.close();
});

test('auth: after logout, back button does not show an authenticated page', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'STUDENT');
  await visit(page, `/student`);
  await page.waitForTimeout(1000);
  // Real logout: user menu → Sign Out → confirm (this also clears the auth store)
  await page.locator('header button').filter({ hasText: /STUDENT/ }).first().click();
  await page.waitForTimeout(300);
  await page.click('button:has-text("Sign Out")');
  await page.click('[role=dialog] button:has-text("Sign Out")');
  await page.waitForURL('**/login', { timeout: 8000 });
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
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
  // The welfare staff have homes of their own now, and those homes are theirs
  // alone. A patron has no business on the nurse's ward, and neither of them
  // belongs anywhere else under /admin.
  ['PATRON', '/admin/users'], ['PATRON', '/admin/marks'], ['PATRON', '/nurse'],
  ['MATRON', '/admin/settings'], ['MATRON', '/admin/reports'],
  ['NURSE', '/boarding'], ['NURSE', '/admin/pocket-money'], ['NURSE', '/admin/users'],
  ['STUDENT', '/boarding'], ['STUDENT', '/nurse'],
  ['TEACHER', '/boarding'], ['TEACHER', '/nurse'],
  // The bursar keeps the fee ledger and nothing else. Whose child has paid is
  // not a teacher's business either, and the staffroom is exactly where that
  // becomes a child's problem.
  ['BURSAR', '/admin/users'], ['BURSAR', '/admin/marks'],
  ['BURSAR', '/admin/reports'], ['BURSAR', '/nurse'], ['BURSAR', '/boarding'],
  ['TEACHER', '/admin/finance'], ['STUDENT', '/admin/finance'],
  ['PARENT', '/admin/finance'], ['NURSE', '/admin/finance'],
];
for (const [role, route] of RBAC) {
  test(`rbac: ${role} cannot reach ${route}`, async (browser) => {
    const ctx = await browser.newContext();
    const page = await authedPage(ctx, role);

    // Not `networkidle`: the whole point of these routes is that the shell
    // bounces the visitor off them, and a page that redirects and refetches
    // on arrival may never go quiet on a dev server. What is being asserted
    // is that the path changed, so wait for that instead of for silence.
    await page.goto(`${WEB}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page
      .waitForFunction((r) => window.location.pathname !== r, route, { timeout: 15000 })
      .catch(() => {});

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
  await visit(page, `/this-route-does-not-exist-xyz`);
  const body = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  assert(/not found|404|doesn.t exist|go back|home/.test(body), 'no not-found content');
  assert(errs.length === 0, 'uncaught error on 404 page: ' + errs[0]);
  await ctx.close();
});

// ── FORM: subjects create (validation + persistence + double-submit) ─────────
test('form: Add Subject empty submit shows validation error', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, `/admin/subjects`);
  await page.waitForSelector('button:has-text("Add Subject")', { timeout: 90000 });
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
  await visit(page, `/admin/subjects`);
  await page.waitForSelector('button:has-text("Add Subject")', { timeout: 90000 });
  await page.click('button:has-text("Add Subject")');
  await page.waitForSelector('[role=dialog]');
  await page.fill('[role=dialog] input[placeholder*="Mathematics"]', name);
  // double-click Create fast - button disables on isLoading, so only one row
  const create = page.locator('[role=dialog] button:has-text("Create")');
  await create.click();
  await create.click({ timeout: 500 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settled(page);

  // Search for it rather than expecting it on the first page. The list pages
  // in the browser and this name sorts last, so as the school's subject list
  // grew the new row moved off page one - and the test began reporting a
  // successful create as a failed one.
  await page
    .locator('input[placeholder*="Search subjects"]')
    .first()
    .fill(name)
    .catch(() => {});

  // Wait for the row itself rather than for a fixed pause: the table is
  // fetched after the reload, and counting before it lands reads zero.
  await page
    .waitForFunction(
      (n) => (document.querySelector('table')?.innerText || '').includes(n),
      name,
      { timeout: 30000 },
    )
    .catch(() => {});
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
  await visit(page, `/admin/students`);
  await page.waitForSelector('table tbody tr', { timeout: 90000 });
  const initial = await page.locator('table tbody tr').count();
  const search = page.locator('input[placeholder*="Search by name"]').first();
  // The search is debounced and then queries 1,334 students, so these waits
  // are for a round trip rather than for a re-render.
  // matching term filters down
  await search.fill('uwase');
  await page.waitForFunction(() => {
    const t = document.querySelector('table tbody')?.innerText || '';
    return /uwase/i.test(t);
  }, null, { timeout: 30000 }).catch(() => {});
  // no-match shows the empty state
  await search.fill('zzzznomatchqwerty');
  await page.waitForFunction(
    () => /no students found/i.test(document.body.innerText),
    null, { timeout: 30000 },
  );
  assert(await page.locator('text=No students found').count() > 0, 'no empty state on no-match');
  // clearing restores the full list
  await search.fill('');
  await page.waitForFunction(
    (n) => (document.querySelectorAll('table tbody tr').length === n),
    initial, { timeout: 30000 },
  ).catch(() => {});
  const restored = await page.locator('table tbody tr').count();
  assert(restored === initial, `clearing search should restore rows (${initial} -> ${restored})`);
  await ctx.close();
});

// ── MODAL dismissal ──────────────────────────────────────────────────────────
test('modal: Escape closes the Add Subject modal', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, `/admin/subjects`);
  await page.waitForSelector('button:has-text("Add Subject")', { timeout: 90000 });
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
  await visit(page, `/admin/subjects`);
  await page.waitForSelector('button:has-text("Add Subject")', { timeout: 90000 });
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
    await visit(page, `${route}`);
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert(m.sw - m.cw <= 2, `overflow +${m.sw - m.cw}px (${m.sw}>${m.cw})`);
    await ctx.close();
  });
}

// Next.js dev compiles routes lazily on first request, which can exceed a
// test's timeout on the very first hit. Pre-warm the routes the suite touches.
/**
 * Visit every route the suite touches, once, before any of it is timed.
 *
 * The dev server compiles a route the first time it is asked for, and that
 * can take longer than a test's own navigation timeout - so a route nobody
 * had warmed failed on the clock rather than on its behaviour, and passed on
 * the next run because the first attempt had compiled it. Every route below
 * appears in a test; add to it when you add one.
 */
async function prewarm(browser) {
  const ctx = await browser.newContext();

  const asAdmin = await authedPage(ctx, 'ADMIN');
  for (const r of [
    '/admin', '/admin/subjects', '/admin/students', '/admin/attendance',
    '/admin/settings', '/admin/users', '/admin/library', '/admin/health',
    '/admin/pocket-money', '/admin/activities', '/admin/marks', '/admin/reports',
    '/login', '/this-route-does-not-exist-xyz',
  ]) {
    await visit(asAdmin, `${r}`, 90000).catch(() => {});
    await asAdmin.waitForTimeout(200);
  }

  const asStudent = await authedPage(ctx, 'STUDENT');
  for (const r of ['/student', '/student/marks']) {
    await visit(asStudent, `${r}`, 90000).catch(() => {});
  }

  // The welfare and library routes, which nothing else warms.
  const asPatron = await authedPage(ctx, 'PATRON');
  await visit(asPatron, `/boarding`, 90000).catch(() => {});

  const asNurse = await authedPage(ctx, 'NURSE');
  await visit(asNurse, `/nurse`, 90000).catch(() => {});

  const asLibrarian = await authedPage(ctx, 'LIBRARIAN');
  for (const r of ['/librarian', '/librarian/books', '/messages']) {
    await visit(asLibrarian, `${r}`, 90000).catch(() => {});
  }

  await ctx.close();
}

// ── MULTI-STEP FORMS ─────────────────────────────────────────────────────────

/**
 * The Add User wizard must walk all four student steps and create nobody
 * until the last one.
 *
 * This lives here rather than in the unit suite because the bug it guards
 * against cannot be reproduced in jsdom. Continue and Create User were one
 * DOM node whose `type` React swapped between renders, so the click that
 * advanced a step turned the element under the cursor into a submit button
 * and the browser posted the form. Only a real browser carries a click
 * through to a submission that way.
 */
test('form: Add User wizard reaches every student step without creating anyone', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');

  const posts = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/users(\?|$)/.test(r.url())) posts.push(r.url());
  });

  await visit(page, `/admin/users`, 60000);
  await page.getByRole('button', { name: /add user/i }).first().click();
  await page.waitForSelector('[role="dialog"]');

  // The rail marks the step you are on.
  const stepNow = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('span'))
      .filter((e) => e.className.includes('text-foreground') && e.className.includes('text-xs'))
      .map((e) => e.textContent.trim())
      .join('|'));

  const advance = async () => {
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.waitForTimeout(400);
  };

  await page.selectOption('[role="dialog"] select', 'STUDENT');

  // Account
  await page.fill('#firstName', 'Keza');
  await page.fill('#lastName', 'Mutesi');
  await page.fill('#email', `k.mutesi.${Date.now()}@markova.edu`);
  await page.fill('#password', 'Umunyeshuri2026!');
  await advance();
  assert((await stepNow()).includes('Academic'), 'Account should lead to Academic');

  // Academic - the class list only loads once a level is chosen.
  const selects = page.locator('[role="dialog"] select');

  // The levels arrive from the API after the step renders, and the classes
  // only after a level is chosen - and not every level has a class in it.
  // Waiting on a fixed level is therefore a wait that can never finish, so
  // each is tried until one yields classes.
  const optionCount = (i) =>
    page.evaluate(
      (n) => document.querySelectorAll('[role="dialog"] select')[n]?.options.length ?? 0,
      i,
    );

  await page.waitForFunction(
    () => (document.querySelectorAll('[role="dialog"] select')[0]?.options.length ?? 0) > 1,
    null,
    { timeout: 90000 },
  );

  const levels = await selects.nth(0).evaluate((el) =>
    Array.from(el.options).map((o) => o.value).filter(Boolean),
  );

  let chosen = null;
  for (const level of levels) {
    await selects.nth(0).selectOption(level);
    await page
      .waitForFunction(
        () => (document.querySelectorAll('[role="dialog"] select')[1]?.options.length ?? 0) > 1,
        null,
        { timeout: 15000 },
      )
      .catch(() => {});
    if ((await optionCount(1)) > 1) {
      chosen = level;
      break;
    }
  }
  assert(chosen, 'no class level in this school has a class in it');

  await selects
    .nth(1)
    .selectOption(await selects.nth(1).evaluate((el) => el.options[1].value));
  await selects.nth(2).selectOption('FEMALE').catch(() => {});
  await page.fill('#dateOfBirth', '2010-04-11').catch(() => {});
  await advance();
  assert((await stepNow()).includes('Identity'), 'Academic should lead to Identity & residence');

  // Identity & residence - the step the wizard used to submit from.
  await page.fill('#nationality', 'Rwandan').catch(() => {});
  await advance();
  assert(
    (await stepNow()).includes('Family & health'),
    'Identity & residence should lead to Family & health',
  );

  assert(posts.length === 0, `nothing should be created before the last step (saw ${posts.length})`);
  assert(await page.locator('[role="dialog"]').count() === 1, 'the wizard should still be open');

  // And no submit button anywhere in the form, on any step.
  const submits = await page.locator('[role="dialog"] form button[type="submit"]').count();
  assert(submits === 0, `the wizard form should hold no submit button (found ${submits})`);

  await ctx.close();
});

// ── THE WELFARE STAFF ────────────────────────────────────────────────────────

/**
 * The boarding staff and the nurse, signing in and finding their own work.
 *
 * Their roles existed for four days with the pages built and no account in
 * any seed that could reach them, so nobody had ever seen these screens.
 */
for (const [role, home, greeting] of [
  ['PATRON', '/boarding', 'Emmanuel'],
  ['MATRON', '/boarding', 'Beatrice'],
  ['NURSE', '/nurse', 'Claudine'],
]) {
  test(`welfare: ${role} lands on ${home} and it works`, async (browser) => {
    const ctx = await browser.newContext();
    const page = await authedPage(ctx, role);

    const refused = [];
    page.on('response', (r) => {
      if (r.status() === 403) refused.push(new URL(r.url()).pathname);
    });

    await visit(page, `${home}`, 60000);
    await page.waitForTimeout(1500);

    assert(new URL(page.url()).pathname === home, `${role} did not stay on ${home}`);

    const heading = (await page.locator('h1').first().textContent()) || '';
    assert(heading.includes(greeting), `${home} should greet ${greeting}, said "${heading}"`);

    const body = (await page.locator('body').textContent()) || '';
    assert(
      /sick bay|Every bed is free/i.test(body),
      `${home} should show the sick bay`,
    );

    // Nothing on their own dashboard may be refused to them.
    assert(refused.length === 0, `${role} was refused ${[...new Set(refused)].join(', ')}`);

    await ctx.close();
  });
}

/**
 * Their Dashboard link used to point at /admin, which the shell bounces them
 * straight back out of - an unclickable item on the first row of the sidebar.
 */
test('welfare: the sidebar Dashboard link goes somewhere they may go', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'MATRON');
  await visit(page, `/boarding`, 60000);
  await page.waitForTimeout(1200);

  const dashboard = page.getByRole('link', { name: /dashboard/i }).first();
  await dashboard.waitFor({ state: 'visible', timeout: 30000 });
  await dashboard.click();
  await page.waitForTimeout(1500);
  assert(
    new URL(page.url()).pathname === '/boarding',
    `Dashboard sent a matron to ${new URL(page.url()).pathname}`,
  );
  await ctx.close();
});

/**
 * The nurse recording a clinic visit has to find the student first, and the
 * only route that searches students was ADMIN-only - so the "New visit" form
 * had a student box that answered 403 on every keystroke.
 */
test('welfare: the nurse can find a student to record a visit against', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'NURSE');
  const refused = [];
  page.on('response', (r) => { if (r.status() === 403) refused.push(new URL(r.url()).pathname); });

  await visit(page, `/admin/health`, 60000);
  await page.getByRole('button', { name: /new visit/i }).first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.fill('#h-student', 'Rukundo');

  await page.waitForFunction(
    () => !(document.querySelector('[role="dialog"]')?.textContent || '').includes('Nobody by that name'),
    null,
    { timeout: 15000 },
  );

  const dialog = (await page.locator('[role="dialog"]').textContent()) || '';
  assert(/STD-/.test(dialog), 'the picker should list students');
  assert(refused.length === 0, `the nurse was refused ${[...new Set(refused)].join(', ')}`);
  await ctx.close();
});

/**
 * The catalogue said "No books found" over a library of 56: the endpoint
 * answers `{ data, meta }` and the page read `.length` off the envelope. Its
 * own header counted them correctly the whole time, from another endpoint, so
 * the page contradicted itself.
 */
test('librarian: the catalogue lists the books it says it has', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'LIBRARIAN');
  await visit(page, `/librarian/books`, 60000);
  await page.waitForTimeout(1500);

  const rows = await page.locator('tbody tr').count();
  const body = (await page.locator('body').textContent()) || '';
  assert(rows > 0, 'the catalogue should list books');
  assert(!body.includes('No books found'), 'the catalogue claimed to be empty');
  await ctx.close();
});

// ── MOTION ───────────────────────────────────────────────────────────────────

/**
 * The animations are real, and they come from the design tokens.
 *
 * Class names are cheap to assert and prove nothing: a typo in a keyframe
 * name, a token that never reached the stylesheet, or a rule the cascade
 * dropped all leave the markup looking correct and the app looking static.
 * This asks the browser what it computed.
 */
test('motion: the design tokens reach the browser and drive the animations', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, `/admin/users`);

  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      quick: s.getPropertyValue('--duration-quick').trim(),
      enter: s.getPropertyValue('--ease-enter').trim(),
    };
  });
  assert(tokens.quick !== '', 'the duration tokens never reached the stylesheet');
  assert(/cubic-bezier/.test(tokens.enter), 'the easing tokens never reached the stylesheet');

  const main = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#main-content'));
    return { name: cs.animationName, duration: cs.animationDuration };
  });
  assert(main.name === 'fade-in', `the page region should fade in, got ${main.name}`);
  assert(main.duration !== '0s', 'the page fade has no duration');

  await page.getByRole('button', { name: /add user/i }).first().click();
  await page.waitForSelector('[role="dialog"]');

  const dialog = await page.evaluate(() => {
    const panel = getComputedStyle(document.querySelector('[role="dialog"]'));
    const step = document.querySelector('[class*="motion-step-"]');
    return {
      panel: panel.animationName,
      step: step ? getComputedStyle(step).animationName : 'missing',
    };
  });
  assert(dialog.panel === 'panel-in', `the dialog should rise, got ${dialog.panel}`);
  assert(
    dialog.step.startsWith('slide-from-'),
    `the wizard step should slide, got ${dialog.step}`,
  );

  await ctx.close();
});

/**
 * And every one of them stops for somebody who has asked it to.
 *
 * The global `prefers-reduced-motion` rule is the whole accessibility story
 * for this feature, so it is worth asserting rather than assuming - it is one
 * `!important` away from silently not applying.
 */
test('motion: everything collapses for a reader who asked for less', async (browser) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, `/admin/users`);

  const durations = await page.evaluate(() => {
    const main = getComputedStyle(document.querySelector('#main-content')).animationDuration;
    return { main };
  });
  // The rule clamps to 0.01ms, which the browser reports as 1e-05s.
  assert(
    parseFloat(durations.main) < 0.001,
    `the page fade should be off, ran for ${durations.main}`,
  );

  await ctx.close();
});

/**
 * A dialog covers the whole application, not just the column it was opened
 * from.
 *
 * It used to be rendered where it was written - inside `<main>` - which was
 * fine until something above it created a stacking context. The page fade
 * animates opacity, which creates one, and the dialog was trapped: the
 * sidebar painted over its left edge and the backdrop dimmed only the middle
 * of the screen. Every unit test still passed, because in jsdom nothing
 * paints.
 */
test('modal: the backdrop covers the sidebar, not just the content', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, `/admin/users`);

  await page.getByRole('button', { name: /bulk import/i }).first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(500);

  const facts = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const dialog = document.querySelector('[role="dialog"]');
    // A point well inside the sidebar.
    const over = document.elementFromPoint(120, 400);
    return {
      escapedMain: !main.contains(dialog),
      onTopOfSidebar: (over?.className || '').includes('inset-0'),
    };
  });

  assert(facts.escapedMain, 'the dialog is still inside <main> and can be trapped');
  assert(facts.onTopOfSidebar, 'the sidebar paints over the backdrop');

  await ctx.close();
});

/**
 * Opening a thread lands on the end of it.
 *
 * It used to scroll smoothly, which aims at the scroll height as it was when
 * the animation began - while the thread was still wrapping its messages
 * underneath it. The last message came to rest half-hidden behind the
 * composer, which is not where any chat leaves you. jsdom lays nothing out,
 * so only a real browser can tell.
 */
test('messages: opening a thread lands on the last message', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, `/admin/messages`);

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('input[placeholder*="Type a message"]');
  await page.waitForTimeout(2000);

  const state = await page.evaluate(() => {
    const list = document.querySelector('.overflow-y-auto.px-4');
    if (!list) return null;
    const bubbles = list.querySelectorAll('.bubble');
    const last = bubbles[bubbles.length - 1];
    return {
      gap: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
      lastVisible: last
        ? last.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1
        : null,
      hasMessages: bubbles.length > 0,
    };
  });

  assert(state, 'the thread never rendered');
  assert(state.hasMessages, 'the thread has no messages to land on');
  // A couple of pixels of slack for sub-pixel layout, no more.
  assert(state.gap <= 2, `the thread stopped ${state.gap}px short of the bottom`);

  /*
    And it stays landed while the media settles. A photograph, a video or a
    voice note takes up no height until it has loaded, so a thread ending in
    one used to land two hundred pixels short of its own last message once the
    picture appeared.
  */
  await page.waitForTimeout(3000);
  const settled = await page.evaluate(() => {
    const list = document.querySelector('.overflow-y-auto.px-4');
    return {
      gap: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
      media:
        list.querySelectorAll('img').length +
        list.querySelectorAll('video').length +
        list.querySelectorAll('audio').length,
    };
  });
  assert(settled.gap <= 2,
    `after ${settled.media} attachments loaded the thread sat ${settled.gap}px short`);

  // But somebody who scrolled up to read is left where they are.
  await page.evaluate(() => {
    document.querySelector('.overflow-y-auto.px-4').scrollTop = 0;
  });
  await page.waitForTimeout(1500);
  const stayed = await page.evaluate(() =>
    Math.round(document.querySelector('.overflow-y-auto.px-4').scrollTop));
  assert(stayed <= 2, `a reader scrolled to the top was dragged to ${stayed}px`);
  assert(state.lastVisible, 'the last message is hidden behind the composer');

  await ctx.close();
});

// ── STUDENT MESSAGING ────────────────────────────────────────────────────────

/**
 * A student could only ever write to the staff.
 *
 * Not being able to message the person at the next desk is the complaint;
 * being able to search fourteen hundred children by name would be a different
 * problem. So a student reaches their own class and the staff, and these
 * assert both halves of that line.
 */
test('messaging: a student can reach their classmates and the staff', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'STUDENT');
  await visit(page, `/student/messages`);

  const contacts = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/messaging/contacts`, {
      headers: { authorization: `Bearer ${localStorage.getItem('access_token')}` },
    });
    const body = await res.json();
    return (body.data || []).map((c) => c.role);
  }, API);

  assert(contacts.length > 0, 'the student can reach nobody at all');
  assert(contacts.includes('STUDENT'), 'the student cannot reach a single classmate');
  assert(
    contacts.some((r) => r !== 'STUDENT'),
    'the student can no longer reach the staff',
  );
  assert(!contacts.includes('PARENT'), "a student can reach somebody else's parent");

  await ctx.close();
});

/**
 * The group a class already has.
 *
 * Nobody creates it and nobody is invited to it - it is made sure of when a
 * student's conversations are listed, which is the moment they would notice
 * it missing.
 */
test('messaging: a student has their class group without anyone making it', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'STUDENT');
  await visit(page, `/student/messages`);
  await page.waitForTimeout(1500);

  const group = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/messaging/conversations`, {
      headers: { authorization: `Bearer ${localStorage.getItem('access_token')}` },
    });
    const body = await res.json();
    const list = body.data || body;
    const classGroup = (list || []).find((c) => c.classSectionId);
    return classGroup
      ? { name: classGroup.name, members: classGroup.participants.length, type: classGroup.type }
      : null;
  }, API);

  assert(group, 'the student has no class group');
  assert(group.type === 'GROUP', `the class chat should be a group, was ${group.type}`);
  assert(group.name, 'the class group has no name');
  // The class, plus the adult who answers for it.
  assert(group.members >= 2, `the class group has only ${group.members} in it`);

  await ctx.close();
});

/**
 * The school-wide announcement tool stays where it was. A student sending to
 * four hundred families is not a feature.
 */
test('messaging: a student cannot broadcast to the school', async (browser) => {
  const ctx = await browser.newContext();
  const page = await authedPage(ctx, 'STUDENT');
  await visit(page, `/student/messages`);

  const status = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/messaging/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ audience: 'ALL_PARENTS', content: 'hello' }),
    });
    return res.status;
  }, API);

  assert(status === 403, `a student reached the school-wide broadcast (${status})`);
  await ctx.close();
});


/**
 * The composer offers a file and a voice note, and both are reachable by
 * keyboard. jsdom can render these; only a real browser can say whether they
 * are actually on the screen and clickable.
 */
test('chat: the composer offers a file and a voice note', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('input[placeholder*="Type a message"]');

  const state = await page.evaluate(() => {
    const seen = (label) => {
      const el = document.querySelector(`button[aria-label="${label}"]`);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    };
    return {
      attach: seen('Attach a file'),
      record: seen('Record a voice note'),
      // Only the types the API accepts, so the picker greys out the rest.
      accept: document.querySelector('input[type="file"]')?.getAttribute('accept') ?? null,
    };
  });

  assert(state.attach, 'there is no way to attach a file');
  assert(state.record, 'there is no way to record a voice note');
  assert(state.attach.width >= 24 && state.attach.height >= 24,
    `the attach control is ${state.attach.width}x${state.attach.height}, too small to hit`);
  assert(state.accept && state.accept.includes('video/mp4'),
    'the picker does not offer video');
  assert(state.accept && !state.accept.includes('svg'),
    'the picker offers SVG, which runs script when opened');
  await ctx.close();
});

/**
 * The shortcut every tool with a search box has. The browser's own Ctrl+K
 * focuses the address bar, so this only works if the page says it handled the
 * key - which is a thing only a real browser can prove.
 */
test('search: Cmd+K puts the cursor in the page search', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin');

  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(200);

  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? el.getAttribute('placeholder') : null;
  });
  assert(/search/i.test(focused ?? ''),
    `Cmd+K focused ${focused ?? 'nothing'} rather than the search box`);

  // And the shortcut is visible, because one nobody can see is one nobody uses.
  const shown = await page.evaluate(() =>
    (document.body.textContent ?? '').match(/\u2318K|Ctrl K/)?.[0] ?? null);
  assert(shown, 'the shortcut is nowhere on the screen');
  await ctx.close();
});

/**
 * The quietest of the three ways of being told a message arrived: a number
 * beside Messages that is there when you next look at the sidebar.
 */
test('messages: the sidebar says how many are waiting', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin');
  await page.waitForTimeout(1500);

  const badge = await page.evaluate(() => {
    const el = document.querySelector('[aria-label*="unread message"]');
    if (!el) return { present: false };
    const link = el.closest('a');
    return {
      present: true,
      says: (el.textContent ?? '').trim(),
      onMessages: (link?.getAttribute('href') ?? '').endsWith('/messages'),
    };
  });

  // Not every seed leaves an admin with unread messages, so an absent badge is
  // a legitimate state. What is not legitimate is a badge on the wrong row.
  if (badge.present) {
    assert(badge.onMessages, 'the unread count is beside something other than Messages');
    assert(/^\d+\+?$/.test(badge.says), `the count reads "${badge.says}"`);
  }
  await ctx.close();
});


/**
 * Generously rounded, with one corner squared off on the speaker's side.
 * That single square corner is what the eye reads as "which side said this".
 */
test('chat: bubbles are rounded and carry one arrow per run', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('.bubble');
  await page.waitForTimeout(1200);

  const shape = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('.bubble')];
    if (!bubbles.length) return null;
    const read = (el) => {
      const s = getComputedStyle(el);
      return {
        tl: parseFloat(s.borderTopLeftRadius),
        tr: parseFloat(s.borderTopRightRadius),
        bl: parseFloat(s.borderBottomLeftRadius),
        br: parseFloat(s.borderBottomRightRadius),
        squared: el.className.includes('bubble-tail'),
      };
    };
    return {
      all: bubbles.map(read),
      squaredCount: bubbles.filter((b) => b.className.includes('bubble-tail')).length,
      total: bubbles.length,
    };
  });

  assert(shape, 'no bubbles rendered');
  for (const b of shape.all) {
    // Rounded: the complaint was that they had gone square.
    assert(b.bl >= 12 && b.br >= 12, `a bubble's bottom corners are ${b.bl}/${b.br}px, not rounded`);
    if (b.squared) {
      // The corner the tail grows out of is squared so the triangle meets it.
      const tailCorner = Math.min(b.tl, b.tr);
      assert(tailCorner <= 4, `the tail's corner is ${tailCorner}px, so the arrow will not meet it`);
    } else {
      assert(b.tl >= 12 && b.tr >= 12, `a tailless bubble has a square top corner`);
    }
  }
  assert(shape.squaredCount > 0, 'no bubble carries a tail');
  assert(shape.squaredCount <= shape.total, 'more tails than bubbles');

  // The arrow itself, drawn as a triangle off that corner.
  const arrow = await page.evaluate(() => {
    const tailed = document.querySelector('.bubble-tail-start, .bubble-tail-end');
    if (!tailed) return null;
    const before = getComputedStyle(tailed, '::before');
    return { content: before.content, clip: before.clipPath, width: before.width };
  });
  assert(arrow, 'no tailed bubble to inspect');
  assert(arrow.clip && arrow.clip !== 'none', 'the tail has no triangle clip-path');
  await ctx.close();
});

/**
 * The reply control used to sit once under a whole run, which left the
 * earlier of two consecutive messages unanswerable.
 */
test('chat: every message has its own reply control', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('.bubble');
  await page.waitForTimeout(1200);

  const counted = await page.evaluate(() => ({
    bubbles: document.querySelectorAll('.bubble').length,
    replies: document.querySelectorAll('button[aria-label^="Reply to"]').length,
  }));

  assert(counted.bubbles > 0, 'the thread has no messages');
  assert(
    counted.replies === counted.bubbles,
    `${counted.bubbles} messages but ${counted.replies} reply controls`,
  );
  await ctx.close();
});

/**
 * A term report answers "how was this term". The last term of a year offers
 * the other question too, without a page of its own to reach it from.
 */
test('reports: the last term of a year can be read as the whole year', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/reports');

  // The Year tab is gone; the choice lives on the report card filters.
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => b.textContent.trim()),
  );
  assert(!tabs.includes('The Year'), 'the Year tab is still there');

  const years = page.locator('select[aria-label="Academic year"]');
  const yearOptions = await years.locator('option').all();
  if (yearOptions.length < 2) {
    await ctx.close();
    return;
  }
  await years.selectOption({ index: 1 });
  await page.waitForTimeout(900);

  const termSelect = page.locator('select[aria-label="Term"]');
  const terms = await termSelect.locator('option').all();
  if (terms.length < 2) {
    await ctx.close();
    return;
  }

  // The last term of the year is the one that offers it.
  await termSelect.selectOption({ index: terms.length - 1 });
  await page.waitForTimeout(400);
  const onLast = await page.evaluate(() =>
    /ends the year/i.test(document.body.textContent || ''),
  );
  assert(onLast, 'the last term does not offer the whole-year choice');

  // An earlier one does not.
  if (terms.length > 2) {
    await termSelect.selectOption({ index: 1 });
    await page.waitForTimeout(400);
    const onFirst = await page.evaluate(() =>
      /ends the year/i.test(document.body.textContent || ''),
    );
    assert(!onFirst, 'an earlier term is offering the whole-year choice');
  }
  await ctx.close();
});

/** The discipline mark moved out of the summary strip and into the table. */
test('reports: a report card carries discipline as a row, above the subjects', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  // localStorage is denied on about:blank, so land on a real page first.
  await visit(page, '/admin/reports');

  const html = await page.evaluate(async (api) => {
    const token = localStorage.getItem('access_token');
    const terms = await (
      await fetch(`${api}/academic/terms`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    const term = (terms.data ?? terms)[0];
    const students = await (
      await fetch(`${api}/users?role=STUDENT&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const studentId = (students.data ?? students)[0]?.student?.id;
    if (!studentId || !term?.id) return null;
    const res = await fetch(
      `${api}/reports/term/${studentId}/html?termId=${term.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.ok ? await res.text() : null;
  }, API);

  if (!html) {
    // No published card for this student and term; nothing to assert against.
    await ctx.close();
    return;
  }

  assert(/Discipline/.test(html), 'the card carries no discipline row');
  const disciplineAt = html.indexOf('Discipline');
  const firstGroup = Math.min(
    ...['Core subjects', 'General modules']
      .map((g) => html.indexOf(g))
      .filter((i) => i >= 0),
  );
  assert(
    !Number.isFinite(firstGroup) || disciplineAt < firstGroup,
    'discipline is not above the first group of subjects',
  );
  await ctx.close();
});


/**
 * A corner nested inside another looks right when the gap between the two
 * curves stays constant, which means outer = inner + padding. It cannot hold
 * on both axes unless the padding is equal on both axes, which is why these
 * two are checked together.
 */
test('chat: a bubble sits concentric with what it holds', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('.bubble');
  await page.waitForTimeout(1500);

  const geo = await page.evaluate(() => {
    const px = (v) => parseFloat(v);
    const bubble = [...document.querySelectorAll('.bubble')].find((b) => b.querySelector('figure'))
      || document.querySelector('.bubble');
    if (!bubble) return null;
    const s = getComputedStyle(bubble);
    const inner = bubble.querySelector('figure');
    return {
      padding: {
        top: px(s.paddingTop), right: px(s.paddingRight),
        bottom: px(s.paddingBottom), left: px(s.paddingLeft),
      },
      outer: px(s.borderBottomLeftRadius),
      inner: inner ? px(getComputedStyle(inner).borderTopLeftRadius) : null,
    };
  });

  assert(geo, 'no bubbles rendered');

  const { top, right, bottom, left } = geo.padding;
  assert(
    top === right && right === bottom && bottom === left,
    `the bubble's padding is ${top}/${right}/${bottom}/${left}, not equal on both axes`,
  );

  if (geo.inner !== null) {
    const wanted = geo.inner + top;
    assert(
      Math.abs(geo.outer - wanted) <= 1,
      `outer radius is ${geo.outer}px; inner ${geo.inner}px plus ${top}px of padding wants ${wanted}px`,
    );
  }
  await ctx.close();
});

/**
 * One control at the end of the composer, and it is whichever one you mean.
 * Two side by side would make you choose every time, when the state of the
 * field has already chosen.
 */
test('chat: the composer offers record or send, never both', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  const field = 'input[placeholder*="Type a message"]';
  await page.waitForSelector(field);
  await page.waitForTimeout(800);

  const shown = () =>
    page.evaluate(() => ({
      mic: !!document.querySelector('button[aria-label="Record a voice note"]'),
      send: !!document.querySelector('button[aria-label="Send message"]'),
    }));

  const empty = await shown();
  assert(empty.mic && !empty.send, 'an empty field should offer the microphone alone');

  // A stray space is not a message, and must not take the microphone away.
  await page.fill(field, '   ');
  await page.waitForTimeout(250);
  const spaces = await shown();
  assert(spaces.mic && !spaces.send, 'spaces alone should still offer the microphone');

  await page.fill(field, 'Muraho');
  await page.waitForTimeout(250);
  const typed = await shown();
  assert(typed.send && !typed.mic, 'a typed message should offer Send alone');

  await page.fill(field, '');
  await page.waitForTimeout(250);
  const cleared = await shown();
  assert(cleared.mic && !cleared.send, 'clearing the field should bring the microphone back');
  await ctx.close();
});


/**
 * A thread is something you link somebody to, reload, and come back to from a
 * notification. All three want a real address rather than a query string on a
 * page that is otherwise identical for every conversation.
 */
test('chat: a conversation has an address of its own', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('input[placeholder*="Type a message"]');
  await page.waitForTimeout(800);

  const opened = new URL(page.url()).pathname;
  assert(
    /^\/messages\/[0-9a-f-]{36}$/.test(opened),
    `opening a thread gave ${opened}, not /messages/<id>`,
  );
  assert(!page.url().includes('?conversation='), 'the query string is still there');

  // And that address stands on its own: loaded cold it opens the same thread.
  await visit(page, opened);
  const survived = await page.evaluate(
    () => !!document.querySelector('input[placeholder*="Type a message"]'),
  );
  assert(survived, 'the thread does not survive a reload of its own URL');
  await ctx.close();
});

/**
 * School fees, and the results they hold up.
 *
 * The gate is the consequential part of this feature: it decides whether a
 * child is shown their own record. So it is checked from both sides - that a
 * family behind on the term is told so, in a way they can act on, and that
 * the same term opens for the office that has to read it either way.
 */
test('fees: the register lists every student, not every class', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'BURSAR');
  await visit(page, '/admin/finance');
  /*
    A real row, not the first `tbody tr`: the table draws its empty state as a
    row too, so waiting for any row at all catches the page mid-load and reads
    "no students found" as the answer.
  */
  await page.waitForSelector('tbody tr:has-text("STD-")', { timeout: 30000 });

  const rows = await page.locator('tbody tr').count();
  assert(rows > 1, `the register showed ${rows} rows`);

  // A student number on every row is what makes it a roll of people rather
  // than a summary of classes.
  const first = await page.locator('tbody tr').first().innerText();
  assert(/STD-/.test(first), `no student number in the first row: ${first}`);
  assert(/RWF/.test(first), `no amount in the first row: ${first}`);

  const body = await page.innerText('body');
  for (const heading of ['Billed this term', 'Collected', 'Waived', 'Still outstanding']) {
    assert(body.includes(heading), `the summary is missing "${heading}"`);
  }
  await ctx.close();
});

/**
 * Biggest debts first.
 *
 * A bursar opens this page to find out who to chase, and alphabetical order
 * buries the handful of families owing two hundred thousand among six hundred
 * who owe nothing. Checked against the real roll rather than a fixture,
 * because the ordering is worked out over every student in the school.
 */
test('fees: the register puts the biggest debts at the top', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'BURSAR');
  await visit(page, '/admin/finance');
  await page.waitForSelector('tbody tr:has-text("STD-")', { timeout: 30000 });

  // The balance is the fifth cell, written as "93,500 RWF".
  const balances = await page.$$eval('tbody tr', (rows) =>
    rows
      .map((r) => r.querySelectorAll('td')[4]?.innerText ?? '')
      .filter((t) => /RWF/.test(t))
      .map((t) => Number(t.replace(/[^0-9]/g, ''))),
  );
  assert(balances.length > 5, `only read ${balances.length} balances`);
  assert(balances[0] > 0, 'the first row owes nothing, so nothing is being chased');
  for (let i = 1; i < balances.length; i++) {
    assert(
      balances[i] <= balances[i - 1],
      `row ${i} owes ${balances[i]}, above it owes ${balances[i - 1]}`,
    );
  }
  await ctx.close();
});

test('fees: the price list says a boarder and a day student pay differently', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'BURSAR');
  await visit(page, '/admin/finance/structure');
  await page.waitForSelector('text=Boarder pays', { timeout: 30000 });

  const body = await page.innerText('body');
  assert(body.includes('Day student pays'), 'no day total on the price list');
  // The reassurance that makes this safe to edit mid-term.
  assert(
    /prices, not bills/i.test(body),
    'the price list does not say it is prices rather than bills',
  );
  await ctx.close();
});

/**
 * The gate itself, from the family's side.
 *
 * `student1` is seeded behind on the current term precisely so this can be
 * checked: their older terms are settled and open, and the live one is held.
 */
test('fees: a student behind on the term is told why, and by how much', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'STUDENT');

  await visit(page, '/student/fees');
  await page.waitForSelector('text=Every term', { timeout: 30000 });
  const fees = await page.innerText('body');
  assert(/results are held/i.test(fees), 'the fees page does not mention held results');
  assert(/RWF/.test(fees), 'the fees page shows no amount');

  await visit(page, '/student/marks');
  await page.waitForFunction(
    () => /held until the school fees are settled|Subject Breakdown|not been released/i.test(document.body.innerText),
    null,
    { timeout: 30000 },
  );
  const marks = await page.innerText('body');
  assert(
    /held until the school fees are settled/i.test(marks),
    'a held term does not say so on the marks page',
  );
  // Told, not merely blocked: the amount and the way on are both here.
  assert(/RWF/.test(marks), 'the held notice names no amount');
  assert(/See what is owed/i.test(marks), 'the held notice offers no way on');
  await ctx.close();
});

// Staff are never held. A school whose teachers cannot read its own marks
// because a family is behind cannot run.
test('fees: money never stops staff reading a mark book', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'TEACHER');
  await visit(page, '/teacher/marks');
  const body = await page.innerText('body');
  assert(
    !/held until the school fees are settled/i.test(body),
    'a teacher was shown a fee hold',
  );
  await ctx.close();
});

/**
 * Opening a thread must not rebuild the screen around it.
 *
 * The address is written with the History API rather than pushed through the
 * router, and the shell keys its fade on the route rather than on the URL.
 * With either of those undone, clicking a conversation destroyed the whole
 * messaging surface and faded a fresh one in - the flash people reported,
 * and with it the scroll position and anything half written in the composer.
 *
 * Checked by marking the surface and looking for the mark again: a mark that
 * survives is the same element, which is the only proof that the page was
 * kept rather than rebuilt to look the same.
 */
test('chat: opening a thread keeps the screen it is on', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/messages');

  const surface = 'div.flex.min-h-0.flex-1.overflow-hidden';
  await page.waitForSelector(surface);
  await page.evaluate((sel) => {
    document.querySelector(sel).dataset.kept = 'yes';
  }, surface);

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('input[placeholder*="Type a message"]');
  await page.waitForTimeout(1200);

  assert(
    (await page.locator('[data-kept="yes"]').count()) === 1,
    'the messaging surface was torn down and rebuilt when a thread was opened',
  );
  await ctx.close();
});

/**
 * Focus is easily lost - you click a message to reply, scroll, come back from
 * another tab - and then the first thing you type disappears.
 */
test('chat: typing anywhere lands in the message field', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  const field = 'input[placeholder*="Type a message"]';
  await page.waitForSelector(field);
  await page.waitForTimeout(800);

  // Opening a thread should already have put the cursor there.
  assert(
    await page.evaluate((s) => document.activeElement === document.querySelector(s), field),
    'opening a thread did not focus the field',
  );

  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('x');
  await page.waitForTimeout(300);
  assert(
    await page.evaluate((s) => document.activeElement === document.querySelector(s), field),
    'typing did not bring focus back to the field',
  );

  // A shortcut is not typing.
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(300);
  assert(
    !(await page.evaluate((s) => document.activeElement === document.querySelector(s), field)),
    'a shortcut was treated as typing',
  );
  await ctx.close();
});


/**
 * A cold load of a thread's own URL brings every attachment in at once and
 * pushes the end of the conversation thousands of pixels away. A refresh has
 * to land on the last message, not the first.
 */
test('chat: a refreshed thread lands on its newest message', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('input[placeholder*="Type a message"]');
  await page.waitForTimeout(800);

  // Straight to the thread's own URL, the way a refresh arrives.
  const threadUrl = new URL(page.url()).pathname;
  await visit(page, threadUrl);
  await page.waitForSelector('.bubble');
  await page.waitForTimeout(3500);

  const landed = await page.evaluate(() => {
    const l = document.querySelector('.overflow-y-auto.px-4');
    if (!l) return null;
    return {
      gap: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight),
      media: l.querySelectorAll('img,video,audio').length,
    };
  });
  assert(landed, 'the thread never rendered');
  assert(
    landed.gap <= 2,
    `a refresh left the thread ${landed.gap}px short, with ${landed.media} attachments in it`,
  );
  await ctx.close();
});

/**
 * A rounded rectangle splices an arc onto a straight edge, and the join is a
 * real discontinuity. `corner-shape: squircle` eases the curvature in.
 */
test('chat: bubbles carry squircle corners where supported', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/messages');

  await page
    .locator('button')
    .filter({ hasText: /Linda|Aaron|Dieudonne|Aline/ })
    .first()
    .click();
  await page.waitForSelector('.bubble');
  await page.waitForTimeout(1200);

  const shape = await page.evaluate(() => {
    if (!CSS.supports('corner-shape', 'squircle')) return 'unsupported';
    const b = document.querySelector('.bubble');
    return getComputedStyle(b).getPropertyValue('corner-shape').trim();
  });

  // Purely additive: a browser without the property keeps the plain radius,
  // and there is nothing to assert there.
  if (shape === 'unsupported') {
    await ctx.close();
    return;
  }
  assert(shape === 'squircle', `a bubble's corner-shape is "${shape}"`);
  await ctx.close();
});

// ── runner ───────────────────────────────────────────────────────────────────
/**
 * Admissions.
 *
 * A registration desk is only worth anything if a reviewer can tell, without
 * opening anything, which applications they can decide today. That is what
 * the two figures on a row are for: how complete it is, and how long it has
 * been sitting. Both are checked here against the seeded roll rather than a
 * fixture, because both are worked out over every application in the round.
 */
test('admissions: the queue says how complete each application is, and how long it has waited', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/admissions');
  await page.waitForSelector('a[href^="/admin/admissions/"]:has-text("APP-")', {
    timeout: 30000,
  });

  const row = await page
    .locator('a[href^="/admin/admissions/"]:has-text("APP-")')
    .first()
    .innerText();
  assert(/APP-\d{4}-\d+/.test(row), `no reference on the row: ${row}`);
  assert(/of \d+ documents|missing \d+|to check/.test(row), `no completeness on the row: ${row}`);
  assert(/ago|expires|today/.test(row), `no clock on the row: ${row}`);

  // An outstanding offer is a place spent, so the number that decides whether
  // the school can offer at all is places LEFT.
  const body = await page.innerText('body');
  assert(/of \d+ left/.test(body), 'the desk does not say how many places are left');
  await ctx.close();
});

/**
 * The whole decision on one screen.
 *
 * A reviewer who has to click through tabs to find the guardian's number, the
 * documents and the reason the last person gave will decide without them.
 */
test('admissions: one application shows the child, the family, the documents and the trail', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/admissions');
  await page.waitForSelector('a[href^="/admin/admissions/"]:has-text("APP-")', {
    timeout: 30000,
  });
  await page.locator('a[href^="/admin/admissions/"]:has-text("APP-")').first().click();
  await page.waitForSelector('text=The applicant', { timeout: 30000 });

  const body = await page.innerText('body');
  for (const heading of ['The applicant', 'The family', 'Documents']) {
    assert(body.includes(heading), `the application is missing "${heading}"`);
  }
  // The number is dialled off this screen, so it has to be a link.
  assert(
    (await page.locator('a[href^="tel:+250"]').count()) > 0,
    'the guardian phone is not callable',
  );
  await ctx.close();
});

/**
 * Nothing moves without a reason.
 *
 * "Why was my child turned away" is a question a school will be asked, and
 * the answer has to have been written down at the moment it was decided.
 */
test('admissions: an application cannot be turned down without a reason', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await authedPage(ctx, 'ADMIN');
  await visit(page, '/admin/admissions');
  await page.waitForSelector('a[href^="/admin/admissions/"]:has-text("APP-")', {
    timeout: 30000,
  });
  await page.locator('a[href^="/admin/admissions/"]:has-text("APP-")').first().click();
  await page.waitForSelector('text=The applicant', { timeout: 30000 });

  await page.getByRole('button', { name: /Turn down/ }).first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  const confirm = page
    .locator('[role="dialog"]')
    .getByRole('button', { name: /^Turn down$/ });
  assert(await confirm.isDisabled(), 'an application can be turned down with no reason');
  await ctx.close();
});

/**
 * The family's side.
 *
 * Reached without an account, so it is proved by something only the family
 * knows, and a wrong answer says only that nothing matched: two different
 * answers would let anybody holding a reference confirm a child's birthday by
 * guessing at it.
 */
test('admissions: a family checks on their own application without an account', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await visit(page, '/admissions');
  /*
    Filled until it takes. This page is served before React attaches to it,
    and text typed into that window sits in the box without ever reaching the
    state the button reads, so the button stays disabled and the test waits
    on a click that can never happen. Retrying the fill is what makes the
    difference between a real assertion and a race.
  */
  const check = page.getByRole('button', { name: /Check/ }).first();
  await check.waitFor({ state: 'visible', timeout: 30000 });
  for (let i = 0; i < 30 && (await check.isDisabled()); i++) {
    /* Emptied first: a box already carrying the text from a fill that landed
       before React attached is one `fill` will consider done and skip. */
    await page.getByLabel(/Application reference/i).fill('');
    await page.getByLabel(/Application reference/i).fill('APP-2026-0000');
    await page.getByLabel(/date of birth/i).fill('');
    await page.getByLabel(/date of birth/i).fill('2013-04-02');
    await page.waitForTimeout(500);
  }
  assert(!(await check.isDisabled()), 'the lookup never became usable');
  await check.click();
  await page.waitForFunction(
    () => /No application matches/i.test(document.body.innerText),
    { timeout: 20000 },
  );
  await ctx.close();
});

/**
 * The public form is reachable and says what it will ask for before it asks.
 */
test('admissions: the public form names the documents before a family starts', async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await visit(page, '/admissions/apply');
  // The form itself, not merely the header the page paints first.
  await page.waitForSelector('text=Family name', { timeout: 30000 });
  const body = await page.innerText('body');
  assert(/birth certificate/i.test(body), 'the form does not say a birth certificate is needed');
  assert(/photograph/i.test(body), 'the form does not mention a photograph');
  await ctx.close();
});


(async () => {
  const only = process.argv[2]; // optional substring filter
  const browser = await chromium.launch({ headless: true });
  if (!only) { process.stdout.write('  (pre-warming dev routes...)\n'); await prewarm(browser); }
  let pass = 0, fail = 0;
  const failures = [];
  const flaky = [];

  /*
    One retry, reported rather than hidden.

    This suite runs against a dev server that compiles on demand and serves
    one request at a time, and fifty-odd tests will occasionally starve one of
    them: the failure is always "waiting for a page that has not been served
    yet", and it moves to a different test on every run. Pages that fail this
    way load in under a second when asked on their own.

    Retrying quietly would turn a real regression into an intermittent one
    nobody chases. So a test that passes second time is counted as passed and
    named at the end as flaky - the suite stays green and stays honest about
    which tests it had to ask twice.
  */
  for (const t of tests) {
    if (only && !t.name.includes(only)) continue;
    try {
      await t.fn(browser);
      console.log(`  PASS  ${t.name}`);
      pass++;
      continue;
    } catch (first) {
      try {
        await t.fn(browser);
        console.log(`  PASS  ${t.name}  (on retry)`);
        pass++;
        flaky.push(`${t.name} - first attempt: ${first.message.split('\n')[0]}`);
      } catch (e) {
        console.log(`  FAIL  ${t.name}\n        ${e.message}`);
        fail++;
        failures.push(t.name);
      }
    }
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed, ${tests.length} total`);
  if (flaky.length) {
    console.log(`\n${flaky.length} needed a second attempt:\n - ` + flaky.join('\n - '));
  }
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
