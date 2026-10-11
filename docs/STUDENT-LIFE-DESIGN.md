# The student items: thinking before building

_Written 12 October 2026, before any code. Covers six near-work items from
[BLIND-SPOTS.md](BLIND-SPOTS.md): A8, A9, B5, B6, B7 and B8._

For each item: the real situation, what Markova does **today** (checked in
the code, not guessed), what goes wrong, the choices, what I recommend, how it
would be built, and how we prove it works. Decisions that are yours are marked
**You decide**.

---

## The short version

| # | The situation | Today | The biggest harm today |
| --- | --- | --- | --- |
| B8 | Suspended, expelled, or coming back after a long time away | A suspension or expulsion is written in the discipline book, and **nothing else changes** | A suspended child is marked absent every day, so the family gets an "absent" text every day |
| A9 | A student, or a parent, dies | No way to record it | The family keeps getting "your child was absent" and fee messages |
| B5 | Students share the lab computers | Signed in for 7 days on that computer | The next student opens the browser and is inside the last one's account |
| A8 | A student turns 18 | Nothing changes | 35% of students in the demo school are already adults, and their parents see everything, health visits included |
| B7 | A student needs extra exam time or a reader | One free text box, used by nothing | Invigilators never find out |
| B6 | The student's photo | No record of whether the family agreed | Photos show to anyone who scans a card, and nobody can say who agreed |

**Two foundations do most of the work**, so they are built first:

1. **A student's journey.** A record of every change in a student's standing
   (suspended, expelled, withdrawn, came back, passed away), with the reason,
   the dates and who decided. Plus **one rule** that says what stops while a
   student is not active. B8 and A9 sit on it.
2. **What a parent may see.** One check, used by every page and message a
   parent receives. A8 sits on it now; A2 and A3 (court orders, one guardian
   only) will sit on it later.

**Order I recommend:** B8 with A9, then B5, then A8, then B7, then B6. Why is
under each item and in [the order](#the-order-and-why).

---

## B8. Suspended, expelled, or coming back

### The situation

- **Suspension** is temporary: a few days or weeks at home, then back to the
  same class.
- **Expulsion** is the end: the student leaves for good. Only the principal
  decides it, and families can appeal.
- **Coming back** happens often: after a long illness, after pregnancy (Rwanda
  lets young mothers return to school), after dropping out for money, or after
  an appeal against an expulsion. They may come back to the same class or
  repeat a year.

### Today (checked)

- A student's standing has four values: `ACTIVE`, `INACTIVE`, `GRADUATED`,
  `TRANSFERRED`. Nothing for suspended, expelled, withdrawn or passed away,
  and no date, reason or name of who changed it.
- The discipline book can record `SUSPENSION` or `EXPULSION` as the action
  taken, but **it changes nothing else**: the student stays active, stays on
  every register, keeps getting fee invoices, stays in the class chat, and can
  still sign in.
- Sign in checks that the **account** is active, never the student's standing.

### What goes wrong

- A suspended student is marked absent every day, and every absent mark texts
  the family. They get "your child was absent" each morning for something the
  school did.
- Their attendance rate drops for days they were not allowed to come.
- An expelled student still reads the class chat and signs in.
- A student who comes back has no record of the gap. Marks and attendance
  from before look continuous with after.

### What I recommend

**A student's journey** (the first foundation):

- Standings become: **Active, Suspended, Away** (allowed time away: illness,
  maternity), **Withdrawn** (left: dropped out, family moved without a
  transfer), **Expelled, Transferred, Graduated, Passed away**. Today's
  `INACTIVE` becomes Withdrawn.
- Every change is kept as one line of history: from, to, reason, start date,
  end date (for a suspension or time away), a note, and who did it. Nothing is
  ever deleted.
- **One rule for what stops** when a student is not active, written once and
  used everywhere:

| | Suspended | Away | Withdrawn, Expelled, Transferred | Passed away |
| --- | --- | --- | --- | --- |
| On the register | Yes, shown as "Suspended" (never absent) | Yes, shown as "Away" | No | No |
| Counts in attendance rate | No | No | No | No |
| Absence texts to family | No | No | No | No |
| New fee invoices | Yes (the school decides about refunds) | Yes | No | No |
| Fee reminders | Yes | Yes | Only for old debt, and only if the bursar says so | **Never** |
| Class chat | Stays in, cannot post | Stays in | Removed | Removed |
| Can sign in | Yes, to do homework | Yes | Can see their old report cards only | No |
| ID card | Suspended | Unchanged | Revoked | Revoked |
| Records kept | Always | Always | Always | Always |

- **Suspend** is offered right where the discipline record is written: "Suspend
  from ... to ...". On the end date the student is active again by itself,
  every morning a scheduled task checks.
- **Expel** only by the principal, with a reason, and a confirmation that says
  what will happen.
- **Bring back** ("readmit"): choose the class (same one, or repeat), the date,
  and the reason. The student keeps the same student number and all their
  history.

**You decide:** whether a suspended student may sign in to see homework. I
recommend yes (they are expected to keep up), and no posting in the class
chat.

### How it is built

- A migration adds the new standings, a `student_status_changes` table, and
  moves `INACTIVE` to `WITHDRAWN`.
- One service, `StudentJourney`, is the only way to change a standing. The
  edit form and bulk import stop writing `status` directly.
- One function, `whatStops(status)`, answers the table above. Registers,
  attendance figures, absence texts, invoices, reminders, the class chat,
  sign in and ID cards all ask it, so nothing can drift.
- Screens: a "Journey" card on the student's page (history plus the buttons),
  "Suspend" on the discipline form, "Suspended" and "Away" on the register.

### How we prove it

- Unit tests for every cell of the table above.
- Through the real API: suspend a student, mark the register, **no text is
  sent and the rate is unchanged**; the end date passes, they are active again.
  Expel one: they cannot post or sign in, their old report card still opens.
- A test that reads every place a text is sent to a family and fails if one
  does not go through the rule.
- Browser: suspend from the discipline page and see "Suspended" on the
  register.

---

## A9. A student or a parent dies

### The situation

It happens: road accidents, illness, drowning. The family is grieving and the
school is careful. The worst thing software can do is keep talking as if
nothing happened.

### Today (checked)

There is no way to record it. Absence texts, fee messages, report cards and
the class chat carry on.

### What I recommend

**A student passes away** (built on the journey above):

- Only the principal records it, with the date. The confirmation says plainly
  what will happen.
- **Everything to the family stops at once**: absence texts, fee reminders,
  report cards, announcements about that child. Old debt is never chased; the
  bursar decides what to write off, separately.
- Removed from registers, class chat and future invoices. ID card revoked.
- **Records are kept.** The family can still open past report cards (families
  ask for them, for memorials and for siblings' files).
- Staff see "Passed away" only on that student's own page. Lists simply stop
  showing them.

**A parent passes away:**

- The principal records it on the parent's page. Their account stops, so
  nothing more is sent to them.
- If the child now has **no other parent linked**, the principal is told
  straight away and asked to add the guardian, because otherwise fee notices
  and report cards go to nobody.
- The class teacher is told (privately) so they can look out for the child.

**You decide:** whether the class teacher should be told automatically when a
student's parent passes away. I recommend yes, a private note to the class
teacher only.

### How we prove it

- Through the real API: record a passing, then trigger every kind of message
  (an absent mark, a fee reminder, an announcement to parents, a report card
  release): **nothing reaches the family**. The family can still open last
  term's report card.
- A parent with an only child: recording the parent's passing raises the
  "no guardian left" task.

---

## B5. Students share the lab computers

### The situation

Most students have no computer at home. They use the school lab (often the
same 30 machines for the whole school) or a cyber café, one after another.

### Today (checked)

- Signing in keeps you in for **7 days** on that browser (a 15 minute access
  key, refreshed by a 7 day key, both kept in the browser's storage).
- Closing the tab does not sign you out. Nothing signs anybody out when they
  stop using the computer.
- Signing out removes the keys, but data saved for offline use stays.

### What goes wrong

The next student opens the browser and is inside the previous student's
account: their marks, their messages, their fees. They can send messages as
them.

### What I recommend

- **"This is a shared computer"** on the sign in page.
  - **Ticked by default for students**, because a student is almost always on
    a shared machine. Staff and parents start unticked.
  - When ticked: the keys are kept only until the browser closes; nothing is
    saved for offline use; after **10 minutes without use** a warning shows
    ("Still there? Signing you out in 60 seconds"), then you are signed out.
  - The server enforces it too: a shared sign in cannot be refreshed after 10
    minutes of silence, and never lasts past the school day (12 hours). So
    even a browser left open with the warning dismissed by a script runs out.
- **Signing out wipes everything** the app kept in that browser, every time.
- **"Sign out everywhere"** on the profile page, for a student who forgot to
  sign out in the lab.

**You decide:** the idle time. I recommend 10 minutes for a shared computer.
Optionally 60 minutes for everyone else on a normal computer (staff leave
laptops open in the staffroom); I recommend adding that too.

### How it is built

- Sign in takes `sharedDevice`. The session row remembers it and the server
  checks the idle and day limits when refreshing.
- The web keeps keys in session storage when shared; one idle timer with the
  warning; sign out clears keys, cached pages, offline data and the chat.

### How we prove it

- Browser: sign in as a student, close the browser, open it again: signed out.
- Browser: sign in shared, move the clock 11 minutes: signed out, and the
  server refuses the old key.
- Browser: sign out, then look in the browser's storage: nothing of that
  person left.

---

## A8. A student turns 18

### The situation

- In Rwanda, 18 is adulthood. In upper secondary and TVET many students are
  18 to 21: **in the demo school, 548 of 1,581 students (35%) are already
  adults.**
- An adult's records are theirs. But parents still pay the fees and expect to
  follow their child, and most young adults are happy with that.

### Today (checked)

Parents see everything for as long as they are linked: marks, attendance,
discipline, clinic visits. Birthdays change nothing. One student in the demo
data has no date of birth at all.

### Choices

1. Change nothing. Simple, but an adult cannot keep even a clinic visit
   private.
2. Cut parents off at 18. Respects the law, but breaks families who pay the
   fees, and the school would be flooded with complaints.
3. **Let the student choose.** On their 18th birthday nothing is cut, and the
   student is told, in plain words, what their parents can see and that they
   can change it.

### What I recommend

Choice 3:

- From 18, the student has three switches: **results** (marks and report
  cards), **attendance and discipline**, and **health** (clinic visits).
  All start on, so nothing changes for a family unless the student acts.
- **Fees always stay visible to whoever pays them.** That is between the payer
  and the school.
- When a switch is turned off, the parent sees a calm line ("Keza keeps her
  health visits private"), not an empty page that looks broken.
- A student with no date of birth is treated as under 18, and the school is
  shown a list of students missing one.
- Built on the **second foundation**: one check, "may this parent see this
  kind of thing about this student", used by every parent page, every message
  to parents, and every export. A test fails if a parent route skips it.

**You decide:** whether health should be private by default from 18 (switch
starting off), since clinic visits are the most personal. I lean to "on by
default, the student can turn it off", so no family is surprised on a
birthday.

### How we prove it

- Through the real API, as a parent: every parent route for an 18 year old
  with each switch off returns nothing of that kind, and fees still show.
- The same for a 17 year old: the switches cannot be used, everything shows.
- A test built from the list of routes (like the sweep across schools) that
  fails when a new parent route forgets the check.
- Browser: the student turns a switch off; the parent sees the calm line.

---

## B7. Extra exam time, a reader, or other help

### The situation

Rwanda's inclusive education policy, and the national examinations, give
students with special educational needs arrangements: extra time, a reader, a
scribe, large print, braille, a sign language interpreter, a separate room,
rest breaks. The school has to know, and the person in the exam room has to
know.

### Today (checked)

One free text box, "disability", filled at enrolment and **used by nothing**.
The exam timetable is per class and knows nothing about individual students.

### What goes wrong

The invigilator never learns that Keza gets 25% extra time and large print.
The teacher writing a class test does not either.

### What I recommend

- A **support plan** per student, kept by the Director of Studies (exams are
  theirs) with the nurse:
  - the **need**, from a short list (seeing, hearing, moving, learning,
    speech, long term illness, other) plus a note;
  - the **arrangements**, from a list (extra time with a percentage, reader,
    scribe, large print, braille, sign language, separate room, rest breaks,
    sit near the front, use a computer);
  - a review date, and who agreed it.
- **Who sees what:** the need itself is private (Director of Studies, head
  teacher, principal, nurse). **Teachers see only the arrangements** for the
  students they teach, never the diagnosis: "25% extra time, large print".
- **Where it shows:** a small marker on the teacher's class list, a printable
  arrangements sheet for each exam on the timetable (for the invigilator), and
  a list for the national exam registration.
- Opening a support plan is logged.

**You decide:** whether parents should see the support plan. I recommend yes,
read only: families usually asked for it in the first place.

### How we prove it

- Through the real API: a teacher of the class gets the arrangements and no
  diagnosis; a teacher of another class gets nothing; a librarian gets
  nothing.
- Browser: the exam sheet for Senior 4 A Mathematics lists the right
  students with their arrangements.

---

## B6. The student's photo

### The situation

A student's photo is used for three different things, and they deserve
different answers:

1. **To identify them**: the ID card, the gate check, the report card. This is
   the school's own job.
2. **To show them to others inside the app**: classmates and other parents see
   it next to the name in chat and lists.
3. **School publicity**: the website, Facebook, brochures. That happens outside
   Markova, but the school needs to know who agreed.

Rwanda's data protection law (No. 058/2021) treats a photo as personal data,
and a child's personal data needs a parent's agreement.

### Today (checked)

- No record of any agreement.
- The photo prints on ID cards and report cards, shows in the app, and
  **anyone who scans a card's QR code sees the photo**, without signing in
  (on purpose: the gate guard needs to check the face).
- Uploaded files are served to anyone who has the address. The addresses are
  random and hard to guess, but not protected.

### What I recommend

- A **consent record** per student with three answers (identification, in the
  app, publicity), each **Yes, No, or Not asked yet**, with who answered (a
  parent, or the student from 18), when, and how (paper form or in the app).
  Every change kept.
- Parents answer it in the app, and on the admission form for new students.
- **What it changes:**
  - In the app = No: the photo shows only to staff. Classmates and other
    parents see initials.
  - Identification = No (rare): the principal is warned before printing a card
    with that photo.
  - Publicity: Markova publishes nothing itself; the school gets a list of who
    may and may not appear in school photos.
- **Until a family answers:** identification and in the app keep working (as
  today), publicity counts as No. The school sees how many are not asked yet.

**You decide:** whether the public card check should keep showing the photo
to anyone, or only to signed in staff. I recommend keeping it public (it is
what makes a gate check work) but smaller, with no name beyond the first name.

### How we prove it

- Through the real API: with "in the app" = No, a classmate's chat list has no
  photo for that student and a teacher's does.
- Browser: a parent changes an answer, and the school's list updates.

---

## The order, and why

1. **B8 with A9: a student's journey.** Families are hurt by it today (daily
   absence texts to a suspended child's family, messages to a grieving one).
   It is also the first foundation.
2. **B5: shared computers.** Every lab, every day: one student inside
   another's account. Small and separate.
3. **A8: turning 18.** Builds the second foundation, which A2 and A3 later
   reuse. One in three students in the demo school is affected.
4. **B7: exam arrangements.** Narrower, and it needs the privacy rule shaped by
   A8.
5. **B6: photo consent.** Mostly a record and a few display rules. Last
   because it changes the least on the day it ships.

Each one ships the way B4 did: its own branch and pull request, unit tests,
tests through the real API, browser checks, the accessibility audit, and
"done" only when all of that passes.

## Decided

On 12 October 2026 every recommendation above was agreed, along with the two
foundations and the order:

1. B8: a suspended student may sign in to see homework, and cannot post in the
   class chat.
2. A9: the class teacher is told privately when a student's parent passes away.
3. B5: 10 minutes idle on a shared computer, and 60 minutes for everyone else.
4. A8: from 18, health visits stay shared by default; the student can turn
   them off.
5. B7: parents see the support plan, read only.
6. B6: the photo stays on the public card check, smaller, first name only.
