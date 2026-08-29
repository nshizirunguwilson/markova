# Markova - End-to-End Code Audit

_Audit date: 2026-06-09. Scope: `backend/` (NestJS + Prisma/PostgreSQL/Redis), with cross-references to `web/` and `mobile/`. Method: full read of every module (controllers, services, DTOs, guards, schema, migrations), the existing test suites, plus live API/DB probes against a running stack to confirm the load-bearing findings._

Status legend used in the FIX columns (filled in Phase 3): **FIXED** · **DEFERRED** · **N/A**.

---

## 0. Executive summary

The backend is feature-complete and generally well structured: a global `ValidationPipe` with `whitelist`+`forbidNonWhitelisted`, a `RolesGuard` on every module, an `OwnershipService` for per-student access checks, Redis-backed OTP/lockout/refresh-rotation, transactions around the multi-table writes that matter most (discipline, library checkout, promotion, term/year results), and a sensible index set on the schema.

The audit found **one cluster of real broken-access-control bugs in the Analytics module** (the only module that does *not* use `OwnershipService`) and **one real data-integrity bug in daily attendance** (an upsert that silently duplicates rows). Both were reproduced live. Beyond those, the findings are mostly medium/low robustness items: missing transactions on user creation, destructive cascade deletes with no guard, a wrong "late arrival" time comparison, and a few IDOR gaps on write endpoints (appeals, homework submit, conversation creation).

Headline counts: **2 HIGH**, **9 MEDIUM**, **11 LOW**. No CRITICAL (no unauthenticated RCE/auth-bypass/secret-leak). Secrets are **not** committed - `backend/.env` is gitignored and absent from git history (correcting an earlier roadmap note).

Baseline tests at audit start: backend **63 Jest tests pass** (6 suites); web **10 Vitest pass** (2 files).

---

## 1. Entity / relationship map

The Prisma schema defines **34 models**. The "13 managed entities" the project tracks for CRUD are the admin-managed reference + record types. Grouped by domain:

**Core / identity**
- `User` (1-1 `Student`, 1-1 `Teacher`, 1-N `ParentStudent`; N sessions, audit logs, messages, notifications, push tokens, tickets)
- `UserSession`, `AuditLog`, `SchoolConfig`

**Academic structure**
- `AcademicYear` 1-N `Term`; `ClassLevel` 1-N `ClassSection`; `Subject`; `AssessmentType`
- `Timetable` (ClassSection × Subject × Teacher), `ExamSchedule` (ClassSection × Subject × Term)
- `TeacherSubjectClass` (Teacher × Subject × ClassSection × AcademicYear)

**People**
- `Student` (→ ClassSection), `Teacher` (→ TeacherRole), `ParentStudent` (User↔Student link)

**Records**
- `Mark` (Student × Subject × Term × AssessmentType, unique), `TermResult`, `YearResult`
- `Attendance`, `TeacherAttendance`
- `DisciplineIncident` 1-N `DisciplineAppeal`
- `Book` 1-N `BookLoan`
- `Homework` 1-N `HomeworkSubmission`

**Communication / support**
- `Conversation` ↔ `ConversationParticipant`, `Message` 1-N `MessageRead`
- `Notification`, `PushToken`, `SupportTicket`, `FaqArticle`

---

## 2. Feature completeness - CRUD / validation / RBAC matrix

C/R/U/D: **D**one · **P**artial · **-** none (intentional). "Validation" = DTO-level class-validator on writes. "RBAC" = role guard present and scoped.

| Entity | C | R | U | D | Validation | RBAC | Notes |
|---|---|---|---|---|---|---|---|
| User | D | D | D | D(soft) | D | D (writes ADMIN; self-read for non-admin) | `create` not transactional → orphan-user risk (M-3). Soft delete = `isActive=false` + session kill. |
| Student (via User) | D | D | D | D(soft) | D | D | Created/updated through `UsersService` with role-specific branch. |
| Teacher (via User) | D | D | D | D(soft) | D | D | Same. `TeacherRole` (DOS/HOD/CLASS_TEACHER) has **no CRUD endpoint** - seed-only (L). |
| AcademicYear | D | D | D | D | D | D | Delete cascades terms→marks with no guard (M-5). |
| Term | D | D | D | D | D | D | close/reopen lifecycle present. Delete cascades marks (M-5). |
| ClassLevel | D | D | D | D | D | D | `delete` has no pre-check; cascade to sections then FK-restrict on students → raw 500 (M-5). |
| ClassSection | D | D | D | D | D | D | Same 500-on-dependents (M-5). |
| Subject | D | D | D | D | D | D | **Delete cascades all Marks silently** (M-5, data loss). |
| AssessmentType | D | D | - | D | D | D | No update (low value). |
| Timetable | D | D | D | D | D | D | Full CRUD + bulk. |
| ExamSchedule | D | D | D | D | D | D | Full CRUD + bulk. UI surface thin (roadmap P2). |
| Mark | D | D | D | D | D (`score @Max(100)` - see M-7) | D (teacher owns own marks) | `create` upserts on unique key. |
| TermResult / YearResult | D(calc) | D | D(comment/publish) | - | D | D | Computed, not directly deleted. |
| Attendance | D | D | P(upsert) | - | D | D | **Daily upsert duplicates rows - H-2.** |
| DisciplineIncident | D | D | D | D | D | D | Points adjust in txn; delete restores points. |
| DisciplineAppeal | D | D | D(review) | - | D | **P - no ownership check on create (M-4).** | Any parent/student can appeal any incident. |
| Book | D | D | D | D | D | D | Delete blocked when active loans. |
| BookLoan | D(checkout) | D | D(return/lost) | - | D | D | Checkout/return transactional; limits + overdue checks. |
| Homework | D | D | D | D | D | D (teacher owns own) | |
| HomeworkSubmission | D(submit) | D | D(grade) | - | D | **P - student can submit to any homeworkId (M-6).** | |
| Conversation / Message | D | D | D(read/status) | - | D | **P - createConversation bypasses staff-only contact policy (M-8).** | Realtime via `/chat` gateway. |
| Notification | D | D | D(read) | - | D | D | `IN_APP` type missing (reuses EMAIL/PUSH) - roadmap. |
| SupportTicket | D | D | D(status) | - | D | D | |
| FaqArticle | D | D | D | D | D | D | Public list filters `isPublished`. |
| **Analytics (read-only)** | - | D | - | - | N/A | **P - student/parent endpoints have NO ownership check - H-1.** | Only module not wired to `OwnershipService`. |

**Overall:** CRUD coverage is effectively complete for every managed entity. The gaps are not "missing endpoints" but **missing authorization on a handful of read/write paths**, plus delete-robustness.

---

## 3. Findings by severity

### HIGH

**H-1 - Broken access control (IDOR) in the Analytics module.** _Status: FIXED_
`AnalyticsController` is the only data controller that never calls `OwnershipService`. Two endpoints leak another person's data:
- `GET /analytics/student/:studentId` is open to `STUDENT`/`PARENT` but does not verify the caller owns/parents that student.
- `GET /analytics/parent/child/:studentId/trends` (`@Roles('PARENT')`) does not verify the student is the parent's child.

**Reproduced live:** logged in as `student1`, requested a *different* student's analytics →
`GET /analytics/student/<other> → HTTP 200` (leaks subject averages, term average, class rank), while the equivalent guarded endpoint `GET /marks/term-results/student/<other> → HTTP 403`.
Impact: any authenticated student or parent can enumerate every student's academic standing. For a school system holding minors' records this is a privacy breach.
Fix: inject `OwnershipService`, call `verifyStudentAccess` on both endpoints. (`getTeacherClassAnalytics` cross-class leakage is the weaker MEDIUM variant, M-9.)

**H-2 - Daily attendance "upsert" silently creates duplicate rows.** _Status: FIXED_
`AttendanceService.markAttendance` / `bulkMarkAttendance` upsert with `where: { studentId_date_type_subjectId: { …, subjectId: dto.subjectId || '' } }` but `create: { subjectId: dto.subjectId || null }`. For daily attendance `subjectId` is null; the lookup key uses `''`, which never matches a stored `NULL`, and Postgres unique indexes treat `NULL`s as distinct - so the update branch is never taken and a **second row is inserted**.
**Reproduced live:** marking the same student/date `PRESENT` then `ABSENT` produced **2 rows** (`PRESENT,ABSENT`). `getClassAttendance`/`getStudentSummary` read `attendances[0]`, so a corrected mark can show stale status and inflate counts.
Fix: handle the null-subject case explicitly (find-then-update/create) instead of relying on the compound-unique upsert when `subjectId` is null.

### MEDIUM

**M-3 - `UsersService.create` is not transactional → orphan users.** _Status: FIXED_
The base `user` row is created first, then the role-specific `student`/`teacher`/`parentStudent` rows in separate calls. If the second step fails (e.g. bad `classSectionId`, FK error), the user persists with no student record - a half-created account that breaks logins and lists. `bulkImport` already wraps everything in `$transaction`; the single-create path should too. (Same shape in `update` for parent-link rebuild.)

**M-4 - Discipline appeal creation has no ownership check (IDOR).** _Status: FIXED_
`POST /discipline/appeals` (`@Roles('PARENT','STUDENT')`) takes an `incidentId` and never checks the caller is the incident's student or a linked parent. Any parent/student can file (and thereby surface to admins) appeals on **other** students' incidents.
Fix: `verifyStudentAccess` against the incident's `studentId` before creating the appeal.

**M-5 - Destructive cascade deletes with no guard / raw 500s.** _Status: FIXED (subject/year/term guarded; section/level pre-checked)_
`deleteSubject` cascade-deletes every `Mark` for that subject **silently** (real data loss). `deleteYear`/`deleteTerm` cascade to marks/results. `deleteClassLevel`/`deleteSection` hit an FK-restrict from `Student` and surface a raw 500 rather than a 400. None pre-check dependents.
Fix: block (or require explicit confirmation for) deletes that would remove dependent academic records; return a clear 400 with the dependent count.

**M-6 - Homework submission accepts any `homeworkId`.** _Status: FIXED_
`POST /homework/submit` upserted on `(homeworkId, studentId)` with no check that the homework belonged to the student's class section, so a student could submit to another class's assignment. Now verifies the student's `classSectionId` matches the homework's before accepting (ForbiddenException otherwise).

**M-7 - `Mark.score` DTO hard-caps at `@Max(100)`.** _Status: DEFERRED (documented)_
A subject may define `maxMarks` ≠ 100, and a per-assessment `maxScore` may exceed 100; the service already validates `score ≤ maxScore`, but the DTO's `@Max(100)` rejects legitimate raw scores for such subjects before the service runs. Either remove the static cap and rely on the service check, or make it explicit that scores are normalized to /100. Flagged for a product decision rather than silently changed.

**M-8 - `createConversation` bypasses the staff-only contact policy.** _Status: DEFERRED_
`getContacts` restricts students/parents to messaging staff only, but `POST /messaging/conversations` accepts arbitrary `participantUserIds`, so a student can open a direct chat with another student by supplying their user id. Discovery is restricted; creation is not.

**M-9 - Teacher class analytics not scoped to assigned classes.** _Status: FIXED_
`GET /analytics/teacher/class/:classSectionId` returns term results / underperforming students for **any** section id, not just the teacher's assignments (only the per-subject block is assignment-filtered). Cross-class leakage among teachers.

**M-10 - Wrong "late arrival" time comparison.** _Status: FIXED_
`processQrScan`/`processNfcScan`/`processTeacherQrScan` compute lateness as `now.getHours() >= 8 && now.getMinutes() > 30`. This is true only when the **minute** is >30, so 09:10 or 10:05 are counted **on-time** while 08:31-08:59 (and any HH:31-59) are "late". Correct logic: `hours > 8 || (hours === 8 && minutes > 30)`.

**M-11 - Forced password change is advisory only.** _Status: DEFERRED_
`forcePasswordChange` is returned to clients and gated in the UI, but the API issues full tokens and accepts all requests while the flag is set. A user who ignores the prompt (or calls the API directly) keeps full access on the seeded default password.

### LOW (recommendations only)

- **L-1** Email has no retry/queue. `bullmq` is a dependency but unused for mail; a Brevo outage drops OTP/notification emails silently. In production (`devOtp` suppressed) an SMTP outage blocks all non-student logins. Recommend a retry/queue + an `IN_APP`/console OTP fallback path.
- **L-2** Email templates interpolate `title`/`message`/`firstName` into HTML unescaped. Inputs are admin/staff-controlled today, but escaping would harden against stored-content injection.
- **L-3** Access tokens are stateless (15 min); logout only invalidates the refresh session, so a leaked access token stays valid until expiry. Standard JWT trade-off; document it.
- **L-4** `bulkMarkAttendance` swallows **all** errors in its loop (`catch {}`), hiding non-duplicate failures. Narrow the catch to the duplicate case.
- **L-5** N+1 read patterns in `AnalyticsService.getClassComparisons` (query per section), `getPerformanceTrends`/`getParentChildTrends` (per term), and `LibraryService.getAnalytics` (per popular book). Fine at current scale; revisit with `groupBy`/`in` if data grows.
- **L-6** `exportEverythingZip` loads every table fully into memory and builds the ZIP in RAM. Acceptable for a single school; stream if datasets grow.
- **L-7** Legacy `POST /academic/promote` (threshold auto-promote) still ships alongside the newer `promote/preview` + `promote/commit` deliberation flow. Redundant; consider removing.
- **L-8** `TeacherRole` (DOS/HOD/CLASS_TEACHER) has no management endpoint - seed-only. Fine if intentional.
- **L-9** `deleteClassLevel`/`deleteSection`/`deleteAssessmentType` don't `findUnique` first, so deleting a missing id throws P2025 → 500 instead of 404 (inconsistent with the other delete methods).
- **L-10** `registerNfcCard` has a check-then-update TOCTOU; the DB unique constraint catches the race but surfaces an unhandled P2002 → 500. Wrap to return 409.
- **L-11** Reports PDF (`htmlToPdf`) falls back to a hard-coded macOS Chrome path; on Linux/prod `CHROME_PATH` must be set or PDF generation throws. Ops/deploy note.
- **L-12 (FIXED)** Boot emitted a `LegacyRouteConverter` warning from the `uploads/(.*)` global-prefix exclude (Express 5 / path-to-regexp v8). Switched to the named-wildcard `uploads/{*path}`; the app now boots warning-free.

---

## 4. Security review (summary)

- **AuthN/AuthZ:** JWT access (15 m) + refresh (7 d) with Redis-locked rotation and replay invalidation; `RolesGuard` on every module; `OwnershipService` for per-student scoping. **Gap:** Analytics module bypasses ownership (H-1, M-9); appeals/homework/conversation write paths under-check (M-4, M-6, M-8).
- **Input validation:** global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`; DTOs broadly decorated. UUID params via `ParseUUIDPipe`. One over-tight bound (M-7).
- **Injection:** all DB access via Prisma (parameterized) - no raw SQL string-building. No SQL-injection surface found. Email HTML interpolation is the only injection-adjacent spot (L-2).
- **Secrets:** `backend/.env` is **gitignored and not in git history** (verified). The earlier roadmap claim of a "committed Brevo key" is incorrect and is corrected here. JWT strategy hard-fails if `JWT_SECRET` is unset. Action: still rotate any real key that lived in a local `.env`, and keep `NODE_ENV=production` so `devOtp`/`devToken` are suppressed.
- **Rate limiting:** global `ThrottlerGuard` (100/min) + tighter per-route limits on login (10), resend-otp (5 + 30 s cooldown), uploads (10). Login lockout after 5 failures for 30 min (Redis). Adequate.
- **Sensitive fields in responses:** `passwordHash` is never selected in API reads and is stripped from the full export. JWT `validate` and profile selects are explicit allow-lists.
- **File uploads:** mime filter + 5 MB limit + magic-byte validation; old files cleaned on replace; self-or-admin scoping on photo upload.
- **Headers/CORS:** `helmet`, `compression`, explicit CORS allow-list from env (HTTP and WS gateway share it).

---

## 5. Email system review (Brevo / SMTP via nodemailer)

- **Transport:** `NotificationsService.onModuleInit` builds a nodemailer SMTP transport from `SMTP_*` env (Brevo). Twilio SMS is optional and similarly lazy.
- **Templates:** inline HTML (header/body/footer), one shared layout reused for OTP, password reset, attendance/discipline/library notifications. No external template engine.
- **Failure handling:** every send path is wrapped - `send()`/`sendBulk()`/`sendEmailToAddress()` catch and **log** failures without throwing, so a mail outage never fails the triggering operation (attendance still records, OTP still stored). `sendBulk` uses `Promise.allSettled` and logs the failed count.
- **Retry / queue:** **none.** No backoff, no dead-letter, `bullmq` unused for mail (L-1). A Brevo outage silently drops messages.
- **Brevo down - what happens:** OTP is still generated, stored in Redis, and logged; in dev it's returned as `devOtp`, so login works. **In production** (`devOtp` suppressed) a non-student login cannot complete because the code only reaches the user by email/SMS - single point of failure (L-1). Recommend queue + retry and/or an alternate OTP delivery/inspection path.

---

## 6. Data-integrity review

- **FK constraints:** comprehensive; child rows mostly `onDelete: Cascade` to their parent, `AuditLog.user` is `SetNull`, `Attendance.subject` is `SetNull`.
- **Cascade risk:** `Subject`/`Term`/`AcademicYear` deletes cascade into `Mark`/result rows with no guard - destructive (M-5). `ClassSection`/`ClassLevel` deletes are blocked by the `Student` restrict relation and surface as 500s (M-5).
- **Soft vs hard delete:** users are soft-deleted (`isActive=false`) - consistent, and the reason FK restricts never fire in practice. Most other deletes are hard. No soft-delete-consistency bug found (no endpoint resurrects or double-counts soft-deleted users; lists filter `isActive`/`status` where relevant).
- **Orphan risk:** M-3 (non-transactional user create) is the one real orphan vector. Daily-attendance duplication (H-2) is the one real duplicate-row vector. Both reproduced and fixed.
- **Transactions present where needed:** discipline incident (+points), library checkout/return (+availableCount), promotion commit, term/year result calc, bulk import. Good coverage.
- **Indexes:** role/isActive on users; conversation+createdAt on messages; class+date and student+date on attendance; status on loans; etc. No materially missing index found for the current query set.

---

## 7. Incomplete work / dead code

- Two genuine `// placeholder` comments: PUSH-via-Firebase branches in `NotificationsService` (Expo push *is* implemented via `sendPushNotification`; the FCM branch is an intentional stub). Not a bug.
- Legacy `promoteStudents` endpoint superseded by the deliberation flow (L-7).
- `TeacherRole` management UI/endpoint absent (L-8).
- Roadmap P2/P3 items still open: audit-log viewer, exam-schedule UI depth, document templates verification, `IN_APP` notification type, secrets-to-env hardening, Prisma 7 config migration, e2e/CI.
- No `// TODO`/`// FIXME` debt of substance in the backend.

---

## 8. Open questions (intended behavior unclear - not guessed)

1. **M-7 (`score @Max(100)`):** Are raw marks intended to always be entered on a 0-100 scale (so the cap is correct), or should subjects with `maxMarks ≠ 100` accept raw scores up to their own max? Left unchanged pending your call.
2. **M-8 (student↔student chat):** Is student-to-student messaging meant to be blocked entirely (matching `getContacts`), or only undiscoverable? Enforcement point depends on the intended policy.
3. **M-11 (forced password change):** Should the API hard-block all non-auth endpoints while `forcePasswordChange` is set, or is the UI gate sufficient by design?
4. **M-5 (subject/term/year delete):** Should deleting a subject/term/year be allowed to wipe historical marks at all, or should it be soft-disabled (`isActive=false`) like users?

---

## 9. Test results

**Baseline (before changes):** backend `jest` → 6 suites / 63 tests pass; web `vitest` → 2 files / 10 tests pass.

**After Phase 2 + 3:** backend `jest` → **12 suites / 124 tests pass**; web `vitest` → **2 files / 10 tests pass**; `nest build` → clean; `next build` → clean.

New backend specs added (6 files) + extended attendance/academic specs. The bug-regression tests were written to assert the *correct* post-fix behaviour, ran red against the unfixed code (documenting each bug), and went green once the matching fix landed.

**Per-module service coverage** (statements; `jest --coverage`). Modules at 0% are read-mostly/aggregation services not in this round's fix scope - listed as follow-up:

| Service | % Stmts | Tested behaviour |
|---|---|---|
| app | 100 | health/root |
| ownership | 90.6 | student/parent/teacher access checks |
| homework | 62.5 | create/update ownership, late grading, submit scoping |
| auth | 62.6 | login/OTP/refresh/change-password (pre-existing) |
| notifications | 53.7 | email dispatch + template + failure swallowing |
| library | 51.8 | checkout limits/overdue, return, reminders |
| marks | 51.4 | mark CRUD + results (pre-existing) |
| attendance | 47.4 | mark/upsert/QR/late/chronic |
| users | 39.1 | create txn, update, soft-delete |
| discipline | 35.8 | incidents, appeals + ownership, review |
| analytics | 22.5 | dashboard + teacher scoping |
| academic | 20.6 | term lifecycle, promotion, delete guards |
| **messaging / reports / school-config / help** | 0 | not in this round's scope (follow-up) |

Overall line coverage is ~20% because the metric counts every file (controllers, DTOs, modules, `main`, HTML report templates). This round targeted the **service logic** behind the audit findings, not blanket coverage.

---

## 10. Phase 3 fix log (commit-by-commit)

Branch: `audit/security-and-integrity-fixes` (off `master`; not pushed).

| Commit | Finding | What changed |
|---|---|---|
| `cd55c27` | H-1, M-9 | Analytics ownership checks on student/parent endpoints; teacher analytics scoped to assigned sections. |
| `d4e3ec5` | H-2, M-10 | NULL-safe daily-attendance upsert (no more duplicate rows); correct 08:30 late cutoff. |
| `4040693` | M-3 | User + role-record creation wrapped in one transaction (no orphan users). |
| `d3f0f3f` | M-4 | Ownership check before creating a disciplinary appeal. |
| `f5cd1ef` | M-5, L-9 | Dependency guards on subject/term/year/section/level deletes (clean 400, no silent cascade). |
| `4048fb0` | M-6 | Homework submissions restricted to the student's own class section. |
| `628b546` | (tests) | Library + notifications/email service specs. |
| `6f89666` | L-12 | Removed the `LegacyRouteConverter` boot warning. |

**Live re-verification (running stack):**
- H-1: student → another student's analytics now **403** (was 200); own analytics still **200**.
- H-2: re-marking the same student/date now yields **1 updated row** (was 2 duplicate rows).
- Boot: 187 routes mapped, "Nest application successfully started", **no warnings**; health = db ok / redis ok.
- Spot checks: public branding 200, admin-only `/users` as a student 403.

**Deferred (need a product decision - see §8 Open Questions):** M-7 (`score @Max(100)`), M-8 (student↔student chat policy), M-11 (forced-password-change hard block). LOW items L-1…L-11 remain as recommendations.
