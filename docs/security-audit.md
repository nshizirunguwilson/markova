# Security audit, August 2026

An audit of the backend's authentication, authorisation, rate limiting, upload
handling and dependencies. Every finding below was reproduced before it was
fixed, and every fix has a test.

## What was already right

Worth stating first, because the fixes below are narrow and it would be easy to
read them as a system in trouble. It is not.

- **Per-route rate limits.** The auth routes do not rely on the global
  100/minute. Login, OTP verification and token refresh are 10/minute, OTP
  resend and password reset requests are 5/minute, and public report
  verification is 20/minute.
- **Per-account lockout.** Failed logins are counted in Redis against the
  identifier, with a `lockedUntil` window. Rate limiting alone is per IP, so
  this is the half that survives an attacker rotating addresses.
- **Guard coverage.** Every controller carrying data is behind
  `AuthGuard('jwt')`, and 13 of 18 add `RolesGuard`. The four controllers with
  no guard are deliberately public: health, hello, public branding, and report
  verification by code.
- **Ownership checks beyond roles.** `OwnershipService` is applied in marks,
  attendance, discipline, homework, analytics and reports, so passing the role
  check is not the same as being allowed to see a particular child's row.
- **Refresh token rotation with replay detection.** Reusing a rotated refresh
  token deactivates the session rather than issuing a new pair.
- **Uploads validated by content.** Magic bytes are checked after write and the
  file is deleted if it is not really an image.
- **Inactive users rejected per request.** `JwtStrategy.validate` reloads the
  user on every request, so deactivating an account takes effect immediately
  rather than at token expiry.

## Fixed

### 1. Refresh tokens could act as access tokens

`@nestjs/jwt` resolves a signing key as `options.secret || moduleOptions.secret`.
`JWT_REFRESH_SECRET` was read straight from the environment with no check, so if
it was unset the refresh token was signed with `JWT_SECRET` instead. Both tokens
carried an identical payload (`{ sub, role, jti }`) and `JwtStrategy.validate`
read only `sub`, so a refresh token would have been accepted anywhere an access
token was expected. That converts a 15 minute credential into a 7 day one.

Two fixes, because one of them is a configuration rule and configuration drifts:

- `src/config/env.validation.ts` refuses to boot when either secret is missing,
  when either is still the shipped placeholder, or when the two are equal.
  Production additionally requires 32 characters and `CORS_ORIGINS`.
- Tokens now carry a `typ` claim. The strategy rejects a refresh token, and the
  refresh endpoint rejects an access token. Tokens minted before the claim
  existed have no `typ` and are accepted until they expire.

### 2. Rate limiting counted the proxy, not the client

`ThrottlerGuard.getTracker` returns `req.ip`, and Express derives that from
`trust proxy`, which was never set. Behind any reverse proxy every request
therefore shared one bucket, so the 10/minute login limit was 10 logins per
minute for the entire school: useless against an attacker and an outage for
everyone else.

`TRUST_PROXY` now configures the hop count. It stays off by default, because
trusting a hop that is not there lets a client forge `X-Forwarded-For` and skip
rate limiting altogether.

### 3. Rate limit counters were per process and lost on restart

The default storage is a `Map` on the heap. Every deploy reset the login limit,
and a second instance behind a load balancer would double every limit in the
app. `RedisThrottlerStorage` moves the counters into the Redis already used for
caching and queues, in one atomic Lua call. If Redis is unreachable it counts in
memory and logs once, because failing open drops rate limiting and failing
closed drops the API.

Verified against a real Redis: blocks on the 4th request of a limit of 3, expires
its window, and counts 20 concurrent hits exactly once each. Verified again
against the running API, where `/api/auth/login` returns 429 once its 10/minute
window is spent, and the counters appear in Redis under `throttle:default:*`.

### 4. Uploads chose their own file extension

The stored name was `uuid + extname(file.originalname)`, and `originalname` is
attacker controlled. The magic byte check only reads the first few bytes, so a
file beginning `GIF89a` and continuing into `<script>` passed validation and was
saved as `<uuid>.html`. Express serves `/uploads` by extension, so it came back
as `text/html` and executed on the API's own origin.

The extension now comes from a whitelist keyed on the accepted mime type, so an
upload cannot name itself. The mime filter is also an exact list now rather than
a suffix regex, which previously admitted `application/png`.

### 5. Passwords were silently truncated

bcrypt reads at most 72 bytes. Every other string field in the DTOs had a
`@MaxLength`; no password field did. Confirmed with the library actually in use:
two different passwords sharing a 72 byte prefix verify against the same hash.
All five password fields are now capped at 72, which is what OWASP asks for.

### 6. Swagger was public in production

`/api/docs` listed every route, its parameters and the roles it requires. It is
now off when `NODE_ENV=production` unless `SWAGGER_ENABLED=true`.

### 7. Dependency advisories in the web client

`npm audit` went from 12 to 1. Patched: axios NO_PROXY SSRF, form-data CRLF
injection, ws uninitialised memory disclosure, socket.io-parser memory
exhaustion, nanoid, and a Next.js denial of service (16.2.0 to 16.3.2).

### 8. Ungraceful shutdown

`app.enableShutdownHooks()` was missing, so a redeploy dropped the Prisma pool
and half-processed BullMQ jobs instead of closing them.

## Deferred, with reasons

Each of these needs a major version bump. None is reachable from this codebase
as written, and doing four major upgrades days before a demo trades a real risk
for a theoretical one. They are listed so the decision is recorded, not
forgotten.

| Advisory | Needs | Reachable here? |
| --- | --- | --- |
| nodemailer, `raw` option bypasses `disableFileAccess` (CVSS 7.1) | nodemailer 9 | No. The `raw` option is never used. |
| extract-zip symlink traversal (CVSS 8.1), via `@puppeteer/browsers` | puppeteer-core 25 | No. Only runs when extracting a downloaded browser archive, which `puppeteer-core` does not do. |
| deepmerge-ts stack exhaustion, via `@prisma/config` | prisma 6.12 | No. CLI config loading, not the query runtime. npm also suggests a version older than the one installed, so its metadata is unreliable here. |
| OpenTelemetry baggage memory growth (CVSS 5.3), via `@sentry/nestjs` | @sentry/nestjs 10 | Only if `SENTRY_DSN` is set. Sentry does not initialise without it, so no instrumentation is registered. Worth doing before enabling Sentry in production. |
| Expo tooling advisories | Expo SDK 57 | Build tooling. The app is on SDK 55 and the upgrade is two majors. |
| xlsx prototype pollution | No fix on npm | SheetJS publishes fixed builds off npm. Used for admin exports only. Worth replacing. |

## Recommended next

Roughly in order of value.

1. **Argon2id for new password hashes.** OWASP names bcrypt a legacy fallback
   and Argon2id the first choice. The current cost factor of 10 meets the stated
   minimum, so this is an improvement rather than a defect.
2. **Replace `xlsx`.** It is the one advisory with no upstream fix.
3. **Deal with the deferred majors** once the demo is behind you, starting with
   Sentry if you plan to turn it on in production.
4. **Fix the hanging e2e suite.** `npm run test:e2e` hangs in CI on master and
   has since PR #6, so the last gate never reports.
