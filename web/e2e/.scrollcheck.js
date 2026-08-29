const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  let body = await (await page.request.post(`${process.env.API}/auth/login`, {
    data: { email: 'wilsonshizirungu@gmail.com', password: 'Password123!' },
  })).json();
  if (body.requiresOtp) {
    body = await (await page.request.post(`${process.env.API}/auth/verify-otp`, {
      data: { sessionId: body.sessionId, otp: body.devOtp },
    })).json();
  }
  await page.goto(`${process.env.WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([t, u]) => {
    localStorage.setItem('access_token', t);
    localStorage.setItem('user', JSON.stringify(u));
  }, [body.accessToken, body.user]);
  await page.goto(`${process.env.WEB}/messages/5d3d7c27-e5ad-4e8c-990f-3f8e45356df3`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const list = await page.$('.overflow-y-auto.px-4');
  console.log('landed at bottom      :', await page.evaluate((l) =>
    Math.round(l.scrollHeight - l.scrollTop - l.clientHeight) === 0, list));

  // A real wheel gesture upward must take control back.
  await list.hover();
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(1200);
  const after = await page.evaluate((l) => Math.round(l.scrollTop), list);
  console.log('reader scrolled up to :', after, after < 1500 ? '(stayed up ✓)' : '(was dragged back ✗)');
  await page.waitForTimeout(2000);
  console.log('still there a moment later:', await page.evaluate((l) => Math.round(l.scrollTop), list));
  await browser.close();
})();
