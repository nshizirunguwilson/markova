# Markova — Status, Fixes & Roadmap

_Last updated: 2026-06-06. Maintained alongside a full test pass of the system._

Markova is a self-hosted school-management system: a **NestJS** API + **Prisma/PostgreSQL/Redis**
backend, a **Next.js 16** web dashboard, and an **Expo / React Native** mobile app. It covers
five roles (Admin, Teacher, Student, Parent, Librarian) across academics, attendance, discipline,
library, messaging, notifications, reports and admin operations.

---

## 1. Demo-day runbook (read this first)

### Start the stack
```bash
# from repo root
docker compose up -d                 # Postgres :5434, Redis :6380
cd backend
npx prisma migrate deploy            # apply schema (first time / after pull)
npx prisma db seed                   # load demo data — RE-RUN ON DEMO DAY for fresh dates
npm run start                        # API on :3000

# new terminal
cd web && npm run dev                # web on :3001
```
Open http://localhost:3001 .

> **Re-seed on the morning of the demo.** The seed is now idempotent and date-relative:
> the active term contains *today*, attendance covers the last ~10 weekdays, and only 3
> library loans are intentionally overdue. Re-running keeps everything looking current.

### Demo credentials (password `Password123!`)
| Role | Login | OTP |
|---|---|---|
| Admin | `wilsonshizirungu@gmail.com` | yes (code in API console / `devOtp`) |
| Teacher | `aline.uwase@markova.academy` | yes |
| Librarian | `librarian@markova.academy` | yes |
| Student | `student1@markova.academy` | no |
| Parent | phone `+250788100000` | yes |

These five accounts skip the first-login forced password change, so they land straight on
their dashboard. Every other seeded user still has it on, so the feature is still demoable.
OTP codes are printed in the backend console (`OTP for <email>: 123456`) and returned in the
login response as `devOtp`, so you never have to wait for an email.

### A 6-minute happy-path script
1. Admin login → dashboard (Students 330 · Teachers 30 · Users 562 · Subjects 15).
2. Admin → Analytics: attendance pie, discipline bars, library usage all populated.
3. Admin → Reports → a student → download term report **PDF**.
4. Teacher login → Marks → enter/batch marks for a class.
5. Student login → My Marks (subject bars + performance comparison chart).
6. Parent login (phone) → pick child → Marks/Attendance/Discipline.
7. Two browsers (e.g. Admin + Teacher) → Messages → send a message → it appears **live**.
8. Librarian → Loans → Active/Overdue tabs; do a checkout + return.

> The attendance dashboard defaults to **today**; on a weekend it is legitimately empty
> (no school). For a weekday demo, re-seed that morning so today has data.

---

## 2. What was broken and is now fixed (this pass)

| # | Area | Symptom | Fix | Commit |
|---|---|---|---|---|
| 1 | Demo accounts | All non-parent demo logins returned “Invalid credentials” | Stale data — passwords had drifted from prior testing; restored, and the reworked seed prevents recurrence | (data + seed) |
| 2 | RBAC | 16 teacher/student/parent pages broke: term/year selectors 403, parent children never loaded, message recipient picker 403 | Opened read-only `/academic/years` & `/terms` to all roles; allowed users to GET their own `/users/:id`; added scoped `GET /messaging/contacts` | `eef1401` |
| 3 | Admin dashboard | “Total Users” and “Subjects” cards blank (`—`) | Added `totalUsers`/`totalSubjects` to the dashboard analytics response | `7d26421` |
| 4 | Library analytics | “Overdue” showed 0 while 17 loans were overdue | Counted `status='OVERDUE'` (loans never get that status); now counts active-past-due | `7d26421` |
| 5 | Charts | Student “Performance Comparison” and admin “Attendance by Class” bar charts rendered empty | Percentage-height bars sat in an auto-height column; wrapped each in a flex track so heights resolve | `7d26421` |
| 6 | Demo data | Ugandan/Luganda names; stale fixed dates (mass-overdue loans, empty “today”); seed not re-runnable | Rwandan names/phones/address; date-relative; idempotent (TRUNCATE-first); demo accounts skip forced password change | `c24a267` |
| 7 | Add User form | Asked the admin to paste a class-section **UUID** | Cascading Class Level → Section dropdowns | `388d487` |

---

## 2b. Round 2 — bugs found by clicking through every feature as a user

A second pass drove the actual UI (forms, buttons, search, uploads, exports,
theme/settings, report publishing, term lifecycle) for all five roles. These are
the features that "passed tests" but didn't actually work:

| # | Area | Symptom | Fix | Commit |
|---|---|---|---|---|
| 8 | Password reset | Login linked to `/forgot-password`, but the page (and `/reset-password`) didn't exist — a dead link | Built both pages; email a real reset *link* with the full token | `a26b957` |
| 9 | Login errors | A wrong password fired a false "session expired" toast and reloaded the page, so "Invalid credentials" never showed | Stop the 401 interceptor from hijacking `/auth/*` endpoints | `a26b957` |
| 10 | Branding | Changing school name / theme colour only affected report cards — the app hardcoded "Markova" and a fixed colour | Public branding endpoint + BrandProvider; name + colour now apply app-wide and live | `453a5f3` |
| 11 | Term lifecycle | The close/reopen-term lock button did nothing (web sent PATCH, backend maps POST → 404) | Switch hooks to POST | `96500cc` |
| 12 | Edit profile | Every role's profile "Save" hit a non-existent `PATCH /auth/profile` (404) | Added the endpoint | `96500cc` |
| 13 | Student pickers | Discipline (admin+teacher) and Generate-Document asked for a raw student **UUID** | Reusable Level→Section→Student picker | `01c7f42` |
| 14 | Add Book | Every "Add Book" failed with 400 — the form sent `shelfLocation`, absent from the model/DTO | Added `shelf_location` (schema + migration + DTOs) | `64c1475` |
| 15 | Data export | "Marks"/"Attendance" exports downloaded the *user* list, and capped at one page | Route each export to its endpoint, paginate, flatten correct columns | `fb08c1e` |
| 16 | Teacher marks/homework | Teachers could not enter marks at all (and homework assign sent `subjectId: undefined`) — the page read `assignment.subject.id`, which the API doesn't return | Use the flat `assignment.subjectId`/`classSectionId` | `dcc8c25` |

Interactive coverage now verified working: form login + OTP, wrong-password
feedback, forgot→reset→login, logout; admin users (search/filter/paginate/sort/
add/delete/import), academics (subjects/sections/timetable/assessment types,
term close-reopen), marks calculate + **publish report cards**, discipline
incident via picker, library add/checkout/return/search, settings (school name +
**theme colour** live), data export (5 datasets), help FAQ/ticket; teacher marks
batch entry, attendance mark + save, homework assign, profile edit; student
homework submit; parent appeal + per-child pages; librarian checkout/return;
messaging compose (contact picker → create → send).

---

## 3. What was tested and is verified working

**Auth** — all 5 role logins, OTP flow, refresh, change/reset password endpoints, lockout &
rate-limit configuration.
**API** — every read endpoint across all roles returns 2xx (no 500s); RBAC denies cross-role
access (e.g. a parent cannot read another student).
**Web** — all **53** role pages load with **zero** console/page/API errors (automated crawl).
**Write flows** — create user, single + batch marks, bulk attendance, create homework,
discipline incident, library checkout/return, create conversation + send message, calculate
term & year results — all succeed with the exact payloads the web sends.
**Multi-actor flows** — discipline incident → parent appeal → admin review; student homework
submit → teacher grade; help ticket → admin status update.
**Reports** — term report card **PDF** (Puppeteer) and HTML render.
**Realtime** — WebSocket `/chat`: JWT connect, presence, online users, live `newMessage`
broadcast, typing indicators, read receipts — all pass.
**Notifications** — create → unread badge increments → mark read / mark-all-read.
**Admin ops** — settings upsert, onboarding persist, logo/photo upload + public serving,
single + bulk ID cards, CSV bulk import, promotion (with correct retain/promote logic).
**Mobile** — Expo app typechecks clean and bundles (iOS export OK).
**Baseline** — backend `nest build` + 63 Jest tests pass; web `next build` + 10 Vitest pass.

---

## 4. Known limitations / things to be upfront about

- **Mobile runtime is unverified end-to-end.** It builds and bundles and targets the same
  (working) API, but no on-device login/marks/push test has been run. Treat as alpha. Android
  emulators need `10.0.2.2`, physical devices need the host LAN IP, not `localhost`.
- **Email/OTP depends on Brevo SMTP credits.** If they run out, OTP emails stop — but the
  `devOtp` field and backend console always have the code in development.
- **Attendance dashboard defaults to today** → empty on weekends/holidays. Pick a recent
  weekday, or re-seed on a weekday.
- **No audit-log UI** yet — the `audit_logs` table is populated but only queryable via SQL.
- **`forcePasswordChange` is reset by the seed.** Demo accounts are exempt; if you re-seed,
  the exemption is preserved automatically.
- **Push notifications** require a real device + Expo push token; not exercised here.

---

## 5. Roadmap (post-demo, prioritised)

### P1 — correctness & polish
- [ ] On-device mobile pass: login, view marks, register push token, receive a push.
- [ ] Make the attendance dashboard fall back to the most recent date with data when today is empty.
- [ ] Audit a few more admin forms for raw-ID inputs (timetable, marks filters) the way Add User was fixed.
- [ ] Add an `IN_APP` notification type (the bell currently reuses EMAIL/PUSH types).

### P2 — features the schema already implies
- [ ] Audit-log viewer page for admins.
- [ ] Exam-schedule UI surface (endpoints exist).
- [ ] Transfer letter / transcript / certificate document templates (endpoint exists; verify output).
- [ ] Wire chronic-absenteeism “Notify parents” and library overdue reminders to the email queue with delivery confirmation.

### P3 — hardening & ops
- [ ] Move secrets out of `backend/.env` (SMTP creds, JWT secrets) into real environment config; rotate the committed Brevo key.
- [ ] Migrate the deprecated `package.json#prisma` block to `prisma.config.ts` (Prisma 7 readiness).
- [ ] Add e2e tests for the multi-actor flows (appeals, homework grading) and a CI workflow.
- [ ] Production deploy guide hardening (HTTPS, CORS origins, NODE_ENV=production so `devOtp` is suppressed).

---

## 6. Handy commands
```bash
# Refresh demo data (idempotent)
cd backend && npx prisma db seed

# Health check
curl -s http://localhost:3000/api/health | jq

# Look up demo parent phones
PGPASSWORD=password psql -h localhost -p 5434 -U markova -d markova \
  -c "SELECT first_name, phone FROM users WHERE role='PARENT' LIMIT 5;"
```
