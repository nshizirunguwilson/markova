# Testing Markova, end to end

Everything in the system, how to exercise it, and what a correct result looks
like. Written to be followed by somebody who has never seen the project, on a
machine where nothing is running yet.

The system is 21 backend modules behind 294 API routes, 91 web pages and 59
mobile screens, used by 10 kinds of person. This guide walks all of it.

Two other documents overlap and are narrower on purpose: `PRESENTATION.md` is
the short runbook for a live demo, and `LOAD-BALANCING.md` covers the scaled
deployment. `FEATURE-GUIDE.md` predates the admissions, clinic, activities,
pocket money and finance work and the five staff roles that came with them;
where the two disagree, this file is the current one.

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Every account you can sign in as](#2-every-account-you-can-sign-in-as)
3. [What is already in the database](#3-what-is-already-in-the-database)
4. [The automated tests](#4-the-automated-tests)
5. [Authentication](#5-authentication)
6. [Admin, the principal](#6-admin-the-principal)
7. [Head teacher, the Director of Studies](#7-head-teacher-the-director-of-studies)
8. [Teacher](#8-teacher)
9. [Student](#9-student)
10. [Parent](#10-parent)
11. [Librarian](#11-librarian)
12. [Bursar](#12-bursar)
13. [Nurse](#13-nurse)
14. [Patron and Matron](#14-patron-and-matron)
15. [What everybody shares](#15-what-everybody-shares)
16. [The pages with no sign in](#16-the-pages-with-no-sign-in)
17. [The mobile app](#17-the-mobile-app)
18. [Security](#18-security)
19. [Operations](#19-operations)
20. [When something looks wrong](#20-when-something-looks-wrong)

---

## 1. Before you start

### What you need

Docker, Node 20 or newer, and a browser. Nothing else.

### Bring up the database and cache

From the repository root:

```bash
docker-compose up -d
```

Postgres lands on **5434** and Redis on **6380**. Not the defaults, deliberately,
so they cannot collide with anything else you already run.

### Start the API

```bash
cd backend
cp ../.env.example .env     # then fill in the JWT secrets
npm install
npx prisma migrate dev      # create the schema
npx prisma db seed          # fill it with a term of school life
npm run start:dev           # API on :3000
```

The seed takes a couple of minutes. It is writing a quarter of a million marks.

### Start the dashboard

In a second terminal:

```bash
cd web
npm install
npm run dev                 # :3001, NOT :3000, which is the API
```

### Check both are up

```bash
curl -s -o /dev/null -w "api  %{http_code}\n" http://localhost:3000/api/health/live
curl -s -o /dev/null -w "web  %{http_code}\n" http://localhost:3001/login
```

Two 200s and you can begin.

A word of warning that cost real time to learn: `/api/health/live` reads nothing
from the database. It answers 200 from an API that cannot serve a single
authenticated route. Treat it as "the process is alive", never as "the system
works". The check that means something is signing in and loading a page, which
is what the rest of this guide does.

### Starting over

Reseeding logs everybody out, because it truncates the session table. Warn
anyone using the system, then:

```bash
cd backend && npx prisma migrate reset --force && npx prisma db seed
```

---

## 2. Every account you can sign in as

**Every account uses the password `Password123!`**

Sign in at `http://localhost:3001/login` with an email address or a phone
number. Staff accounts get a one time code as a second step; in development the
code is returned in the response and printed in the API log, so you never need a
working mailbox.

| Role | Sign in with | Lands on |
| --- | --- | --- |
| Admin (principal) | `wilsonshizirungu@gmail.com` or `+250788000001` | `/admin` |
| Head teacher (DOS) | `headteacher@markova.edu` | `/head-teacher` |
| Teacher | `aline.uwase@markova.edu` | `/teacher` |
| Student | `student1@markova.edu` through `student30@markova.edu` | `/student` |
| Parent | `+250735440253` (phone only, no email) | `/parent` |
| Librarian | `librarian@markova.edu` | `/librarian` |
| Bursar | `bursar@markova.edu` | `/admin/finance` |
| Nurse | `nurse@markova.edu` | `/nurse` |
| Patron (boys' boarding) | `patron@markova.edu` | `/boarding` |
| Matron (girls' boarding) | `matron@markova.edu` | `/boarding` |

### Accounts worth knowing about

Beyond the one of each above, the seed has 43 teachers, 1,279 students and
1,149 parents. Their addresses follow one rule: `<initial>.<lastname>@markova.edu`,
with a number appended only when that address is already taken.

- **Teachers**: `a.ruterana@markova.edu`, `b.mukantwari@markova.edu` and so on.
  `aline.uwase@markova.edu` is pinned as the one to demonstrate with.
- **Class teachers**, who can write the class teacher's comment on a report
  card: `d.mukamana@markova.edu`, `m.nshimiyimana@markova.edu`,
  `e.niyonkuru@markova.edu`.
- **A head of department**, who also holds `HOD`: `t.niyomugabo@markova.edu`.
- **Students**: `student1@markova.edu` to `student30@markova.edu` are the easy
  ones. The rest follow the initial-and-surname rule.
- **Parents with no email at all**: `+250735440253`, `+250789522634`,
  `+250786911245`, `+250721624062`. Fifteen parents are reachable by phone only,
  and they exist so you can test that the school can still reach a family that
  has no mailbox. Do not skip them.

### The two kinds of role

`ADMIN`, `TEACHER`, `STUDENT`, `PARENT`, `LIBRARIAN`, `PATRON`, `MATRON`,
`BURSAR`, `NURSE` and `HEAD_TEACHER` are the base roles. One person has exactly
one of them, and it decides what they can reach.

`DOS`, `HOD` and `CLASS_TEACHER` are separate. They are duties a teacher holds
alongside their own classes, recorded against the teacher rather than the user,
and they add specific powers without changing what the person is.

The distinction matters most for the DOS. `HEAD_TEACHER` is a post, the Director
of Studies, held by one person. `SpecialRole.DOS` marks a teacher who also
carries that duty. They are not the same thing and the tests below treat them
separately.

---

## 3. What is already in the database

The seed is a whole Rwandan secondary school partway through its year, not a
handful of example rows. Testing against it is the point: bugs that only appear
at volume appear here.

| | |
| --- | --- |
| Students | 1,279 |
| Parents | 1,149 (15 of them phone only) |
| Teachers | 43 |
| Class sections | 27, from Level 3 A up to Senior 6 |
| Subjects | 90 |
| Marks | 268,127 |
| Attendance records | 177,190 |
| Term results | 6,885 |
| Fee payments | 6,555 |
| Books | 56, with 172 loans and 8 currently overdue |
| Clinic visits | 162 |
| Pocket money transactions | 1,255 |
| Activities | 16 |

The current term is **Term 3 of 2025-2026**. Anything you test that asks for a
term should default to it.

Useful class sections, because they differ in size: **Senior 1 A** has 29
students and is comfortable to read on screen; **Level 5 A** has 311 and is what
you use when you want to see whether a page copes.

All names are Kinyarwanda, all phone numbers are `+250`, all addresses are
`@markova.edu`. If you ever see a Ugandan name or a `student.markova.edu`
subdomain, something has regressed.

---

## 4. The automated tests

Run these before any manual testing. They take about five minutes together and
they will tell you if something is broken before you spend an hour finding it by
hand.

There are **10,461** of them, and all of them pass:

| | Suites | Tests |
| --- | --- | --- |
| Backend | 106 | 3,188 |
| Web | 175 files | 4,889 |
| Mobile | 93 | 2,384 |

If any number here is lower than what you get, something has been deleted.

### Backend

```bash
cd backend
npm test                 # unit tests
npm test -- auth.service # one file, by name fragment
npm run test:e2e         # end to end, needs the database seeded
npx tsc --noEmit         # typecheck, writes nothing
npm run lint
```

`npm test` covers services in isolation with a stubbed database. `npm run
test:e2e` runs against the real one, and this is the layer that catches what the
unit tests structurally cannot: anything about how the client, the guards and
Postgres actually behave together.

`test/rls-identity.e2e-spec.ts` is worth knowing about. It exercises the
extension that tells Postgres who is asking. That code was once broken so badly
that every authenticated route returned a 500, and every unit test still passed,
because they all build their service with a stub client and never run the
extension. If you change anything in `src/prisma/`, this suite is the one that
matters.

### Web

```bash
cd web
npx vitest run                          # unit tests
npx vitest run src/lib/utils.test.ts    # one file
npm run lint
npm run build                           # catches what dev mode forgives
```

The unit tests enforce a coverage floor that counts every file under `src/`, not
only the ones a test imports. The thresholds are a ratchet: raise them, never
lower them.

### Web, in a real browser

Both need the web app on 3001 and the API on 3000 with the seed loaded.

```bash
WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/ui-audit.spec.js
WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/a11y-audit.spec.js
```

`ui-audit` signs in as each role and checks the route guards, the 404 page, the
forms and whether anything overflows on a phone. `a11y-audit` runs axe-core over
every page as every role and exits non-zero on a single WCAG 2.1 AA violation.

### Mobile

```bash
cd mobile
npx jest
npx tsc --noEmit
npx expo install --check    # dependencies match the SDK
```

### The repository's own guards

From the root. Each of these fails the build in CI, so run them before you
commit.

```bash
node scripts/check-dashes.mjs           # no em dashes, no en dashes, anywhere
node scripts/sync-design-tokens.mjs --check
node scripts/check-contrast.mjs         # every colour pairing is WCAG AA
node scripts/check-vulnerabilities.mjs
```

`check-dashes` is not a style preference to be argued with. The repository
carries no em dashes and no en dashes in prose, comments, UI copy or test names.
A hyphen does every job they were doing. `--fix` replaces them all.

Never hand-edit `web/src/app/tokens.css` or `mobile/src/constants/theme.ts`.
They are generated from `design/tokens.json`; edit that and rerun
`node scripts/sync-design-tokens.mjs`.

---

## 5. Authentication

Everything here is at `/login` unless stated.

### Signing in

| Test | Steps | Expected |
| --- | --- | --- |
| By email | `aline.uwase@markova.edu` / `Password123!` | A one time code step, then `/teacher` |
| By phone | `+250788000001` / `Password123!` | The same, then `/admin` |
| Wrong password | Any account, `wrong` | "Invalid credentials". Not "session expired", and no reload |
| Unknown address | `nobody@markova.edu` | The same message. It must not reveal whether the account exists |
| Empty fields | Submit blank | Inline validation, no request sent |

That "invalid credentials" wording matters in both directions. Failed sign-ins
must surface the real error rather than being swallowed by the refresh
interceptor, and they must not tell an attacker which addresses are real.

### The one time code

| Test | Steps | Expected |
| --- | --- | --- |
| Correct code | Use the code from the response or the API log | Signed in |
| Wrong code | Enter `000000` | Rejected, still on the code screen |
| Expired | Wait past the expiry, then submit | Rejected, offered a new code |
| Resend | Press resend | A new code arrives and the old one stops working |

In production the code is never in the response. It is queued for delivery and
retried; see the delivery queue under [Operations](#19-operations).

### Forgotten passwords

1. `/forgot-password`, enter `aline.uwase@markova.edu`.
2. The reset link is in the API log in development.
3. Follow it to `/reset-password`, set a new password.
4. Sign in with the new password. Confirm the old one no longer works.
5. Follow the same link a second time. It must be refused.

### Locking out

Fail five sign-ins in a row for one account. The sixth is refused for thirty
minutes even with the correct password. This is per account, so it does not lock
the whole school out, and it is the reason a scripted password guess is not
worth attempting.

### Being sent to the right place

Sign in as each of the ten roles and confirm you land where the table in section
2 says. That mapping lives in one place, `homeFor` in `web/src/lib/navigation.ts`.
It was once duplicated, and the copy the sign-in guard held did not know about
the newer roles, which sent them to a page they could not use.

---

## 6. Admin, the principal

Sign in as `wilsonshizirungu@gmail.com`. This is the largest surface in the
system, so work down it in order.

### People

| Page | What to test |
| --- | --- |
| `/admin/students` | Search by name and by student number. Filter by class. Open one |
| `/admin/students/[id]` | The whole record: guardians, marks, attendance, fees, health, discipline |
| `/admin/teachers` | The list, then open one and see their subjects and classes |
| `/admin/users` | Every account in one place, across all ten roles |
| `/admin/users/[id]` | Change a role, deactivate, reactivate |

Things worth trying deliberately:

- **Add a student.** The email suggestion should follow `<initial>.<lastname>@markova.edu`
  and append a number only on a collision. The student number is issued as
  `STD-<year>-<n>` and carries a signature, so it cannot be forged.
- **Link a parent to a student**, then unlink and relink. A student may have
  more than one guardian.
- **Upload a photograph**, then replace it. The old file should not be reachable
  afterwards.
- **Deactivate a user**, then try to sign in as them. Refused, immediately, not
  at the next token refresh. The token is checked against the database on every
  request.

### The school itself

| Page | What to test |
| --- | --- |
| `/admin/classes` | Class levels and sections, create and rename |
| `/admin/subjects` | 90 of them; assign to levels and to teachers |
| `/admin/timetable` | Build a timetable, look for clashes |
| `/admin/exams` | Publish an exam timetable. Overlapping papers are flagged |
| `/admin/promotion` | Move a class up at year end. Preview before committing |
| `/admin/settings` | School name, logo, colours, grading bands |
| `/admin/onboarding` | The first run wizard for a new school |

`/admin/promotion` deserves care. Preview it, read what it says it will do,
and only then commit. It moves an entire cohort.

### Money, health and boarding

The principal can reach these, and only these, of the welfare pages:

- `/admin/finance` and `/admin/finance/structure` and `/admin/finance/[studentId]`
- `/admin/pocket-money`
- `/admin/activities`
- `/admin/health`

### Admissions

| Page | What to test |
| --- | --- |
| `/admin/admissions/intakes` | Open an intake, set its dates, close it |
| `/admin/admissions` | The applications that have arrived |
| `/admin/admissions/[id]` | Read one, add a note, move it through its stages, make an offer |

Then test it from the outside: apply at `/admissions/apply` with no account at
all, and confirm the application appears here.

### Oversight

| Page | What to test |
| --- | --- |
| `/admin/analytics` | Enrolment, performance and attendance across the school |
| `/admin/audit` | Who changed what. Filter by person, by kind, by date |
| `/admin/discipline` | Incidents, and the appeals against them |
| `/admin/announcements` | Write one, choose who sees it, publish |
| `/admin/id-cards` | Generate cards for a class, print, then verify one |
| `/admin/library` | The collection from the principal's side |
| `/admin/homework` | What has been set across the school |
| `/admin/help` | Support tickets and the FAQ articles behind them |

The audit trail is worth a moment. Change something, then find it in
`/admin/audit`. The entry should say who, what and when, and personal data in it
should be redacted rather than recorded in full.

### What the principal must NOT be able to reach

This is the most important test on this page, so do it properly.

**`/admin/marks`, `/admin/attendance`, `/admin/reports` and `/admin/report-cards`
are closed to ADMIN.** The mark book belongs to the Director of Studies. The
principal runs the institution; the DOS runs academic delivery.

| Test | Expected |
| --- | --- |
| Type `/admin/marks` into the address bar | Bounced, not rendered |
| Look for them in the sidebar | Absent |
| Call `GET /api/marks/...` with the admin's token | 403 |

Both halves matter. Hiding the menu item is not access control; the API has to
refuse it too, and it does.

There is a consequence a school should understand before it buys: there is no
fallback when the DOS is away. A school that needs one appoints an acting DOS.

---

## 7. Head teacher, the Director of Studies

Sign in as `headteacher@markova.edu`. This is the academic half of what most
systems give a single administrator.

| Page | What to test |
| --- | --- |
| `/head-teacher` | The overview: marks outstanding, report cards waiting |
| `/admin/marks` | The whole school's marks. Enter, correct, look at a class |
| `/admin/attendance` | Registers across the school, and who is chronically absent |
| `/admin/report-cards` | Confirm a class, write the head teacher's comment, publish |
| `/admin/reports` | Generate a transfer letter, a testimonial, a register export |
| `/grading` | The bands that turn a mark into a grade |

### The report card pipeline

This is the longest workflow in the system and the one most worth walking end to
end. Three people touch it.

1. **As a teacher**, enter marks for a class and submit them.
2. **As the class teacher** of that class, write the class teacher's comment.
   Use `d.mukamana@markova.edu`. A teacher who is not the class teacher of that
   class must not be able to write it.
3. **As the head teacher**, confirm the class, write the head teacher's comment,
   and publish.
4. **As the parent** of a student in that class, open the report card. It should
   now be visible, and not before.

Then test the thing schools actually worry about: a student whose fees are
unpaid. The report is held, and the parent is told why, in words a parent can
act on.

`docs/REPORT-CARD-PIPELINE.md` has the detail. `test/report-card-pipeline.e2e-spec.ts`
walks the whole thing automatically.

### Rendering

Generating a report card is queued, not done while you wait. Press the button
and the response should come back immediately saying `queued`, with the PDF
arriving shortly after. On the scaled stack you can watch a worker pick it up
and confirm no API instance ever renders one.

---

## 8. Teacher

Sign in as `aline.uwase@markova.edu`.

| Page | What to test |
| --- | --- |
| `/teacher` | Today: the classes you teach, what needs marking |
| `/teacher/attendance` | Take a register. Present, absent, late, excused |
| `/teacher/marks` | Enter marks for your subject. Try an out of range mark |
| `/teacher/homework` | Set homework, attach a file, see who has submitted |
| `/teacher/discipline` | Record an incident |
| `/teacher/activities` | The clubs and sports you run |
| `/teacher/analytics` | How your classes are doing |
| `/teacher/announcements` | Write to your classes |

### The boundaries

A teacher sees their own classes and nobody else's. Test it rather than assume
it:

- Open a class you teach, note the URL, then edit the id to a class you do not
  teach. You should be refused.
- Enter a mark for a subject you do not teach. Refused.
- Write a class teacher's comment when you are not the class teacher of that
  class. Refused.

### Where duties change things

Sign in as `d.mukamana@markova.edu`, a class teacher. She can write the class
teacher's comment for her class, and only hers. Sign in as
`t.niyomugabo@markova.edu`, a head of department, and confirm the department
view appears that an ordinary teacher does not get.

---

## 9. Student

Sign in as `student1@markova.edu`. Students use the web portal; the mobile app
refuses them by design and points them here.

| Page | What to test |
| --- | --- |
| `/student` | Timetable for today, homework due, recent marks |
| `/student/marks` | Marks by subject and term, with the class average |
| `/student/attendance` | Your own record |
| `/student/homework` | What is set, and submitting it |
| `/student/reports` | Published report cards. Unpublished ones must not appear |
| `/student/library` | Search the catalogue, see what you have out |
| `/student/fees` | What is owed. A student sees this; they cannot pay it |
| `/student/discipline` | Anything recorded against you, and appealing it |
| `/student/activities` | Clubs you are in |
| `/student/analytics` | Your own progress over the year |
| `/student/profile` | Your details, and changing your password |

### The boundaries

Take the URL of your own marks page, change the student id in it to another
student, and reload. You must be refused. Do the same for attendance, fees and
report cards. This is the single most important test on this page, because it is
the one a curious sixteen year old will actually try.

---

## 10. Parent

Sign in with the phone number `+250735440253`. This parent has no email address
at all, which is the case worth testing.

| Page | What to test |
| --- | --- |
| `/parent` | All your children in one view |
| `/parent/marks` | Marks per child |
| `/parent/attendance` | Attendance, and any absence alert you were sent |
| `/parent/reports` | Published report cards, per child |
| `/parent/fees` | The invoice, what has been paid, what is outstanding |
| `/parent/pocket-money` | The boarding account: what went in, what was spent |
| `/parent/health` | Clinic visits and medication given |
| `/parent/discipline` | Incidents, and appealing one |
| `/parent/activities` | What your child is signed up to |
| `/parent/analytics` | Progress over time |

### Switching between children

A parent with more than one child should be able to move between them cleanly,
and every page must follow the switch. A page still showing the previous child's
data after a switch is a bug, and an easy one to miss.

### The boundaries

This is where row level security earns its place. Take the id of your own child
out of a URL and put another family's in. You must get nothing back. Not an
empty page with a stale header: nothing.

Proven directly against the database, a parent's cross-family query returns 0
rows where it would otherwise return 216, and "all marks" returns 126, their own
child's, rather than 268,127.

---

## 11. Librarian

Sign in as `librarian@markova.edu`.

| Page | What to test |
| --- | --- |
| `/librarian` | Out on loan, due back, overdue |
| `/librarian/books` | The catalogue. Add a book, edit one, add copies |
| `/librarian/loans` | Issue a book, take one back, renew one |

Things to try:

- **Issue a book to a student**, then try to issue the same copy again. Refused.
- **Return it**, and confirm the copy is available again.
- **Find the eight overdue loans** the seed contains, and chase every one of them
  with a single button. Check that the parents with no email are contacted by
  phone rather than silently skipped.
- **Search** by title, by author and by ISBN.

---

## 12. Bursar

Sign in as `bursar@markova.edu`. The bursar keeps the fee ledger. They see the
money and the roll, and nothing academic, because a bursar has no business in a
mark book.

| Page | What to test |
| --- | --- |
| `/admin/finance` | The ledger: who has paid, who has not |
| `/admin/finance/structure` | Fee items and what each class level owes |
| `/admin/finance/[studentId]` | One student's invoice and payment history |

Things to try:

- **Raise a term's invoices** for a class level.
- **Take a payment** at the counter, partial and then in full.
- **Waive a fee** for a student, with a reason, and find that reason later in
  the audit trail.
- **Send the same payment twice.** It must be recorded once. Payments carry an
  idempotency key precisely so a double click at the counter does not become two
  receipts.
- Try to reach `/admin/marks`. Refused.

---

## 13. Nurse

Sign in as `nurse@markova.edu`. The nurse sees health records and nothing
academic.

| Page | What to test |
| --- | --- |
| `/nurse` | Today's clinic |
| `/admin/health` | Health records across the school |

Things to try:

- **Record a visit**: what was wrong, what was done, whether the parent was told.
- **Administer a medication** and record it against the student.
- **Note an allergy or a condition** on a student's record, and confirm it shows
  where staff need to see it.
- Confirm a **parent can see their own child's visits** at `/parent/health`, and
  no other child's.
- Try to reach `/admin/marks` or `/admin/finance`. Refused.

Health data is the most sensitive thing in the system. Spend time on who can see
it.

---

## 14. Patron and Matron

Sign in as `patron@markova.edu` (boys) or `matron@markova.edu` (girls). Both
land on `/boarding`. They are real posts in a Rwandan boarding school, not
administrators with extra duties.

Their work is pocket money, the clinic and activities.

| Page | What to test |
| --- | --- |
| `/boarding` | The dormitory view |
| `/admin/pocket-money` | Hold money for a student, pay some out, show the balance |
| `/admin/activities` | Who is in which club, attendance at them |
| `/admin/health` | Taking a student to the clinic |

Things to try:

- **Deposit pocket money** for a student and **withdraw** some. The balance must
  never go below zero.
- Confirm the **parent sees the same ledger** at `/parent/pocket-money`.
- Try to reach anything academic or financial beyond the above. Refused.

---

## 15. What everybody shares

### Messaging

Every role has `/messages`. Sign in as two different people in two browsers, or
one browser and one private window.

| Test | Expected |
| --- | --- |
| Send a message | It arrives for the other person without a reload |
| Start a conversation | Findable by both afterwards |
| Mention somebody | They are notified |
| Read receipts | Marked read when the other person opens it |
| Attach a file | Uploads, downloads, and is not executable |
| Message somebody you should not | Refused |

Realtime is web sockets. If a message needs a page refresh to appear, that is a
failure, and on a scaled deployment it is the specific failure that happens when
the socket adapter is missing: chat works between two people who happen to be on
the same instance and silently fails between two who are not.

### Notifications

Trigger one of each and confirm it arrives, is marked read, and links to the
right place:

- A mark published
- An absence recorded
- A book falling overdue
- A fee reminder
- An announcement
- A discipline incident

Some notifications are only ever in-app and were never sent anywhere. Those
should say so rather than claiming an email went out.

### Reports and documents

From `/admin/reports` as the DOS, or the equivalent for other roles:

- A term report card
- A transfer letter
- A testimonial
- A class register export
- A register export for a student who has left, which must still work
- The whole dataset export

Each should produce a real file that opens. Check the school name, logo and
colours are the ones set in `/admin/settings`.

### Verifying a document

Every generated document carries a code. Open `/verify/[code]` with no account
at all and confirm it says the document is genuine. Change one character of the
code and confirm it does not.

Student ID cards work the same way at `/verify/card/[code]`.

### Uploads

Try each of these wherever a file can be attached:

| Test | Expected |
| --- | --- |
| A normal photograph | Accepted |
| A file above the size limit | Refused, with a message that says the limit |
| A `.exe` renamed to `.jpg` | Refused. The type is checked, not the extension |
| Fetching an uploaded file directly | Served with `nosniff` and a sandbox policy, never executed |

### Help

`/help` for everybody, `/admin/help` for the principal. Raise a ticket as a
parent, answer it as an admin, confirm the parent sees the answer.

### The dashboard shell

Worth checking on every role:

- The sidebar shows only what that role can reach
- It collapses on a narrow window and the collapsed sidebar is not focusable
- Dark and light mode both work
- Nothing overflows sideways at 375px wide

---

## 16. The pages with no sign in

Three parts of the system are reachable by someone with no account, and each
needs testing while signed out. Use a private window.

| Page | Test |
| --- | --- |
| `/admissions` | The school's public admissions page, with open intakes |
| `/admissions/apply` | Apply. Attach documents. Submit. Then find it in `/admin/admissions` |
| `/verify/[code]` | A document verifies without an account |
| `/verify/card/[code]` | A student ID card verifies without an account |

The public admissions form is the one place a stranger can write into the
system. Test it accordingly: oversized files, missing required fields, the same
application submitted twice, and script tags in the free text boxes.

---

## 17. The mobile app

```bash
cd mobile
cp .env.example .env      # set EXPO_PUBLIC_API_URL
npm install
npm start                 # then press i, a or w
```

`localhost` will not work from a physical device. Use your machine's address on
the network.

The app is for **admins, teachers, parents and librarians**. Students are
deliberately excluded: `MOBILE_BLOCKED_ROLES` in `mobile/src/stores/auth-store.ts`
refuses the STUDENT role at sign-in and points them at the web portal, which has
a full student dashboard.

**Test that refusal explicitly.** Sign in as `student1@markova.edu`. You should
land on the blocked screen with a clear explanation, not a crash and not an
empty dashboard.

| Area | What to test |
| --- | --- |
| Sign in | Email and phone, the one time code, forgotten password |
| Home | The right summary for each of the four allowed roles |
| Attendance | Take a register on a phone, including with no signal |
| NFC register | Tap a card to mark attendance, on a device that has NFC |
| Marks entry | Enter marks on a small screen |
| Messages | Send and receive, including push |
| Books | Search, issue and return as a librarian |
| Children | A parent moving between their children |
| Clinic, money, activities | The boarding and welfare screens |
| Scan | The QR and card scanner |
| Offline | Turn off the network mid-task and confirm the app says so |

---

## 18. Security

Test these deliberately. They are the questions a school will ask.

### Can somebody reach what is not theirs

The pattern is always the same, and it is worth repeating on every role: sign in,
find a URL with an id in it, change the id to something belonging to somebody
else, reload.

| As | Try to reach | Expected |
| --- | --- | --- |
| Student | Another student's marks | Refused |
| Parent | Another family's child | Nothing at all |
| Teacher | A class they do not teach | Refused |
| Admin | Anything under the mark book | Refused |
| Bursar | Anything academic | Refused |
| Nurse | Anything academic or financial | Refused |
| Librarian | Anything but the library | Refused |

Then do it again against the API directly with a token, not through the browser.
The menu hiding an item is not access control.

### Injection

Put each of these in a login box, a search field and a free text box:

```
' or 1=1 --
'; DROP TABLE users; --
' UNION SELECT * FROM users --
<script>alert(1)</script>
```

Every one should be treated as text. There is no raw SQL in the application (one
`SELECT 1` health check with nothing interpolated), so these cannot reach the
database as instructions. Confirm the user count is unchanged afterwards.

Attempting the login ones five times will lock the account. That is the lockout
working, not a failure.

### Row level security

The deepest layer, and the one that is invisible when it works. The application
connects as `markova_app`, a role that cannot bypass the policies. Connecting as
the owner would silently disable every one of them, which is why the API refuses
to start in production with an owner connection string.

To see it directly, connect as `markova_app` with psql and run a query for a
family that is not the one in scope. It returns nothing.

### Rate limiting

Hit any endpoint more than 100 times in a minute and you should be refused. On
the scaled stack the credential routes have a tighter bucket of their own, ten a
minute, so a scripted password guess is stopped before it costs a database
lookup and a bcrypt.

### Sessions

- Sign in, then deactivate that user as an admin. The next request fails.
- Sign in on two devices, change the password on one, confirm the other is out.
- Let a token expire and confirm it refreshes cleanly without dropping you at
  the login page mid-task.

---

## 19. Operations

### Backups

```bash
./scripts/backup.sh
```

Writes a timestamped folder under `backups/` holding a database dump and the
uploaded files. Set `BACKUP_SYNC_CMD` and it also copies the backup off the
machine it is protecting, failing loudly if that copy does not happen.

This is not theoretical. A Docker Desktop update once wiped every volume on this
project, and the backup restored all of it: 2,478 users, 1,279 students, 6,885
term results and 268,127 marks.

Test a restore rather than trusting the dump exists. `docs/BACKUPS.md` has the
procedure.

### The scaled deployment

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml \
  --profile scale up -d --build
```

Nginx on port 80, three API instances, two workers and a connection pooler.
`docs/LOAD-BALANCING.md` has the three checks that prove it works: that traffic
is shared, that a dead instance costs seconds rather than errors, and that
report card rendering happens on a worker while the API answers in milliseconds.

### The delivery queue

Email and SMS are queued rather than sent inline, and retried six times on an
exponential backoff from thirty seconds, which is about fifteen minutes in
total. A sign-in code has expired by then anyway, which is why the number is six
and not sixty.

To test it, stop the mail transport and sign in. The sign-in should still
succeed immediately: a person must never fail to sign in because a mail server
is down. Watch the worker log to see the retries.

### Sharing the running system

`scripts/share.mjs`, documented in `docs/SHARING.md`. Both ports have to be
forwarded, because the visitor's browser calls the API directly. Forwarding 3001
alone gives them a page whose requests go to their own machine.

---

## 20. When something looks wrong

**Everything returns 401.** The seed truncates sessions, so a reseed logs
everybody out. Sign in again.

**The database looks empty, or names look wrong.** You are probably pointed at a
stale database rather than having lost data. Check `DATABASE_URL` before doing
anything drastic.

**A page shows old code after an edit.** `docs/STALE-DEV-BUILD.md`. `npm run dev`
clears `.next` first for this reason; `npm run dev:cached` is faster and carries
the risk.

**The API answers `/health/live` but every page fails.** The health check reads
nothing from the database, so it stays green while every authenticated route
returns 500. Sign in and load a real page before believing the system is up.

**Port 3001 is in use.** The scaled stack used to publish it too and collide with
the dev server. It no longer does.

**A migration checksum complains.** Reset the database rather than working around
it.

**A test passes that should not.** Worth taking seriously. A failover check here
once passed for the wrong reason, because the instance being stopped was one the
balancer had already stopped talking to. A test that passes for the wrong reason
is worse than no test, because it is believed.
