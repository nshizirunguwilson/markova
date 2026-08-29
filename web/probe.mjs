import { chromium } from 'playwright';
const API='http://localhost:3000/api', WEB='http://localhost:3001';
async function login(email, password='Password123!') {
  const r1 = await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const d1 = await r1.json();
  if (d1.sessionId) {
    const r2 = await fetch(`${API}/auth/verify-otp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:d1.sessionId,otp:d1.devOtp})});
    return await r2.json();
  }
  return d1;
}
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } });
const t = await login('headteacher@markova.edu');
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0,160)));
await p.addInitScript(x => { localStorage.setItem('access_token', x.accessToken); localStorage.setItem('refresh_token', x.refreshToken); }, t);

await p.goto(`${WEB}/admin/report-cards`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('select#rc-level', { timeout: 30000 });
// Retry the fill until React has attached.
for (let i=0;i<20;i++){
  await p.selectOption('#rc-level', { index: 1 });
  await p.waitForTimeout(400);
  const opts = await p.$$eval('#rc-section option', o=>o.length);
  if (opts > 1) break;
}
await p.selectOption('#rc-section', { index: 1 });
await p.waitForTimeout(3500);
console.log('BODY\n' + (await p.innerText('body')).slice(0, 1600));
await p.screenshot({ path: '/tmp/shot-rc.png', fullPage: false });
console.log('\nsaved /tmp/shot-rc.png');
await b.close();
