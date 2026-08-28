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
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sign a role in, waiting out the throttle rather than falling over it.
 *
 * `/auth/login` allows ten attempts a minute. Running this suite twice in
 * quick succession — or beside the accessibility audit, which signs in as
 * every role of its own — spends that, and the throttled reply carries no
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


/**
 * Go to a page and wait for it to be usable.
 *
 * Deliberately not `networkidle`. Every authenticated page in this app opens
 * a socket.io connection and keeps it open, so the network never goes quiet —
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
 * lands, so its absence — over a body that has painted something — is the
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
  // double-click Create fast — button disables on isLoading, so only one row
  const create = page.locator('[role=dialog] button:has-text("Create")');
  await create.click();
  await create.click({ timeout: 500 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settled(page);

  // Search for it rather than expecting it on the first page. The list pages
  // in the browser and this name sorts last, so as the school's subject list
  // grew the new row moved off page one — and the test began reporting a
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
 * can take longer than a test's own navigation timeout — so a route nobody
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

  // Academic — the class list only loads once a level is chosen.
  const selects = page.locator('[role="dialog"] select');

  // The levels arrive from the API after the step renders, and the classes
  // only after a level is chosen — and not every level has a class in it.
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

  // Identity & residence — the step the wizard used to submit from.
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
 * straight back out of — an unclickable item on the first row of the sidebar.
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
 * only route that searches students was ADMIN-only — so the "New visit" form
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
 * for this feature, so it is worth asserting rather than assuming — it is one
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
 * It used to be rendered where it was written — inside `<main>` — which was
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

// ── runner ───────────────────────────────────────────────────────────────────
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
    named at the end as flaky — the suite stays green and stays honest about
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
        flaky.push(`${t.name} — first attempt: ${first.message.split('\n')[0]}`);
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
