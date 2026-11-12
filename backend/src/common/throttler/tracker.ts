import { JwtService } from '@nestjs/jwt';

/**
 * Who a request counts against, for the rate limits.
 *
 * The limits counted per internet address, and a school is one address: the
 * computer lab, the staff room wifi and the office all leave through the same
 * router. Thirty students signing in for a lesson shared ten sign ins a
 * minute, and two sessions on one machine were enough to use up the refresh
 * allowance and sign the matron, the nurse and the admin out mid-task.
 *
 * So a request is counted against the person when it can be told who they
 * are, and the address is kept only as the outer limit (see `address` in
 * app.module.ts):
 *
 *   a signed in request    the person in the access token
 *   a token refresh        the person in the refresh token
 *   sign in, OTP, reset    the address and the account being signed in to,
 *                          so guessing one account's password stays limited
 *   anything else          the address
 *
 * Tokens are verified, not merely read: a forged one would otherwise give an
 * attacker a fresh allowance per made up name. An expired token still names
 * its owner truthfully, so expiry is ignored for counting only.
 */
export function throttleTracker(secrets: {
  access?: string;
  refresh?: string;
}) {
  const jwt = new JwtService();

  const subjectOf = (token: string, secret?: string): string | null => {
    if (!secret) return null;
    try {
      const payload = jwt.verify<{ sub?: string }>(token, {
        secret,
        ignoreExpiration: true,
      });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  };

  return (req: Record<string, any>): Promise<string> => {
    const ip = addressOf(req);
    const auth = req.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const sub = subjectOf(auth.slice(7), secrets.access);
      if (sub) return Promise.resolve(`person:${sub}`);
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.refreshToken === 'string') {
      const sub = subjectOf(body.refreshToken, secrets.refresh);
      if (sub) return Promise.resolve(`person:${sub}`);
    }

    const who = [body.email, body.phone, body.sessionId].find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    if (who) return Promise.resolve(`ip:${ip}:who:${who.trim().toLowerCase()}`);

    return Promise.resolve(`ip:${ip}`);
  };
}

/** The address alone, for the outer limit that stops a flood from one place. */
export function addressTracker(req: Record<string, any>): Promise<string> {
  return Promise.resolve(`ip:${addressOf(req)}`);
}

function addressOf(req: Record<string, any>): string {
  return (req.ips?.length ? req.ips[0] : req.ip) ?? 'unknown';
}
