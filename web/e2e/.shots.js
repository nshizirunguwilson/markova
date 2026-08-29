const { chromium } = require('playwright');
const OUT = process.env.OUT;
const ACCOUNTS = {
  BURSAR: { email: 'bursar@markova.edu', password: 'Password123!' },
  STUDENT: { email: 'student1@markova.edu', password: 'Password123!' },
  ADMIN: { email: 'wilsonshizirungu@gmail.com', password: 'Password123!' },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(page, role) {
  for (let i = 0; i < 6; i++) {
    let r = await (await page.request.post(`${process.env.API}/auth/login`, { data: ACCOUNTS[role] })).json();
    if (r.sessionId) {
      r = await (await page.request.post(`${process.env.API}/auth/verify-otp`, {
        data: { sessionId: r.sessionId, otp: r.devOtp },
      })).json();
    }
    if (r.accessToken) return r;
    await wait(15000);
  }
  throw new Error('login failed for ' + role);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [role, routes] of Object.entries({
    BURSAR: [['/admin/finance', 'register'], ['/admin/finance/structure', 'structure']],
    STUDENT: [['/student/fees', 'student-fees'], ['/student/marks', 'student-marks']],
  })) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const tok = await login(page, role);
    await page.goto(`${process.env.WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([t, u]) => {
      localStorage.setItem('access_token', t.accessToken);
      localStorage.setItem('refresh_token', t.refreshToken);
      localStorage.setItem('user', JSON.stringify(u));
    }, [tok, tok.user]);
    for (const [route, name] of routes) {
      await page.goto(`${process.env.WEB}${route}`, { waitUntil: 'domcontentloaded' })
        .catch(() => page.goto(`${process.env.WEB}${route}`, { waitUntil: 'commit' }));
      await page.waitForFunction(
        () => (document.body?.innerText || '').trim().length > 0 && !document.querySelector('.animate-spin'),
        null, { timeout: 40000 },
      ).catch(() => {});
      await wait(2500);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      console.log(name, '->', new URL(page.url()).pathname, '|', (await page.title()) || '(no title)');
    }
    await ctx.close();
  }
  await browser.close();
})();
