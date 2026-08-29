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

  console.log('browser:', await page.evaluate(() => navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0]));
  console.log('supports corner-shape :', await page.evaluate(() => CSS.supports('corner-shape', 'squircle')));
  console.log('supports superellipse :', await page.evaluate(() => CSS.supports('corner-shape', 'superellipse(4)')));

  // Land straight on a thread URL, the way a refresh does.
  await page.goto(`${process.env.WEB}/messages/5d3d7c27-e5ad-4e8c-990f-3f8e45356df3`, { waitUntil: 'domcontentloaded' });
  for (const wait of [1500, 1500, 2000, 3000]) {
    await page.waitForTimeout(wait);
    console.log(JSON.stringify(await page.evaluate(() => {
      const l = document.querySelector('.overflow-y-auto.px-4');
      if (!l) return { thread: 'not rendered yet' };
      return {
        gapFromBottom: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight),
        scrollHeight: l.scrollHeight,
        media: l.querySelectorAll('img,video,audio').length,
      };
    })));
  }
  await browser.close();
})();
