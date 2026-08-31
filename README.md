# Markova

Standalone, self-hosted school management system, built for Rwandan schools.

An admin dashboard for staff, a mobile app for teachers and parents, and a REST
API that owns the data - all of it running on your own infrastructure.

## Project structure

```
markova/
├── backend/          # NestJS 11 + Prisma + PostgreSQL REST API (source of truth)
├── web/              # Next.js 16 (App Router) + React 19 dashboard
├── mobile/           # Expo Router (SDK 55) / React Native app
├── design/           # Design tokens + logo - the source both clients generate from
├── scripts/          # Token sync, contrast check, brand asset builder
├── docs/             # Deployment, features, the report card pipeline, theming
├── docker-compose.yml
├── .env.example
└── README.md
```

## At a glance

| | |
| --- | --- |
| API | NestJS 11, 226 guarded endpoints, Swagger at `/api/docs` |
| Data | PostgreSQL 15, 60 Prisma models, 28 migrations |
| Dashboard | Next.js 16, 89 pages across 10 role dashboards |
| Accounts | 10 roles, role-based guards on every route |
| Tests | 3,011 backend, 4,874 web, 124 browser checks, 108 pages audited for accessibility |

## Tech stack

- **Backend** - Node.js, NestJS 11, TypeScript, Prisma ORM
- **Database** - PostgreSQL 15 with Redis for cache, OTP and queues
- **Web** - Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query
- **Mobile** - Expo SDK 55, Expo Router, React Native - for admins, teachers,
  parents and librarians. Students use the web portal.
- **Design** - one token file drives both clients; every colour pairing is
  verified against WCAG AA in CI

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

Brings up the API and the dashboard alongside Postgres and Redis. Uploaded
crests, stamps, signatures and photos live in a named volume so they survive a
rebuild.

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
cd backend && npm test              # 3,011 unit tests, 94 suites
cd backend && npm run test:e2e
cd web && npx vitest run            # 4,874 unit tests, 175 files
cd mobile && npx tsc --noEmit
```

Both unit suites enforce a coverage floor, and the thresholds are a ratchet:
raise them, never lower them.

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
- `docs/deployment-guide.md` - production deployment
- `docs/FEATURE-GUIDE.md` - what the product does
- `docs/REPORT-CARD-PIPELINE.md` - how a report card gets issued, and how to work on it
- `docs/THEMING.md` - light, dark and system, and the rules for writing components
