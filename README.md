# Markova

Standalone, self-hosted school management system, built for Rwandan schools.

A dashboard for every role in the school, a mobile app for staff and parents,
and a REST API that owns the data. All of it runs on your own infrastructure:
one machine for a school, or three API instances behind a load balancer when
the whole school opens the app on report card evening.

## Project structure

```
markova/
├── backend/          # NestJS 11 + Prisma + PostgreSQL REST API (source of truth)
├── web/              # Next.js 16 (App Router) + React 19 dashboard
├── mobile/           # Expo Router (SDK 55) / React Native app
├── design/           # Design tokens + logo - the source both clients generate from
├── infra/            # nginx config and the k6 load test
├── scripts/          # Token sync, contrast, dashes, advisories, backup, restore
├── docs/             # Security, scaling, backups, theming, the report card pipeline
├── backups/          # Database and upload backups (gitignored)
├── docker-compose.yml        # Postgres and Redis, or the whole stack
├── docker-compose.scale.yml  # nginx, 3 API instances, 2 workers, pgbouncer
├── .env.example
└── README.md
```

## At a glance

| | |
| --- | --- |
| API | NestJS 11, 291 routes with 266 role guards, Swagger at `/api/docs` |
| Data | PostgreSQL 15, 60 Prisma models, 31 migrations, 77 indexes |
| Dashboard | Next.js 16, 89 pages across 10 role dashboards |
| Access | 10 roles, guards on every route, and row level security underneath |
| Tests | 10,406 unit tests: 3,133 backend, 4,889 web, 2,384 mobile. 124 browser checks, 108 pages audited twice |
| Scale | nginx, 3 API replicas, 2 render workers, pgbouncer, Redis |
| Backups | Nightly, with a restore rehearsal that proves they work |

## Tech stack

- **Backend** - Node.js, NestJS 11, TypeScript, Prisma ORM
- **Database** - PostgreSQL 15, with row level security on the tables that hold
  a child's record
- **Redis** - four jobs: rate limit counters, the render queue, the branding and
  timetable cache, and chat fan-out between instances
- **Web** - Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query
- **Mobile** - Expo SDK 55, Expo Router, React Native - for admins, teachers,
  parents and librarians. Students use the web portal.
- **Design** - one token file drives both clients; every colour pairing is
  verified against WCAG AA in CI, in both the light and the dark palette

## Roles

Ten roles, each with its own dashboard and its own reach. Six of them are held
by one person, which is the shape of a single school.

| Role | Runs | Web | Mobile |
| --- | --- | --- | --- |
| Admin | The institution: admissions, the roll, money, settings | Yes | Yes |
| Head teacher | Academic delivery: marks, the register, report cards | Yes | Yes |
| Teacher | Their own subjects and, as class teacher, their class | Yes | Yes |
| Bursar | School fees and the fee structure | Yes | - |
| Librarian | The catalogue and what is on loan | Yes | Yes |
| Patron | Boys' boarding: pocket money, clinic, activities | Yes | - |
| Matron | Girls' boarding, the same reach as the patron | Yes | - |
| Nurse | The sick bay | Yes | - |
| Parent | Their own children | Yes | Yes |
| Student | Their own record | Yes | Not by design |

Students are deliberately excluded from mobile: `MOBILE_BLOCKED_ROLES` rejects
them at sign-in and points them at the web portal, which has a full student
dashboard.

Parents sign in with either an email address or a phone number; many are
registered with a phone only.

**Head teacher is the Director of Studies**, and the division matters: report
cards, marks and attendance are theirs, not the principal's. The principal runs
the institution and the DOS runs academic delivery, and the API enforces it
rather than the menu merely hiding it. See `docs/REPORT-CARD-PIPELINE.md`.

## Development setup

1. **Start the data stores** (Postgres on `:5434`, Redis on `:6380` - deliberately
   not the default ports):

   ```bash
   docker compose up -d
   ```

2. **Configure the backend.** Every variable the API reads is documented in
   `.env.example`, including which ones have no safe default:

   ```bash
   cp .env.example backend/.env
   # then set JWT_SECRET and JWT_REFRESH_SECRET:
   #   openssl rand -base64 48
   ```

   Set `TZ` to the school's own zone, which defaults to `Africa/Kigali`. A
   container left on UTC puts a Rwandan register two hours out, which lands an
   early class on the previous day without anybody noticing.

3. **Run the API** (port 3000, Swagger at `/api/docs`):

   ```bash
   cd backend
   npm install
   npx prisma migrate dev
   npx prisma db seed     # demo data; see below
   npm run start:dev
   ```

4. **Run the dashboard** (port 3001 - the API owns 3000):

   ```bash
   cd web
   npm install
   npm run dev
   ```

5. **Run the mobile app** (optional):

   ```bash
   cd mobile
   cp .env.example .env   # a device cannot reach "localhost" - use your LAN IP
   npm install
   npm start
   ```

### Running everything in containers

```bash
docker compose --profile full up -d --build
```

Brings up the API and the dashboard alongside Postgres and Redis, plus the
nightly backup. Uploaded crests, stamps, signatures and photos live in a named
volume so they survive a rebuild.

For the deployed shape instead, with three API instances behind nginx, see
[Running it at scale](#running-it-at-scale).

## Demo accounts

Seeded by `npx prisma db seed`. Password for all of them: `Password123!`

| Role | Sign in with |
| --- | --- |
| Admin | `wilsonshizirungu@gmail.com` or `+250788000001` |
| Head teacher | `headteacher@markova.edu` |
| Teacher | `aline.uwase@markova.edu` |
| Bursar | `bursar@markova.edu` |
| Librarian | `librarian@markova.edu` |
| Patron | `patron@markova.edu` |
| Matron | `matron@markova.edu` |
| Nurse | `nurse@markova.edu` |
| Student | `student1@markova.edu` to `student30@markova.edu` (web only) |
| Parent | `+250788100000` (phone only, no email) |

The seed builds three academic years: 2,478 accounts, 754 students on the roll
and 525 who have left or graduated, 43 teachers, 28 classes, and a term in
progress whose classes sit at different stages of the report card pipeline, so
every step of it is somewhere on the dashboard.

Login may return an OTP step; outside production the code is included in the
response as `devOtp`.

> Reseeding truncates sessions and signs everyone out.

## Themes

Light, dark, or whatever the machine is set to. The reader chooses from the
menu under their own name, and "system" is a real third state rather than a
default: it stamps nothing on the document, so `prefers-color-scheme` decides
and keeps deciding as the machine changes.

Every colour in `design/tokens.json` carries a `dark` alongside its `value`,
and `check-contrast.mjs` runs all 78 pairings against both palettes. See
`docs/THEMING.md` for the rules when writing components.

## Security

The short version, with the reasoning in `docs/SECURITY.md`.

**Nothing is injectable.** There is no hand-written SQL in the application, so
a password of `' or 1=1 --` is compared as a twelve-character string. A global
validation pipe rejects any field a DTO does not declare, rather than ignoring
it.

**Access is enforced twice.** Route guards decide who may reach an endpoint,
and Postgres row level security decides which rows come back. The second exists
because the first fails silently: a forgotten `where` clause on a new endpoint
would return another family's data with a 200 and no error. With RLS it returns
nothing instead.

The application connects as a role that can read and write rows and nothing
else. It used to connect as the database superuser, which bypasses every policy
however the table is configured, so the first version of RLS was correctly
enabled and had no effect at all.

**Authentication.** bcrypt at cost 12, with older hashes upgraded on sign-in so
raising it did not need a password reset. Fifteen-minute access tokens, refresh
rotation with replay detection, five failed attempts locking an account for
thirty minutes, and OTP for staff. Changing a password ends every other
session, because the usual reason to change it is thinking somebody else has
it.

**Money cannot be taken twice.** Fee payments and pocket money carry an
idempotency key, checked in the service and enforced by a unique index for the
case two requests arrive at the same instant on two different servers.

**Uploads cannot execute.** Magic bytes checked, an exact mime allowlist, and
the stored extension taken from the type rather than the filename. Served
behind Helmet with `nosniff` and a sandbox policy.

**Bots** are caught by a honeypot on the public admissions form rather than a
CAPTCHA. The form is filled in by parents on phones on a poor connection, and a
CAPTCHA is a real barrier for exactly the families a school most wants to
reach.

**Logs** carry a request id end to end, and redact more than credentials: this
system holds diagnoses, allergies and discipline notes for children, and a log
line carrying a diagnosis has copied a medical record into a file with none of
the protection the table had.

## Running it at scale

One command brings up the deployed shape.

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml \
  --profile scale up -d --build
```

Nine containers. The browser only ever talks to nginx on port 80, and never
sees how many API instances there are.

| Container | What it is |
| --- | --- |
| `nginx` | The only door: flood control, caching, sharing traffic |
| `api-1/2/3` | Three copies of the API, interchangeable |
| `worker-1/2` | The same image with `WORKER=1`. They render PDFs and serve nobody |
| `pgbouncer` | So three instances do not exhaust Postgres's connections |
| `postgres`, `redis`, `web` | The database, Redis, and the dashboard |

nginx listens on port 80. A real deployment terminates TLS there, and the
config has the place for it; the certificates are a deployment decision rather
than something this repository can carry.

**PDF rendering runs on a queue**, so an API instance never launches a browser
and a class of report cards cannot make the dashboard slow for everybody else.
Asking for one returns in about 20ms; the worker takes about 3 seconds over it,
which used to be 3 seconds of a server held inside the request.

Three checks prove the balancing is real, and they take about a minute:

```bash
# 1. Traffic is shared: three numbers that add up to twenty
for i in $(seq 1 20); do curl -s -o /dev/null http://localhost/api/health/live; done
for n in 1 2 3; do docker logs markova-api-$n --tail 100 | grep -c health/live; done

# 2. A dead instance is skipped: ten 200s with one of three stopped
docker stop markova-api-2
for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} " http://localhost/api/health/live; done
docker start markova-api-2

# 3. Workers do the heavy work, and the API instances never log a render
docker logs -f markova-worker-1
```

See `docs/LOAD-BALANCING.md` for why each piece is there, and `docs/SCALING.md`
for the load test:

```bash
k6 run infra/load/report-card-evening.js
```

It models the moment a school actually loads this system: several hundred
parents opening the app the evening report cards go out, while staff are still
issuing.

## Backups

```bash
./scripts/backup.sh                  # database and uploads
./scripts/restore.sh --check latest  # prove it restores, touching nothing
```

Two files, and both are needed. The uploads are **not in the database**, so a
database-only backup restores a school whose report cards have no signatures
and no crest, with nothing to regenerate them from.

`MANIFEST` is written last, so its presence is what marks a backup complete. A
folder without one failed part way, and the restore script refuses it rather
than restoring a truncated dump over a working database.

A backup nobody has restored from is a hypothesis, so `--check` restores into a
scratch database beside the real one, counts what came back, and drops it again.
Nothing that matters is touched. The `full` profile runs a backup nightly at
02:00.

**Still missing: an off-site copy.** `./backups` survives a dropped table and a
bad migration. It does not survive the disk, the machine, or the building. See
`docs/BACKUPS.md`.

## Design system

`design/tokens.json` and `design/logo-mark.svg` are the only hand-authored
sources. The web and mobile theme files are generated:

```bash
node scripts/sync-design-tokens.mjs     # regenerate both theme files
node scripts/check-contrast.mjs         # assert every pairing is WCAG AA
node scripts/build-brand-assets.mjs     # re-render every icon from the logo
```

CI fails if the generated files drift or if a colour pairing drops below AA.
See `design/README.md` for the reasoning behind the palette and the mark.

## Punctuation

The repository carries no em dashes and no en dashes, anywhere a person writes:
prose, comments, UI copy, test names and seed data. A hyphen does every job
they were doing, and CI fails on any that appear.

```bash
node scripts/check-dashes.mjs           # report any, and fail
node scripts/check-dashes.mjs --fix     # replace them all with a hyphen
```

`web/AGENTS.md` is the one exception: `next dev` writes that block itself and
puts its own dashes back, so the check skips it.

## Tests

```bash
cd backend && npm test              # 3,133 unit tests, 103 suites
cd backend && npm run test:e2e
cd web && npx vitest run            # 4,889 unit tests, 175 files
cd mobile && npm test               # 2,384 unit tests, 93 suites
cd mobile && npx tsc --noEmit
```

Both unit suites enforce a coverage floor, and the thresholds are a ratchet:
raise them, never lower them.

### The guards CI runs

Each one fails the build rather than warning, because a warning nobody reads is
the same as no check at all.

```bash
node scripts/check-vulnerabilities.mjs  # any advisory with no written reason
node scripts/sync-design-tokens.mjs --check
node scripts/check-contrast.mjs         # 78 pairings, both palettes
node scripts/check-dashes.mjs
```

`check-vulnerabilities.mjs` exists because a bare `npm audit` is not a gate: it
fails on something with no fix available, somebody adds `|| true`, and it
reports nothing from then on. Every advisory has to be fixed or written down
with the reason it cannot be reached and what would change that. Dependabot
raises the routine updates weekly.

### Browser audits

Two self-contained Playwright scripts, not test-runner configs. Both need the
dashboard on `:3001` and the API on `:3000` with the demo seed loaded:

```bash
WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/ui-audit.spec.js
WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/a11y-audit.spec.js
WEB=http://localhost:3001 API=http://localhost:3000/api THEME=dark node web/e2e/a11y-audit.spec.js
```

`ui-audit` runs 124 checks over auth, route guards, forms, RBAC and layout.
`a11y-audit` runs axe-core over all 108 pages as every role and exits non-zero
on any WCAG 2.1 AA violation; `THEME=dark` runs the same sweep on the dark
palette, because contrast is the failure a dark theme actually ships with.

## Documentation

- `CLAUDE.md` - architecture and conventions
- `design/README.md` - the design system
- `docs/FEATURE-GUIDE.md` - what the product does
- `docs/REPORT-CARD-PIPELINE.md` - how a report card gets issued, and how to work on it
- `docs/THEMING.md` - light, dark and system, and the rules for writing components
- `docs/SECURITY.md` - what is enforced, where, and the known gaps
- `docs/SCALING.md` - the three instance topology and how to load test it
- `docs/LOAD-BALANCING.md` - what the nine containers do, and how to see it working
- `docs/BACKUPS.md` - taking one, and proving it restores
- `docs/deployment-guide.md` - production deployment
- `docs/SHARING.md` - letting somebody else see it over port forwarding
