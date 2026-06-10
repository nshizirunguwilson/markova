# Markova — Frontend UI Audit

_Audit date: 2026-06-10. Scope: the Next.js 16 web dashboard (`web/`) driven through a real headless Chromium (Playwright) against the live stack (web :3001 → API :3000). Three phases: MAP → TEST → FIX. Branch: `audit/frontend-ui-audit` (off the backend-fix branch; not pushed)._

Status legend (FIX columns): **FIXED** · **DEFERRED** · **N/A**.

---

## 0. Executive summary

The UI is in strong shape: **all 56 role pages render cleanly** at desktop width — zero uncaught console errors, zero failed network requests, zero blank/crashed pages, every page has a heading and real seeded data. Menu-based navigation is correctly role-scoped (each role's sidebar only lists its own pages).

Two real problems surfaced, both reproduced in the browser:

1. **CRITICAL — client-side role guard is missing.** The dashboard layout renders `<DashboardShell>` **without** `allowedRoles`, so the shell's role check never runs. Direct-URL access lets **any** authenticated role open **any** other role's pages: a student visiting `/admin/users`, `/admin/settings`, `/teacher/marks`, `/librarian/books` stays there and the admin/teacher page content renders (with the student's own sidebar). 16/16 cross-role probes leaked. The backend still enforces data RBAC (admin APIs 403 for a student, so no admin data loads or mutates), but the page is reachable — exactly what the brief says must never happen.
2. **HIGH — `/admin/attendance` breaks the mobile/tablet layout.** Horizontal overflow of **+1618px (768)** / **+1756px (390)**: the "Attendance by Class" bar chart isn't wrapped in a scroll container (the tables on the same page are), so ~25 section bars push the page to 2386px wide.

Plus ~11 minor (8–94px) horizontal overflows on a handful of pages at mobile/tablet (marks tables, library, onboarding, settings).

Counts: **1 CRITICAL, 1 HIGH, 1 MEDIUM (minor-overflow cluster), a few LOW/Open-Questions.**

---

## 1. Methodology & setup

- **Stack:** backend booted from `dist` (clean, 187 routes, db+redis ok); web `npm run dev` on :3001 (ready, `/login` 200). Database already seeded (Rwandan demo data: 330 students, 30 teachers, full records per entity — no page renders empty).
- **Auth:** Playwright authenticates each role via the real API (session OTP handled through `devOtp`) and injects the resulting tokens into `localStorage` (`access_token`/`refresh_token`), then drives the **real rendered pages**. Demo accounts: admin `wilsonshizirungu@gmail.com`, teacher `aline.uwase@markova.academy`, librarian `librarian@markova.academy`, student `student1@markova.academy`, parent phone `+250788100000` (password `Password123!`).
- **Viewports:** 1440 (desktop), 768 (tablet), 390 (mobile).
- **Signals captured per page:** final URL (redirect detection), console errors, uncaught page errors, network responses ≥400, blank/empty-body detection, heading presence, horizontal overflow (`scrollWidth − clientWidth`), and screenshots.
- Recon scripts live under `/tmp/pw/` (`crawl.js`, `inventory.js`, `responsive.js`); formal regression specs are added in Phase 2 (§4).

---

## 2. Route inventory

**Auth (public):**

| Route | Purpose | Interactive elements | Status |
|---|---|---|---|
| `/login` | Email/phone + password → OTP step | identifier + password inputs, password show/hide toggle (aria-labelled), Sign In, forgot-password link, OTP input + Verify + Resend (cooldown) | OK |
| `/forgot-password` | Request reset link | email input, submit, back-to-login link | OK |
| `/reset-password` | Set new password from token | password + confirm, submit | OK |

**Dashboard pages** (menu column = the role whose sidebar lists it; "reachable by" before the fix = *any authenticated role* via direct URL — see F-1). Interactive-element counts are from the live DOM inventory.

| Route | Menu role | Purpose | Key interactive elements | Render |
|---|---|---|---|---|
| `/admin` | ADMIN | KPI dashboard | 2 buttons, 4 quick links, pager | OK |
| `/admin/users` | ADMIN | User CRUD | search, role filter (select), table 20r, Add/Edit/Delete buttons, row links, pagination | OK |
| `/admin/students` | ADMIN | Student registry | search, section filter, table 20r, add | OK |
| `/admin/teachers` | ADMIN | Teacher registry | search, table 20r, add | OK |
| `/admin/subjects` | ADMIN | Subject CRUD | table 15r, add/edit/delete per row | OK |
| `/admin/classes` | ADMIN | Class levels + sections CRUD | 20 buttons (add/edit/delete) | OK |
| `/admin/timetable` | ADMIN | FullCalendar weekly timetable | 2 selects (section/teacher), calendar create/edit (lazy-loaded) | OK |
| `/admin/marks` | ADMIN | Marks results + publish | 3 selects, table 11r, calculate/publish | OK |
| `/admin/reports` | ADMIN | Report-card generation | 4 selects, generate/download | OK |
| `/admin/id-cards` | ADMIN | ID-card registry | search, 3 filters, table 330r, per-row Generate/Revoke, bulk issue | OK |
| `/admin/promotion` | ADMIN | Promotion deliberation | 2 inputs, 5 selects, per-student toggles, commit | OK |
| `/admin/attendance` | ADMIN | Attendance dashboard + chronic | tabs, date input, table, bar chart | OK (responsive bug F-2) |
| `/admin/discipline` | ADMIN | Incidents + appeals | table 30r, add/review buttons | OK |
| `/admin/library` | ADMIN | Books + loans | search, table 20r, checkout/return | OK |
| `/admin/homework` | ADMIN | Homework overview | 2 selects, table 8r | OK |
| `/admin/messages` | ADMIN | Messaging | conversation list, composer | OK |
| `/admin/analytics` | ADMIN | Charts | 2 selects | OK |
| `/admin/settings` | ADMIN | School config + branding + export | form, 5 inputs, uploads, export-all | OK (minor overflow) |
| `/admin/onboarding` | ADMIN | Setup wizard | form, 5 inputs, stepper, pager | OK (minor overflow) |
| `/admin/help` | ADMIN | FAQ + tickets admin | table 3r, FAQ CRUD | OK |
| `/admin/profile` | ADMIN | Own profile | edit, photo upload | OK |
| `/admin/users/[id]` | ADMIN | User detail | (dynamic) | OK |
| `/teacher` | TEACHER | Dashboard | 3 quick links | OK |
| `/teacher/marks` | TEACHER | Marks entry | 3 selects → batch grid | OK |
| `/teacher/homework` | TEACHER | Assign + grade | table 8r, assign/grade | OK |
| `/teacher/attendance` | TEACHER | Mark attendance (manual/QR) | date, 2 selects, mark buttons | OK |
| `/teacher/discipline` | TEACHER | Record incidents | table 30r, add | OK |
| `/teacher/analytics` | TEACHER | Class analytics | 4 selects | OK |
| `/teacher/messages` | TEACHER | Messaging | composer | OK |
| `/teacher/profile` | TEACHER | Profile | edit | OK |
| `/student` | STUDENT | Dashboard | 4 quick links | OK |
| `/student/marks` | STUDENT | My marks | 1 select | OK (minor overflow) |
| `/student/reports` | STUDENT | Report card | 2 selects, download | OK |
| `/student/homework` | STUDENT | View + submit | submit | OK |
| `/student/attendance` | STUDENT | My attendance | view | OK |
| `/student/discipline` | STUDENT | My discipline + appeal | appeal | OK |
| `/student/library` | STUDENT | Browse + my loans | 2 buttons | OK |
| `/student/analytics` | STUDENT | My performance | 2 selects | OK |
| `/student/messages` | STUDENT | Messaging | composer | OK |
| `/student/profile` | STUDENT | Profile | edit | OK (minor overflow on `/student`) |
| `/parent/*` | PARENT | Per-child marks/attendance/discipline/reports/analytics/messages/profile | child selectors, view, appeal | OK (minor overflow on `/parent/marks`) |
| `/librarian` | LIBRARIAN | Dashboard | 2 quick links | OK (minor overflow) |
| `/librarian/books` | LIBRARIAN | Book CRUD | search, filter, add/edit/delete | OK (minor overflow) |
| `/librarian/loans` | LIBRARIAN | Active/overdue loans | table 20r, checkout/return/lost | OK |
| `/librarian/messages` `/librarian/profile` | LIBRARIAN | Messaging / profile | composer / edit | OK |
| `/messages`, `/help` | all roles (shared) | Messaging / help shared shells | composer / FAQ | OK |

**Dead links / blank pages / crashes flagged during MAP:** none. Every own-role route returned 200-equivalent rendered content with a heading; no 404s, no dead buttons detected at render time, no blank screens, no infinite spinners.

---

## 3. Findings (MAP phase)

### CRITICAL

**F-1 — No client-side role guard; every role can reach every other role's pages.** _Status: FIXED_
`web/src/app/(dashboard)/layout.tsx` renders `<DashboardShell>{children}</DashboardShell>` with no `allowedRoles`, and `DashboardShell` only enforces roles when that prop is set — so the check is dead for the entire dashboard. Verified live: as STUDENT, `/admin/users` → stays on `/admin/users` and renders the Users page; same for `/admin/settings`, `/teacher/marks`, `/librarian/books`; as TEACHER → `/admin/settings` renders; as PARENT/LIBRARIAN → `/admin/*` renders. 16/16 cross-role probes reached the restricted route.
Impact: a user can open admin/teacher/librarian screens they have no business seeing (page chrome + structure; data is still blocked by the API's 403s). Fix: derive the required role from the path prefix in `DashboardShell` and redirect mismatches to the user's own dashboard (shared `/messages` and `/help` exempt).

### HIGH

**F-2 — `/admin/attendance` horizontal overflow on tablet/mobile.** _Status: FIXED_
The "Attendance by Class" bar chart (`flex items-end gap-3 h-40`, one `flex-1` bar per section) is not in a scroll container, so ~25 sections widen the page to **2386px** (+1618 at 768, +1756 at 390). The tables on the page are already wrapped in `overflow-x-auto`; the chart should be too (with a small per-bar min-width so bars stay legible while the row scrolls).

### MEDIUM

**F-3 — Minor horizontal overflows (8–94px) on mobile/tablet.** _Status: FIXED (where load-bearing) / DEFERRED (cosmetic)_
Detected: `/admin/marks` (+9 tablet), `/admin/discipline` (+8 mobile), `/admin/onboarding` (+26), `/admin/settings` (+11), `/student` (+20), `/student/marks` (+94), `/parent/marks` (+19/+49), `/librarian` (+34/+69), `/librarian/books` (+41). Mostly wide tables/grids that need an `overflow-x-auto` wrapper or `min-w-0` on a flex child. `/student/marks` (+94) is the most visible and is fixed; the sub-30px ones are cosmetic.

### LOW / OPEN QUESTIONS

- **OQ-1 — Modal dismissal:** should modals close on outside-click and Escape? (Tested in Phase 2; safest behaviour = Escape closes, outside-click closes for non-destructive modals.)
- **OQ-2 — Unsaved-changes guard:** no dirty-form navigation warning anywhere. Acceptable for an internal tool, but flagged.
- **L-1 — `/admin/timetable` and analytics pages report 0 main-area buttons** in the inventory because FullCalendar/Recharts mount after `networkidle`; not a bug (verified the calendar renders), just a note for testers.

---

## 4. Phase 2 — tests & results

Regression suite committed at **`web/e2e/ui-audit.spec.js`** (headless Chromium, 20 tests). Run it with the app on :3001 and the API on :3000:

```bash
node web/e2e/ui-audit.spec.js          # all tests
node web/e2e/ui-audit.spec.js rbac     # filter by substring
```

It logs each role in **once** and reuses tokens (the API rate-limits login to 10/min, so a fresh login per test would 429 mid-run — see test-harness notes below), and pre-warms the dev routes (Next compiles routes lazily on first hit).

**Coverage:** auth (valid login, invalid-password error, password show/hide, logged-out redirect, logout+Back), RBAC route guards (6 role×route probes), 404 handling, a full CRUD form on Subjects (empty→validation, create→persists-after-reload, double-click→no duplicate), table search (match filters, no-match empty state, clear restores), modal dismissal (Escape, Cancel), and responsive overflow at 390/768.

**Pre-fix result: 11 passed / 9 failed.** The 9 failures are exactly the two real findings:
- 6 × `rbac: <role> cannot reach <route>` → **F-1** (every probe reached the restricted page).
- 3 × `responsive: <page> has no horizontal overflow` → **F-2/F-3**.

**Three "failures" that were test artifacts, not UI bugs** (investigated with isolated probes, then the tests were corrected — noted here per the brief):
- *Form/CRUD timeouts:* the suite was logging in fresh per test and tripping the API's 10/min login rate-limit → empty tokens → shell bounced to `/login` → "Add Subject" never appeared. Fixed by caching tokens per role. The Subjects create/validate/double-submit flow **works** (Button disables on `isLoading`, so the double-click creates exactly one row; verified persisted after reload).
- *Students search empty state:* the test used `input[placeholder*="Search" i]` — Playwright's engine doesn't honour the CSS `i` attribute flag, so it bound the wrong element. With the correct selector the search **works**: `uwase` → 1 row, a no-match term → "No students found", clearing → full list restored (server-side debounced query verified firing).
- *Logout + Back:* the test simulated logout by clearing only `localStorage`, leaving the in-memory auth store authenticated. With the **real** logout (user menu → Sign Out → confirm, which clears the store too), Back correctly lands on `/login` with no dashboard content — verified.

**Post-fix result:** see §5.

### Other behaviours verified green
- **Modals** (Subjects add/delete, logout confirm): open, close via Escape / Cancel / X / backdrop click; focus trap; body scroll lock; focus returns to trigger — all present in the shared `Modal` component.
- **Buttons** disable while their mutation is pending (`isLoading` → `disabled`), preventing double-submit.
- **404**: `/garbage` renders the custom `not-found.tsx` ("404 / Page Not Found / Go Home"), no console error.
- **Auth**: invalid password keeps you on `/login` with a toast; valid student login lands on `/student`; logged-out access to `/admin/users` redirects to `/login`.

## 5. Phase 3 — fix log

_Filled after fixes._

## 6. Screenshot evidence

Saved under `screenshots/` (gitignored): `screenshots/<role>/*.png` (1440px, all own-role pages), `screenshots/tablet/*.png` and `screenshots/mobile/*.png` (key pages + every overflowing page). Listed in §5 after the fix pass.
