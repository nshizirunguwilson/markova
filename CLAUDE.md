# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Markova is a standalone, self-hosted school management system. It is a multi-project
repo (no workspace tooling — each subproject has its own `package.json` and is installed/run
independently):

- `backend/` — NestJS 11 + Prisma + PostgreSQL REST API (the source of truth).
- `web/` — Next.js 16 (App Router) + React 19 admin/role dashboard.
- `mobile/` — Expo Router (SDK 55) / React Native app for parents, students, teachers.
- `order/` — a standalone Expo UI demo (four pixel-rebuilt screens), unrelated to the school
  domain; shares the mobile toolchain only. No router — `App.tsx` is a state switcher.
- `docs/`, `scripts/`, and several `*.md` plans/audits at the root.

## Commands

### Infrastructure
```bash
docker-compose up -d        # Postgres on :5434, Redis on :6380 (note non-default ports)
```

### Backend (`cd backend`)
```bash
cp ../.env.example .env      # then fill JWT secrets etc.
npm install
npx prisma migrate dev       # apply migrations
npx prisma db seed           # seed demo data (Rwandan demo data — see below)
npm run start:dev            # watch mode, API on :3000 (global prefix /api, Swagger at /api/docs)
npm run lint                 # eslint --fix
npm test                     # jest (unit, *.spec.ts colocated in src/)
npm test -- auth.service     # run a single spec by name fragment
npm run test:e2e             # jest e2e (test/jest-e2e.json)
```

### Web (`cd web`)
```bash
npm install
npm run dev                  # Next.js on :3001 (NOT 3000 — that's the API)
npm run build
npm run lint
npx vitest                   # unit tests (*.test.ts colocated; e.g. src/lib/utils.test.ts)
npx vitest run src/lib/utils.test.ts   # single file
```
Web talks to the API via `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3000/api`).

### Web E2E (Playwright)
`web/e2e/ui-audit.spec.js` is a self-contained Playwright script (not a test-runner config).
Requires web on :3001 and API on :3000 with the demo seed loaded:
```bash
WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/ui-audit.spec.js
```

### Mobile / Order (`cd mobile` or `cd order`)
```bash
npm install && npm start     # Expo; press i / a / w. `order` also has: npm run typecheck
```

## Backend architecture

NestJS feature modules live under `src/modules/<feature>/` and follow a consistent shape:
`*.controller.ts`, `*.service.ts`, `*.module.ts`, a `dto/` folder (class-validator DTOs), and a
colocated `*.service.spec.ts`. Modules are registered in `src/app.module.ts`. Current domains:
auth, users, school-config, academic, marks, attendance, discipline, library, homework,
messaging, notifications, reports, analytics, help, health.

Cross-cutting concerns live in `src/common/`:
- **RBAC**: `@Roles(...)` decorator + `RolesGuard` check `user.role` against `Role` enum
  (`ADMIN`, `TEACHER`, `STUDENT`, `PARENT`, `LIBRARIAN`). `SpecialRole` (DOS/HOD/CLASS_TEACHER)
  is modeled separately via the `TeacherRole` table — it is not part of the base role guard.
- **`@CurrentUser()`** decorator pulls the JWT-validated user (see `JwtStrategy.validate`, which
  re-loads the user from the DB and rejects inactive users on every request).
- Global `ValidationPipe` runs with `whitelist` + `forbidNonWhitelisted` — DTOs must declare every
  accepted field. Global `HttpExceptionFilter`, `AuditLogInterceptor` (writes `AuditLog`), and a
  `ThrottlerGuard` (100 req/60s) are applied app-wide.
- **Bootstrap specifics** (`src/main.ts`): global prefix `api`, static `/uploads` served outside
  the prefix using named wildcards (`uploads/{*path}`) for Express 5 / path-to-regexp v8, helmet,
  compression, CORS from `CORS_ORIGINS` (comma-separated, defaults to `http://localhost:3000`).
- Redis (ioredis) + BullMQ back caching and queues; `@nestjs/schedule` drives `ScheduledTasksService`.

Persistence is Prisma (`prisma/schema.prisma`, ~36 models, snake_case `@map`'d table names).
`PrismaService` is injected everywhere; there is no repository layer. Migrations in
`prisma/migrations/`, seed in `prisma/seed.ts`.

## Web architecture

Next.js App Router under `src/app/` with two route groups:
- `(auth)/` — login, OTP, password reset (these auth endpoints surface their own 4xx errors).
- `(dashboard)/` — one subtree per role: `admin`, `teacher`, `student`, `parent`, `librarian`,
  plus `messages` and `help`. `(dashboard)/layout.tsx` enforces role-based route guarding.

Conventions:
- **API access**: `src/lib/api.ts` is a shared axios instance. A request interceptor attaches the
  JWT from `localStorage`; a response interceptor handles 401 → refresh/redirect, but explicitly
  skips the `AUTH_ENDPOINTS` allowlist so failed logins show real errors instead of a fake
  "session expired" reload. Don't bypass this client for app calls.
- **Data fetching**: TanStack Query, wrapped per domain in `src/hooks/use-<domain>.ts`.
- **State**: Zustand stores in `src/stores/` (`auth-store`, `brand-store`, `chat-store`).
- **UI**: Tailwind CSS v4, components in `src/components/ui` and `src/components/layout`,
  `lucide-react` icons, `sonner` toasts. Realtime via `socket.io-client`. Exports (PDF/xlsx) in
  `src/lib/export.ts`; offline support in `src/lib/offline-db.ts`.

### Important: Next.js version
`web/AGENTS.md` (imported by `web/CLAUDE.md`) warns this is a newer Next.js (16) whose APIs and
conventions differ from older training data. Read the relevant guide under
`web/node_modules/next/dist/docs/` before writing Next.js code, and heed deprecation notices.

## Demo data conventions

Seed/demo data must be **Rwandan** (Kinyarwanda names, `+250` phones, `@markova.academy`
emails) — not Ugandan/Luganda. Example seeded accounts (password `Password123!`): admin
`wilsonshizirungu@gmail.com`, teacher `aline.uwase@markova.academy`, student
`student1@markova.academy`, parent phone `+250788100000`. Login may return an OTP step
(`devOtp` is exposed in dev for `verify-otp`).
