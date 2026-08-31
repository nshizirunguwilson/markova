# Security

What is enforced, where, and why. Every claim here was checked against the
source or run against a running server.

## Injection

**There is no hand-written SQL in the application.** No `$queryRaw`,
`$executeRaw` or the `Unsafe` variants, with one exception: the health check
runs `SELECT 1` as a tagged template with nothing interpolated into it.

Everything else goes through Prisma's query builder, which sends the statement
and the values to Postgres separately. A password of `' or 1=1 --` is compared
as a twelve-character string, because there is no statement for it to become
part of.

Verified by running it:

```
password=' or 1=1 --                    -> 401 Invalid credentials
password='; DROP TABLE users; --        -> 401 Invalid credentials
email=' or 1=1 --                       -> 400 "email must be an email"
users still present: 2478
```

## Input

A global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so
a DTO must declare every field it accepts and anything else is rejected rather
than ignored. Adding a field to a request body is not a way in.

## Authentication

| | |
| --- | --- |
| Hashing | bcrypt at cost 12, with old hashes upgraded on sign-in |
| Access token | 15 minutes, stateless |
| Refresh | Rotated, with replay detection through a Redis lock |
| Brute force | 5 failed attempts locks the account for 30 minutes |
| Rate limit | 10 a minute on every credential route |
| OTP | Required for staff sign-in |

**Raising the cost factor did not require a password reset.** A password is
only in memory during a sign-in, which is the one moment an old hash can be
replaced, so `needsRehash` reads the cost out of the stored hash and upgrades
it there. Without that, the new cost would apply to new accounts only and the
oldest accounts would keep the weakest hashes for ever.

**Changing a password ends every other session.** The usual reason somebody
changes their password is that they think another person has it, which is
exactly when the other person's session has to stop working.

## Authorisation

Ten roles, 226 guarded endpoints, `@Roles()` and a `RolesGuard` on every one.
`academic-control.spec.ts` reads the decorators themselves, so a route that
quietly widens access fails a test rather than a demo.

Attribute and relationship rules ("the class teacher of this section", "only
once the marks are published") are enforced in the services. They are written
per service rather than in one place, which is the known weakness here: the
same rule has been got wrong on two different screens.

## Uploads

| Check | What it stops |
| --- | --- |
| Mime allowlist | Anything but jpeg, png, gif, webp. `.svg` and `.html` are excluded because both execute |
| Magic bytes | A file that claims to be a PNG and is not |
| Extension from mime | A filename like `evil.html` deciding how the file is served |
| UUID filenames | Guessing another person's upload, and path traversal |

Served behind Helmet with `X-Content-Type-Options: nosniff` and a sandbox CSP.
The order matters: static assets used to be registered before Helmet, so
`/uploads` came back with no security headers at all while every `/api` route
had them. `main.spec.ts` pins the order now.

## Bots

The public admissions form is unauthenticated and writes to the database. It is
limited to five submissions a minute per address, and carries a honeypot: a
hidden field a person cannot see and a commodity bot fills in. A submission
that fills it is discarded and answered as though it had worked, because
refusing plainly would tell whoever wrote the bot which field gave them away.

A CAPTCHA was considered and rejected. The form is filled in by parents on
phones on a poor connection, and a CAPTCHA is a real barrier for exactly the
families a school most wants to reach. It would also mean a request to a third
party on every application from a system holding children's data.

## Rate limiting

Two layers, doing different jobs.

**nginx**, per address, costing nothing: 30 requests a second generally, ten a
minute on credential routes. This is the layer that absorbs a flood.

**The application**, per user and per route, costing a Redis round trip: 100 a
minute globally with 23 per-route overrides. Counters live in Redis rather than
process memory, which is what makes them hold across three instances.

`TRUST_PROXY` is off by default and set explicitly per deployment. Trusting a
hop that is not there lets a client forge `X-Forwarded-For` and bypass rate
limiting entirely.

## What is logged

Every mutation writes an `AuditLog` row: who, what, which record, from which
address. Reads are deliberately not logged.

**Request bodies are redacted before they are written.** One list in
`common/redaction.ts`, used by the audit log and anything else that logs a
body. It covers credentials, and it also covers diagnoses, allergies, emergency
plans and discipline notes: this system holds medical records for children, and
a log line carrying a diagnosis has copied it out of the table that protected
it and into a text file that does not.

Every request carries an id, generated by nginx or the app, returned on the
response and quoted on the log line. It is what makes one request followable
across three instances.

## Dependencies

`node scripts/check-vulnerabilities.mjs` fails the build on any advisory that
is not written down with a reason. A bare `npm audit` is not a gate: it fails
on something with no fix available, somebody adds `|| true`, and it reports
nothing from then on.

One advisory is currently carried, with the reasoning and the condition that
would make it urgent recorded in that file.

## Known gaps

- **No row level security.** Isolation is enforced in the services and there is
  nothing underneath to catch a forgotten `where` clause.
- **Attribute rules are scattered** rather than expressed in one place.
- **No off-site backups.** `./backups` survives a dropped table, not the
  building.
- **No secrets manager.** Plain `.env` files, with no rotation story.
- **Money operations are not idempotent.** A parent who taps pay twice on a bad
  connection can create two records of one payment.
