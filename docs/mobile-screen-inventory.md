# Mobile screen inventory

What the phone owes, why each screen exists, and where it differs from the web
on purpose.

Web has 61 pages. Mobile has 28. Ten of the web pages are student pages, and
students do not use the mobile app, so the target is **52 screens**.

---

## The rule this inventory follows

Every capability on the web is reachable on the phone. The route structure is
not copied across, because a phone is not a small desktop.

Two consequences worth stating up front:

**Lists get merged where the web split them for navigation reasons.** The web
has `/admin/users`, `/admin/students` and `/admin/teachers` as three routes
because a sidebar has room for three links. On a phone that is one searchable
list of people with a role filter, and one detail screen. Splitting it would
mean three near-identical screens and three places to search.

**Authoring tasks become review tasks where authoring on a phone would be a
worse experience than not having it at all.** Promotion is the clearest case:
on the web an admin sets thresholds, scans a table of every student in a class,
and commits. On a phone that table is unreadable and the thresholds are a
settings problem. So mobile promotion shows the recommendation per student,
lets you override individuals by tapping, and commits. Configuring the
thresholds stays on the web, and the screen says so.

Screens where this applies are marked **review-only** below, with what moved.

---

## Auth and entry, 5 screens

| Screen | Purpose | Status |
| --- | --- | --- |
| `login` | Identifier and password. Wears the school name, logo and colour before anyone is signed in, from the public branding endpoint. | rebuild |
| `verify-otp` | The second step for staff and parents. Six digits, resend on a 30 second cooldown. | rebuild |
| `forgot-password` | Request a reset link. | rebuild |
| `reset-password` | Set a new password from a link. Web has this, mobile never did, so a reset email opened on a phone currently dead-ends. | **new** |
| `student-blocked` | What a student sees after signing in. Named, calm, not an error: the school's name, a plain sentence that student accounts use the web dashboard, the address, and a way out. | **new** |

## Shared across every role, 6 screens

| Screen | Purpose | Status |
| --- | --- | --- |
| `messages` | Conversation list with unread counts. | rebuild |
| `messages/[id]` | One thread. Live over the socket, with typing and read state. Replaces `parent-teacher-chat`, which was a parent-only version of a screen every role needs. | rebuild |
| `notifications` | The alert feed, and the only place a push notification can land. | rebuild |
| `profile` | Your own record and photo. | rebuild |
| `settings` | Password, sessions, push preferences, sign out. | rebuild |
| `help` | FAQ and raising a support ticket. Currently two screens, `help` and `support`, for one job. | rebuild |

## Admin, 23 screens

| Screen | Purpose | Status |
| --- | --- | --- |
| `admin/index` | What needs attention today, not a wall of statistics. | rebuild |
| `admin/people` | One searchable list of everyone, filtered by role. Merges the web's users, students and teachers lists. | **new** |
| `admin/people/[id]` | One person. Merges the web's `users/[id]` and `students/[id]`. | **new** |
| `admin/people/new` | Create a user, with the role-specific fields that follow. | **new** |
| `admin/people/import` | Bulk CSV import with per-row errors. | **new** |
| `admin/academics` | The structure hub: years, terms, levels, sections, trades. | **new** |
| `admin/academics/years` | Academic years and terms, including closing and reopening a term. | **new** |
| `admin/academics/classes` | Class levels and sections. | **new** |
| `admin/academics/subjects` | Subjects and their scope, and trades. | **new** |
| `admin/academics/assessments` | Assessment types. | **new** |
| `admin/academics/loads` | Who teaches what. Teacher by subject by section by year. | **new** |
| `admin/timetable` | The week, per class. **Review-only**: bulk authoring stays on the web, editing a single slot works here. | rebuild |
| `admin/exams` | Exam schedule per term. | rebuild |
| `admin/marks` | Completion tracker. Which subject by class by assessment nobody has filled in. | **new** |
| `admin/marks/results` | Calculate term results, add the head teacher comment, publish. The moment the whole term waits behind. | **new** |
| `admin/attendance` | Today across the school, plus the chronic absence list and the notify action. | rebuild |
| `admin/discipline` | Incidents and the pending appeals queue. | **new** |
| `admin/homework` | Oversight across classes. | **new** |
| `admin/library` | Stock and loans from the admin side. | rebuild |
| `admin/reports` | Report cards, the four document types, and data export. | **new** |
| `admin/id-cards` | Registry of who has a card, issue and revoke. Pairs with `nfc-register`. | **new** |
| `admin/promotion` | **Review-only**: per-student recommendation, tap to override, commit. Threshold configuration stays on the web. | **new** |
| `admin/analytics` | The eight admin views. **Review-only** in the sense that charts are read here, not configured. | rebuild |
| `admin/onboarding` | First-run setup wizard. | rebuild |
| `admin/school` | Name, motto, colour, logo, stamp, signature. The screen that decides what every other screen looks like. | **new** |

## Teacher, 8 screens

| Screen | Purpose | Status |
| --- | --- | --- |
| `teacher/index` | Today: my lessons, what is due, what is missing. | rebuild |
| `teacher/classes` | My teaching load, by class and subject. | **new** |
| `teacher/marks` | Enter marks for a class and assessment. The screen a teacher uses most. Queues offline. | rebuild |
| `teacher/attendance` | Take the register. Manual, QR, or NFC tap. Queues offline. | rebuild |
| `teacher/homework` | Set, then grade. | rebuild |
| `teacher/discipline` | Record an incident. | rebuild |
| `teacher/analytics` | How my class is doing. | rebuild |
| `teacher/timetable` | My week. | rebuild |

## Parent, 8 screens

| Screen | Purpose | Status |
| --- | --- | --- |
| `parent/index` | Every child, and anything that needs me. | rebuild |
| `parent/child/[id]` | One child at a glance. | rebuild |
| `parent/child/[id]/marks` | Marks by subject and term. | rebuild |
| `parent/child/[id]/attendance` | Presence over time, and why. | rebuild |
| `parent/child/[id]/discipline` | Incidents, acknowledging one, and appealing one. | rebuild |
| `parent/child/[id]/homework` | What is set and what was handed in. | rebuild |
| `parent/child/[id]/reports` | The report card, once published. | **new** |
| `parent/analytics` | Trends across the year. | **new** |

## Librarian, 5 screens

| Screen | Purpose | Status |
| --- | --- | --- |
| `librarian/index` | Out today, due today, overdue. | rebuild |
| `librarian/books` | The catalogue, searchable by title, author, ISBN, barcode. | rebuild |
| `librarian/books/[id]` | One title: copies, who has them, shelf location. | **new** |
| `librarian/loans` | Active and overdue, with the reminder action. | **new** |
| `librarian/circulate` | Checkout, return, report lost. The desk screen. | **new** |

## Mobile-only, 2 screens

These have no web equivalent and earn their place because the phone can do
something the desktop cannot.

| Screen | Purpose |
| --- | --- |
| `nfc-register` | Bind a physical card to a student. Needs the hardware. |
| `scan` | The camera. Scans a student QR for attendance, or a book barcode at the library desk. Currently attendance-only and buried inside the attendance screen. |

---

## Count

| Group | Screens |
| --- | --- |
| Auth and entry | 5 |
| Shared | 6 |
| Admin | 25 |
| Teacher | 8 |
| Parent | 8 |
| Librarian | 5 |
| Mobile-only | 2 |
| **Total** | **59** |

Of those, 28 exist in some form and get rebuilt, and 31 are new.

---

## Navigation

Five tabs is the platform maximum before a More tab stops being optional, and
four of the roles need more than five destinations. So each role gets four
tabs plus More.

| Role | Tabs |
| --- | --- |
| Admin | Home · People · Academics · Messages · More |
| Teacher | Home · Classes · Attendance · Messages · More |
| Parent | Home · Children · Messages · Alerts · More |
| Librarian | Home · Books · Circulate · Messages · More |

More holds profile, settings, help, notifications where it is not a tab, and
the admin tools that are used monthly rather than daily: reports, id-cards,
promotion, analytics, onboarding, school settings.

The rule for what earns a tab: it is used at least weekly by that role, and it
is a place rather than an action.

---

## What is deliberately not on mobile

- **The ten student pages.** Students use the web dashboard. `student-blocked`
  says so.
- **`/verify/[code]`.** Scanning the QR on a printed report card opens a URL,
  and a URL should open the web page. Building a second verifier inside an app
  that the person checking the card probably does not have installed would be
  the wrong solution to that problem.
- **Bulk timetable and bulk exam authoring.** Reachable on the web. The phone
  edits a slot, it does not lay out a week.
- **Promotion threshold configuration.** See review-only above.
