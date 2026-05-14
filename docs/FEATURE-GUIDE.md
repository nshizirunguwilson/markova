# Markova — Feature Outline & Testing Guide

This document has two parts:

- **Part A** is a high-level outline of the primary features, grouped by role and area.
- **Part B** is the step-by-step testing & usage walkthrough: for each feature, how to access it, the steps to use it, and what to expect.

Use Part A when you need a quick map of what the system does. Use Part B when you're demoing, training a new user, or smoke-testing before a release.

---

# Part A — Feature Outline

## A1. Authentication & Access

- Email or phone login
- OTP verification for staff and parents (email/SMS)
- Password reset by email
- Account lockout after repeated failed attempts
- Rate limiting on auth endpoints
- Role-based access control (Admin, Teacher, Student, Parent, Librarian)
- Refresh tokens and concurrent-session limits

## A2. Admin

- School-wide dashboard and analytics
- User management (students, teachers, parents, librarians)
- Bulk student import (CSV)
- Academic configuration (years, terms, subjects, class levels, sections, assessment types)
- Timetable and exam schedule management
- Marks oversight and term/year result calculation
- Attendance oversight (including chronic absenteeism alerts)
- Discipline incidents and appeals
- Library oversight
- Reports and document generation (term reports, transcripts, ID cards)
- Onboarding wizard
- End-of-year student promotion
- School settings (logo, branding, grading scale)
- Help center and support tickets
- Audit trail

## A3. Teacher

- Class and subject dashboard
- Marks entry (single, batch)
- Attendance marking (manual, QR, NFC)
- Homework assignment and grading
- Discipline incident recording
- Class-level analytics
- Messaging with admin, parents, and students
- Profile management

## A4. Student

- Personal dashboard (timetable, recent marks, upcoming homework)
- View own marks and report cards
- View own attendance
- View own discipline record
- Homework submission
- Library catalog and personal loans
- Messaging with teachers and admin
- Personal analytics
- Profile management

## A5. Parent

- Per-child dashboards
- View each child's marks, attendance, discipline, reports, analytics
- File discipline appeals
- Messaging with teachers and admin
- Profile management

## A6. Librarian

- Book catalog management
- Checkout and return
- Active and overdue loan tracking
- Overdue reminders
- Lost-book reporting

## A7. Messaging

- Real-time chat (WebSocket)
- One-on-one, group, and broadcast conversations
- Online presence and read receipts
- Typing indicators

## A8. Notifications

- In-app notifications with unread badge
- Email delivery (via SMTP)
- SMS delivery (via Twilio / Africa's Talking)
- Push notifications to mobile devices

## A9. Reports & Documents

- Term report cards (PDF)
- Year report
- Student ID cards (single and bulk)
- Transfer letters, transcripts, certificates

## A10. File Uploads

- School logo, signature, stamp
- User profile photos
- Persistent storage and public serving

## A11. Mobile App (Expo)

- Native iOS / Android
- Same role-based access as web
- Push notification support
- Secure token storage

## A12. System & Operations

- Health checks (database, Redis)
- Audit logging on sensitive mutations
- Throttling and abuse protection
- Sentry error monitoring
- Structured API errors

---


# Part B — Testing & Usage Walkthrough

## 1. Setting up before testing

### 1.1 Bring up the stack

```bash
# From the repo root
docker compose up -d            # Postgres on :5434, Redis on :6380
cd backend
npx prisma migrate deploy        # Apply DB schema
npx prisma db seed               # Load demo data (only the first time)
npm run start                    # Backend on :3000

# In a new terminal
cd ../web
npm run dev                      # Web on :3001
```

Open `http://localhost:3001` in a browser.

### 1.2 Demo credentials (all use password `Password123!`)

| Role | Email | Notes |
|---|---|---|
| Super Admin | `wilsonshizirungu@gmail.com` | OTP required |
| Teacher | `sarah.nakamya@markova.academy` | OTP required |
| Librarian | `librarian@markova.academy` | OTP required |
| Student | `student1@markova.academy` | No OTP (direct token) |
| Parent | uses **phone** (see below) | OTP required |

For a parent, look up a phone from the DB:
```bash
PGPASSWORD=password psql -h localhost -p 5434 -U markova -d markova \
  -c "SELECT email, phone, role FROM users WHERE role='PARENT' LIMIT 3;"
```

### 1.3 About OTPs in development

The seeded SMTP config is real (Brevo), so emails go out for real. **For testing, you don't need to wait for the email** — the API response includes a `devOtp` field, and the backend prints `OTP for <email>: <code>` to its console. Both work.

---

## 2. Authentication

### 2.1 Login as Admin

1. Open `http://localhost:3001`.
2. You should be redirected to `/login`.
3. Enter email `wilsonshizirungu@gmail.com` and password `Password123!`.
4. Click **Sign in**.

**Expected:**
- "Verify OTP" prompt appears.
- An OTP arrives by email (visible in the backend console as `OTP for <email>: 123456`).
- After entering the 6-digit code, you land on `/admin`.

**What to check:**
- The header shows your name.
- The sidebar lists admin sections.

### 2.2 Login as Student (no OTP)

1. On `/login`, enter `student1@markova.academy` / `Password123!`.
2. Sign in.

**Expected:** student dashboard loads immediately without an OTP step.

### 2.3 Login as Parent (phone)

1. Toggle to **Phone** on the login form.
2. Enter a parent phone (e.g. `+2567000001000`) and `Password123!`.
3. Submit, enter OTP from email/console.

**Expected:** parent dashboard.

### 2.4 Wrong credentials

Enter a wrong password 5 times.

**Expected:**
- First 4 attempts: "Invalid credentials" / 401.
- 5th attempt: account is locked for 30 minutes.
- After that window, login works again.

### 2.5 Rate limiting

Hammer the login endpoint 11 times in under a minute (e.g. `for i in {1..11}; do curl -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"x@x.com","password":"x"}'; done`).

**Expected:** the 11th request returns **429 Too Many Requests**.

### 2.6 Change password (logged in)

`Settings → Change Password` → enter current + new → submit.

**Expected:** 200, next login uses the new password.

### 2.7 Forgot password

On `/login`, click **Forgot password** → enter email → check inbox.

**Expected:** email with a reset link arrives. The link opens a form to set a new password.

### 2.8 Logout

Click your avatar → **Logout**.

**Expected:** session ends, you're back at `/login`, calling any API with the old token returns 401.

---

## 3. Admin features

### 3.1 Dashboard `/admin`

Should display: total students, total teachers, total parents, total classes, performance trends, attendance summary, recent activity.

**Verify:** numbers match the seed (30 students, 5 teachers, 15 parents, 3 classes).

### 3.2 Manage users `/admin/users`, `/admin/students`, `/admin/teachers`

**List users**
1. Visit `/admin/users`.
2. Filter by role.

**Expected:** paginated table with email, phone, role, status.

**Add a user**
1. Click **+ Add user** (or **+ Add student / + Add teacher**).
2. Fill the form: email or phone, first/last name, role, gender, password.
3. Save.

**Expected:** 201 response; user appears in the list. For students, a `MKV-YYYY-NNNN` student ID is auto-assigned.

**Bulk import students**
1. Visit `/admin/students`.
2. Click **Import CSV**.
3. Download the template, fill rows, upload.

**Expected:** all rows created with unique student IDs (`MKV-2026-0001`, `0002`, ...). Errors per row are reported.

**Edit a user**
1. Click a row → **Edit**.
2. Change a field, save.

**Expected:** 200, change reflected.

**Deactivate / delete**
1. Row action → **Delete**.

**Expected:** user is removed (admin) or marked inactive (depending on role).

### 3.3 Academic configuration `/admin/classes`, `/admin/subjects`, `/admin/timetable`, `/admin/settings`

For each (year, term, subject, class-level, class-section, assessment-type, timetable, exam):

1. Open the page.
2. Click **+ Add**.
3. Fill required fields (see DTOs in `/backend/src/modules/academic/dto/`).
4. Save.

**Expected:** 201, item appears. Edit and delete work the same way (200).

**Special — timetable:**
- DTO: `classSectionId`, `subjectId`, `teacherId`, `dayOfWeek` (1=Mon … 7=Sun), `startTime`, `endTime`, optional `room`.
- No `termId` field.

**Special — exams:**
- Field is `examDate` (not `date`).
- No `name` field.

### 3.4 Marks `/admin/marks`

**Single mark**
1. Open a class.
2. Open a student row.
3. Enter a score for a subject + assessment type.
4. Save.

**Expected:** 201 with the new mark. Listing the marks shows it.

**Batch marks**
1. Open `Class → Subject → Assessment`.
2. Enter scores for every student in the table.
3. Click **Save batch**.

**Expected:** all marks persisted in one request.

**Calculate term results**
1. From class → **Calculate term results**.

**Expected:** term result rows created/updated for each student. They appear in `Term Results`.

**Calculate year results**
1. From class → **Calculate year results**.

**Expected:** year result rows created/updated; promotion eligibility computed.

### 3.5 Attendance `/admin/attendance`

**Mark one student**
1. Pick date, class, student.
2. Set status (PRESENT / ABSENT / LATE / EXCUSED).
3. Save.

**Expected:** 201 attendance record persisted.

**Bulk mark a class**
1. Pick class + date.
2. Set statuses for all students.
3. Save.

**Expected:** 201; all rows written.

**Chronic absenteeism**
1. Open the **Chronic** tab.

**Expected:** students with absence rate above threshold listed. Click **Notify** to send alerts to parents.

### 3.6 Discipline `/admin/discipline`

**Record an incident**
1. Click **+ Record incident**.
2. Pick student, term, date, action taken (VERBAL_WARNING / WRITTEN_WARNING / DETENTION / SUSPENSION / EXPULSION), description, points deducted.
3. Save.

**Expected:** 201; student's `disciplinePoints` reduces by `pointsDeducted`. Parent gets a notification.

**Acknowledge an incident**
1. Open an incident → **Acknowledge**.

**Expected:** status updates; acknowledgement recorded.

**Appeals**
- Parent can file an appeal from their portal.
- Admin reviews under `/admin/discipline → Appeals`.

### 3.7 Homework `/admin/homework`

Admin can list and delete. Teachers create homework — see §4.

### 3.8 Library `/admin/library`

**Books**
- Add a book: title, author, optional ISBN, optional category, quantity.
- Edit, delete the same way.

**Checkout**
1. Click **Checkout**.
2. Enter book identifier (book UUID or barcode) + student identifier (`MKV-…` number or user UUID).
3. Save.

**Expected:** 201. The book's `availableCount` decreases by one. A loan row appears under **Active loans**.

**Common pitfall:** if the student has an overdue ACTIVE loan, the checkout returns **400 — Cannot borrow — has overdue books**. Return their overdue book first.

**Return**
1. Open the loan → **Return**.

**Expected:** 201; loan status flips to RETURNED; `availableCount` increases.

**Mark as lost**
- Open active loan → **Report lost** → confirms with replacement cost.

### 3.9 Messaging `/admin/messages`, `/messages`

1. Click **New conversation**.
2. Pick the recipient(s) (one-on-one, group, or broadcast).
3. Type a message → Send.

**Expected:**
- Message persists.
- If the recipient is online, the message appears in their conversation in **real time** (verified — websocket on `/chat` namespace).
- If offline, they see it on next refresh, and get a push/email notification depending on their preferences.

### 3.10 Notifications `/admin/notifications` (and bell icon)

- Bell icon shows unread count.
- Click → list of notifications.
- Click one → marks it read.
- **Mark all read** clears unread count.

**Expected:** counts update; bell badge clears.

### 3.11 Reports `/admin/reports`

**Term report card (PDF)**
1. Pick student → term → **Download PDF**.

**Expected:** a PDF (~150 KB) downloads. Open it to verify: school logo, student details, marks per subject, average, position, grade, teacher comment, headmaster comment, term dates.

**Year report**
1. Pick student → year → **View**.

**Expected:** consolidated year results across all terms.

**Bulk ID cards**
1. Pick a class section → **Generate ID cards**.

**Expected:** payload with one card per student (the web app renders these to PDF client-side).

**Other documents**
- Transfer letter, transcript, certificate — `Documents → Generate`.

### 3.12 ID cards `/admin/id-cards`

Pick a class → preview cards → print.

### 3.13 Onboarding `/admin/onboarding`

A guided wizard for first-time school setup: school name, logo, contact, term dates, classes. Each step persists to `school_configs`.

### 3.14 Promotion `/admin/promotion`

End-of-year flow: promote students to the next class level based on year results.

1. Pick academic year → **Run promotion**.
2. Review the per-student decision.
3. Confirm.

**Expected:** eligible students moved to next class section; non-eligible flagged for repeat.

### 3.15 School settings `/admin/settings`

Per-key edits (school name, motto, theme color, grading scale, etc.). Upload logo / signature / stamp from this page.

**Verify uploads:** the file is stored under `backend/uploads/branding/<uuid>.png` and served at `http://localhost:3000/uploads/branding/<uuid>.png`. Logos should display in headers and report cards.

### 3.16 Help `/admin/help`

- **FAQs** (admin-only) — create, edit, delete.
- **Tickets** — incoming support requests from any user.
- Update ticket status to OPEN / IN_PROGRESS / RESOLVED / CLOSED.

### 3.17 Analytics `/admin/analytics`

- Performance trends across terms.
- Class comparisons.
- Attendance trends.
- Discipline trends.
- Library usage.

**Verify:** charts render; numbers reflect seeded marks/attendance.

### 3.18 Audit logs

All sensitive mutations are logged automatically (interceptor on `marks`, `attendance`, `users`, etc.). Currently there is no dedicated audit-log UI page — query the `audit_logs` table directly:

```bash
PGPASSWORD=password psql -h localhost -p 5434 -U markova -d markova \
  -c "SELECT created_at, action, entity_type, entity_id FROM audit_logs ORDER BY created_at DESC LIMIT 10;"
```

---

## 4. Teacher features

Sign in as `sarah.nakamya@markova.academy`.

### 4.1 Dashboard `/teacher`

Shows: assigned classes, today's timetable, recent submissions, pending marks.

### 4.2 Marks entry `/teacher/marks`

Same flow as admin — but only for classes/subjects assigned to this teacher.

### 4.3 Attendance `/teacher/attendance`

Teachers mark their own class. QR-code scan and NFC-scan options exist (require a phone/scanner device).

### 4.4 Homework `/teacher/homework`

**Assign**
1. Click **+ New homework**.
2. Pick subject + class section + term, title, description, due date, optional max marks, late deduction.
3. Save.

**Expected:** 201; homework appears for every student in that class. Parents receive a notification.

**Grade submissions**
1. Open homework → **Submissions**.
2. Enter score and feedback per student.
3. Save.

### 4.5 Discipline `/teacher/discipline`

Teachers can record incidents the same way admins can.

### 4.6 Messages `/teacher/messages`

Real-time chat with admin, other teachers, parents (of their students), and students in their classes.

### 4.7 Analytics `/teacher/analytics`

Performance of teacher's own classes — averages by subject, by class, trends.

### 4.8 Profile `/teacher/profile`

Edit personal info, upload photo, change password.

---

## 5. Student features

Sign in as `student1@markova.academy`.

### 5.1 Dashboard `/student`

Today's timetable, recent marks, upcoming homework, attendance summary.

### 5.2 Marks `/student/marks`

Read-only view of own marks by term, by subject. Term result card view.

### 5.3 Attendance `/student/attendance`

Personal attendance log — daily and by subject.

### 5.4 Discipline `/student/discipline`

Read-only — students see their own incidents and current discipline points.

### 5.5 Homework `/student/homework`

- Lists active and overdue homework.
- Click → see description and due date.
- Click **Submit** → uploads/marks as submitted.

**Expected:** submission timestamp recorded. Teacher can grade it.

### 5.6 Library `/student/library`

- Browse books.
- See own active loans, due dates.

### 5.7 Messages `/student/messages`

Chat with assigned teachers and admin.

### 5.8 Reports `/student/reports`

Download own report cards by term.

### 5.9 Analytics `/student/analytics`

Personal performance trends across terms.

### 5.10 Profile `/student/profile`

Edit display info, upload photo, change password.

---

## 6. Parent features

Sign in by phone (see §1.2).

### 6.1 Dashboard `/parent`

Cards for each child linked to this parent.

### 6.2 Per-child data

For every child: marks `/parent/marks`, attendance `/parent/attendance`, discipline `/parent/discipline`, reports `/parent/reports`, analytics `/parent/analytics`.

**Expected:** parents can only see their own children. Trying to query another student returns 403.

### 6.3 Discipline appeals

If a parent disagrees with an incident, they can file an appeal:
1. Open the incident → **Appeal**.
2. Write reason → submit.

**Expected:** appeal goes to admin queue (`/admin/discipline → Pending appeals`).

### 6.4 Messages `/parent/messages`

Real-time chat with the child's teachers and the school admin.

---

## 7. Librarian features

Sign in as `librarian@markova.academy`.

### 7.1 Books `/librarian/books`

Full CRUD on the library catalog.

### 7.2 Loans `/librarian/loans`

- Active loans tab.
- Overdue tab.
- **Send reminders** — emails students with overdue books.

### 7.3 Checkout / Return

Same UI as admin §3.8.

### 7.4 Messages `/librarian/messages`

Chat with students about loans.

---

## 8. Cross-cutting / system features

### 8.1 File uploads

**Where used:**
- School logo, signature, stamp (admin → settings).
- User photos (user profile).

**Verify:** after upload, the returned URL (`/uploads/branding/<uuid>.png` or similar) is fetchable. Files persist in `backend/uploads/`.

### 8.2 Real-time messaging

WebSocket on the `/chat` namespace, authenticated by JWT. When a message is sent (via either WS or REST), every online participant receives a `newMessage` event in real time.

**Quick test:** open two browsers with different users in conversation; sending from one shows up instantly in the other.

### 8.3 Email delivery

SMTP via Brevo is configured. Emails are sent for:
- OTP codes
- Password reset links
- Notifications (where the user's preference is EMAIL)
- Library overdue reminders
- Discipline alerts to parents

**Test:** trigger any of the above with a real inbox you control.

### 8.4 SMS delivery

Twilio (or Africa's Talking depending on env) is configured. Used the same way as email for users whose preference is SMS.

### 8.5 Push notifications (mobile)

The Expo mobile app registers a push token via `POST /api/notifications/push-token`. Notifications with `type: PUSH` are delivered to the device's notification tray.

### 8.6 RBAC (role-based access)

Every protected endpoint enforces role membership via `@Roles(...)`. Unauthenticated calls return 401; wrong-role calls return 403. Verified for all four roles across 50+ endpoints.

### 8.7 Rate limiting

Throttler applied globally (100 req/min) and tighter on auth (10 req/min per IP). Exceed → 429.

### 8.8 Audit trail

Every mutation on sensitive entities (users, marks, attendance, discipline, etc.) is recorded in the `audit_logs` table with: user ID, action, entity, entity ID, body summary, IP address, timestamp.

### 8.9 Account lockout

After 5 failed login attempts in 15 minutes, the account is locked for 30 minutes. Verified.

### 8.10 Refresh tokens

Access tokens expire after 15 minutes. The client uses `POST /api/auth/refresh` with the refresh token (7-day lifetime) to get a new access token. After refresh, the old session is invalidated to prevent replay.

### 8.11 Session limit

Max 3 concurrent active sessions per user. The 4th login deactivates the oldest session.

---

## 9. Mobile app (Expo)

```bash
cd mobile
npx expo start
```

- Press `w` for web, `i` for iOS simulator, `a` for Android.
- Scan the QR with Expo Go on a real device.

Currently verified: bundles cleanly (5.2 MB), TypeScript clean. Runtime flows (login, view marks, push notifications) need a device test.

---

## 10. Smoke-test checklist (5 minutes before a demo)

Run these in order:

1. ✅ `docker compose ps` — both containers `Up`.
2. ✅ `curl -fsS http://localhost:3000/api/health` returns `"status":"ok"` and both `database` + `redis` checks green.
3. ✅ Open `http://localhost:3001/login` — login form renders.
4. ✅ Login as admin, land on `/admin`, see seeded numbers (30/5/15/3).
5. ✅ `/admin/students` lists 30 students.
6. ✅ Open one student → report card PDF downloads.
7. ✅ Open `/admin/messages` → real-time send/receive works.
8. ✅ Sign out, sign in as student, see own data only.

If any of these fail, do not demo — fix first.

---

## 11. Known limitations (be upfront about these)

- **Email + SMS delivery** rely on external providers (Brevo / Twilio). If their credits run out, the OTP messages won't arrive — but the dev `devOtp` field and backend logs always have the code.
- **Mobile app** is bundled but runtime flows are unverified end-to-end. Treat the mobile UI as alpha until first device test.
- **Audit logs** have no dashboard UI yet — query the table directly.
- **Photo upload on user profile** uses the same pattern as logo upload (verified) but the per-user endpoint isn't independently smoke-tested.
- **Promotion logic** depends on year results being calculated first.
- **The 5 seeded book loans** are now due 14 days from seed time (fixed). Re-seed if you've been running the demo for more than two weeks to avoid stale overdue flags.

---

## 12. Where to look when something breaks

| Symptom | First place to look |
|---|---|
| 401 on every request | Token expired — log in again or call `/api/auth/refresh` |
| 403 | Wrong role for this endpoint — check `@Roles(...)` on the controller |
| 400 "validation failed" | Check the DTO in `backend/src/modules/<mod>/dto/` |
| 404 | Path typo — `grep -i <thing> /tmp/routes.txt` (regenerate with backend startup logs) |
| 500 | Look at `backend` console — Prisma errors usually explain the column or constraint |
| Realtime not working | Confirm client connects to `http://host:3000/chat` (note the `/chat` namespace) |
| Login OTP not arriving | Check `backend` console — OTP always printed there |
| Uploaded image 404 on display | Re-verify the file is in `backend/uploads/<subdir>/<uuid>.png` |

---

*This guide is maintained alongside the codebase. When you add a new feature, add a section here with steps + expected behaviour. If a step here ever stops matching reality, treat that as a bug.*
