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
  await page.goto(`${process.env.WEB}/messages`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Watch the thread element identity across a click, to see remounting.
  await page.evaluate(() => {
    window.__mounts = 0;
    const seen = new WeakSet();
    window.__watch = setInterval(() => {
      const l = document.querySelector('.overflow-y-auto.px-4');
      if (l && !seen.has(l)) { seen.add(l); window.__mounts += 1; }
    }, 40);
  });

  await page.locator('button').filter({ hasText: /Aline/ }).first().click();
  await page.waitForTimeout(3500);
  console.log('distinct thread elements after opening a chat:', await page.evaluate(() => window.__mounts));

  const state = async (label) => console.log(label, JSON.stringify(await page.evaluate(() => {
    const l = document.querySelector('.overflow-y-auto.px-4');
    return {
      gap: l ? Math.round(l.scrollHeight - l.scrollTop - l.clientHeight) : null,
      clientHeight: l ? l.clientHeight : null,
      jumpButton: !!document.querySelector('button[aria-label="Jump to the newest message"]'),
    };
  })));

  await state('at rest        :');
  const list = await page.$('.overflow-y-auto.px-4');
  await list.hover();
  for (const amount of [200, 300, 500, 1000]) {
    await page.evaluate((l) => { l.scrollTop = l.scrollHeight; }, list);
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, -amount);
    await page.waitForTimeout(700);
    await state(`after scrolling up ${String(amount).padStart(4)}px :`);
  }
  await browser.close();
})();
