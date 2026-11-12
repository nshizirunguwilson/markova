import { JwtService } from '@nestjs/jwt';
import { addressTracker, throttleTracker } from './tracker';

describe('who a request counts against', () => {
  const secrets = { access: 'access-secret', refresh: 'refresh-secret' };
  const track = throttleTracker(secrets);
  const jwt = new JwtService();
  const token = (sub: string, secret: string, expiresIn = '15m') =>
    jwt.sign({ sub }, { secret, expiresIn: expiresIn as never });
  const lab = { ip: '197.243.18.40' };

  /* The finding: everybody behind the school's router shared one count, so
     two sessions on one computer signed the matron out. */
  it('counts two people on one address separately', async () => {
    const matron = await track({
      ...lab,
      headers: { authorization: `Bearer ${token('u-matron', secrets.access)}` },
    });
    const nurse = await track({
      ...lab,
      headers: { authorization: `Bearer ${token('u-nurse', secrets.access)}` },
    });
    expect(matron).toBe('person:u-matron');
    expect(nurse).toBe('person:u-nurse');
  });

  it('counts a refresh against the person refreshing', async () => {
    const key = await track({
      ...lab,
      headers: {},
      body: { refreshToken: token('u-matron', secrets.refresh) },
    });
    expect(key).toBe('person:u-matron');
  });

  it('still knows who an expired token belongs to', async () => {
    const expired = jwt.sign(
      { sub: 'u-1', exp: Math.floor(Date.now() / 1000) - 60 },
      { secret: secrets.access },
    );
    expect(
      await track({ ...lab, headers: { authorization: `Bearer ${expired}` } }),
    ).toBe('person:u-1');
  });

  // Otherwise a made up token per request would be a fresh allowance each.
  it('does not believe a token it did not sign', async () => {
    const forged = token('u-anyone', 'not-our-secret');
    expect(
      await track({ ...lab, headers: { authorization: `Bearer ${forged}` } }),
    ).toBe('ip:197.243.18.40');
  });

  it('counts a sign in against the address and the account', async () => {
    const a = await track({
      ...lab,
      headers: {},
      body: { email: 'Student1@markova.edu', password: 'x' },
    });
    const b = await track({
      ...lab,
      headers: {},
      body: { email: 'student2@markova.edu', password: 'x' },
    });
    expect(a).toBe('ip:197.243.18.40:who:student1@markova.edu');
    expect(b).not.toBe(a);
  });

  it('counts an OTP against its sign in session', async () => {
    expect(
      await track({
        ...lab,
        headers: {},
        body: { sessionId: 'sess-9', otp: '123456' },
      }),
    ).toBe('ip:197.243.18.40:who:sess-9');
  });

  it('falls back to the address when nothing says who', async () => {
    expect(await track({ ...lab, headers: {} })).toBe('ip:197.243.18.40');
    expect(await addressTracker({ ...lab })).toBe('ip:197.243.18.40');
  });

  it('uses the first forwarded address behind the proxy', async () => {
    expect(
      await addressTracker({ ip: '10.0.0.2', ips: ['41.186.0.9', '10.0.0.2'] }),
    ).toBe('ip:41.186.0.9');
  });
});
