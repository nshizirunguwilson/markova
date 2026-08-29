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
├── docs/             # Deployment guide, feature guide, readiness notes
├── docker-compose.yml
├── .env.example
└── README.md
```

## Tech stack

- **Backend** - Node.js, NestJS 11, TypeScript, Prisma ORM
- **Database** - PostgreSQL 15 with Redis for cache, OTP and queues
- **Web** - Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query
- **Mobile** - Expo SDK 55, Expo Router, React Native - for admins, teachers,
  parents and librarians. Students use the web portal.
- **Design** - one token file drives both clients; every colour pairing is
  verified against WCAG AA in CI

## Roles

| Role | Web dashboard | Mobile app |
| --- | --- | --- |
| Admin | ✅ | ✅ |
| Teacher | ✅ | ✅ |
| Librarian | ✅ | ✅ |
| Parent | ✅ | ✅ |
| Student | ✅ | - by design |

Parents can sign in with either an email address or their phone number; many are
registered with a phone only.

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
| Admin | `wilsonshizirungu@gmail.com` |
| Teacher | `aline.uwase@markova.edu` |
| Librarian | `librarian@markova.edu` |
| Student | `student1@markova.edu` (web only) |
| Parent | `+250788100000` (phone only - no email) |

Login may return an OTP step; outside production the code is included in the
response as `devOtp`.

> Reseeding truncates sessions and signs everyone out.

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

## Tests

```bash
cd backend && npm test        # 176 unit tests, 17 suites
cd backend && npm run test:e2e
cd web && npx vitest run      # 58 unit tests, 8 files
cd mobile && npx tsc --noEmit
```

## Documentation

- `CLAUDE.md` - architecture and conventions
- `design/README.md` - the design system
- `docs/deployment-guide.md` - production deployment
- `docs/FEATURE-GUIDE.md` - what the product does
