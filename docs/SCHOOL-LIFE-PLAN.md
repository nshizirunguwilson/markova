# School life: analysis and build plan

Four domains that the system does not cover, plus two it covers only half of.
Written before any code, so the reasoning is on the record and can be argued
with.

The question behind all of it: **what does a Rwandan day-and-boarding TSS
actually run on that Markova cannot yet see?** Markova today knows a student's
marks, attendance, conduct and library loans. It knows nothing about their
money, their health, or anything the school does outside a timetabled lesson.
Those are the things that fill a boarding school's day.

---

## 1. Activities and events

### What a school leader needs

A head teacher's week is not lessons. It is visiting day, an inter-school
match, a club that meets on Wednesday, a trip that needs a bus and thirty
signed permission slips, and an assembly nobody remembered to tell Senior 2
about. Today all of that lives in a paper diary in one person's office.

The three questions they cannot currently answer:

1. **What is on this term, and who is it for?** A calendar the whole school can
   see, filtered to the classes an event concerns.
2. **Who is going?** For a trip this is a safety question, not an
   administrative one. If a bus leaves with thirty students, somebody has to
   hold the list of exactly which thirty.
3. **Did the parent agree?** A trip off the premises needs recorded consent.
   Paper slips get lost, and "I never signed that" is a conversation no school
   wants to have after an accident.

### What a student needs

A student wants to know what is on, whether they are in it, and whether their
parent has said yes. A boarder wants to know when visiting day is, because it
is the one day of the month that matters to them.

### What a parent needs

Visiting day and trip consent. Nothing else on this list is urgent to a parent,
and these two are urgent every single time.

### What is missing that nobody asks for

**Attendance at an event is not the same as attendance at school.** A student
can be present at school and absent from the club they signed up for. Clubs
that never check are clubs that quietly stop existing. Recording attendance per
event is what makes a club real rather than a name on a poster.

### Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Scope of an event | Whole school, selected class levels, or selected classes | "All of Senior 1" is how a school actually thinks; per-student invitations are noise |
| Consent | Required only where the event says so | Assembly needs none; a trip to Nyungwe needs every one |
| Attendance | Optional per event, recorded like a register | A club meeting needs it, an assembly does not |
| Recurrence | Not in the first version | A weekly club is five rows a term, and getting recurrence wrong is worse than not having it |

---

## 2. Pocket money

This is the feature a Rwandan boarding school will notice first, because it is
the one currently run in an exercise book.

### How it works today, on paper

A parent hands cash to the **matron** or **patron** on visiting day. It is
written in a ledger against the child's name. During the week the student goes
to the canteen, buys a soap or a bread, and the matron strikes a line through
the ledger. At the end of term nobody can reconcile it, parents ask where the
money went, and the answer is a smudged page.

### What each person needs

| | Need |
| --- | --- |
| **Parent** | Where did my money go. A statement they can read without asking anyone. |
| **Student** | What is left. Not being embarrassed at the canteen counter. |
| **Matron / patron** | Take money in and pay it out quickly, with a queue of forty students waiting. |
| **Head teacher** | Total held, and confidence nobody is stealing. |

### The insight that shapes the design

**This is a trust ledger, not a wallet.** The school is holding a child's money.
That means:

- **Every movement is recorded and nothing is ever deleted.** A correction is a
  reversing entry, not an edit. The balance must always be the sum of the
  entries, or the ledger is worthless as evidence.
- **The balance is derived, never stored and updated.** A stored balance that
  drifts from its transactions is how money disappears.
- **A student cannot go below zero.** They are spending money that is theirs;
  there is no overdraft in a school canteen.
- **A daily spending cap belongs to the parent, not the school.** A parent who
  sends 20,000 RWF for a term does not want it gone by Wednesday.

### Why patron and matron are real roles

They are not invented. In Rwandan boarding schools the **patron** is the boys'
boarding master and the **matron** the girls' boarding mistress. They run the
dormitories, hold the pocket money, take students to the clinic, and are the
adult a boarder actually deals with day to day. Giving them a login is what
makes this feature real rather than an admin's extra job.

Their permissions are narrow on purpose: they handle money and welfare for
students, and see nothing academic. A matron has no business reading marks.

### The card connection

The student ID card already carries a scannable code, and the attendance and
library scanners already resolve a student from it. The canteen scans the same
card. No new hardware, no new identifier.

### Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Balance | Derived by summing transactions | A stored balance that drifts is how money vanishes |
| Corrections | Reversing entry, never an edit or delete | The ledger has to stand up as evidence |
| Overdraft | Refused | It is the child's own money |
| Daily cap | Optional, set per student | A term's money must last a term |
| Who may pay out | Patron, matron, admin | The people actually at the counter |
| Who may see | The student, their parents, and those three | A teacher has no business in a child's finances |

---

## 3. Health

The school is *in loco parentis*. For a boarder it is the only adult present
when they are ill at 2am.

### What it has to hold

1. **A standing record** — allergies, chronic conditions, blood type, insurance.
   Partly there already on `Student`, unused.
2. **Clinic visits** — who came in, what for, what was done, who saw them, and
   whether they went back to class or home.
3. **Medication** — the one that matters most. A student on daily medication is
   relying on the matron remembering. A record of *administered*, not merely
   *prescribed*, is the difference between a system and a promise.
4. **Parent notification** — a parent must be told their child went to the
   clinic. Not next term. That day.

### The insight

**A health record is the most sensitive thing in the whole system.** Marks are
embarrassing; a health condition is not the school's to spread. So:

- Only the nurse, matron, patron and admin may read it. **Not teachers.**
- A parent sees their own child only.
- Every read of a health record is written to the audit log. Not because anyone
  is expected to misuse it, but because a record nobody can audit is a record
  nobody should trust.

### What is missing that nobody asks for

**An emergency card.** When a student collapses, nobody has time to log in and
navigate. One screen: blood type, allergies, conditions, guardian phone,
insurance number. Printable, and reachable in two taps.

### Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Who may read | Nurse, matron, patron, admin, and the child's own parent | Teachers do not need it and should not have it |
| Audit | Every read logged | A record nobody can audit is one nobody should trust |
| Medication | Records administration, not just prescription | The point is proving the dose was given |
| Notification | Parent told on the day of a clinic visit | Anything slower is not a notification |

---

## 4. Behaviour, completed

Today the discipline module records incidents, deducts points, and handles
appeals. It works. But it is **entirely punitive**, and that is a design flaw,
not a missing feature.

### The problem

A student starts at 100 points and can only ever go down. There is no way to
record that a student did something good. A system that only writes down what
you did wrong teaches a student that the system is against them, and gives a
teacher no tool except punishment.

### What it needs

1. **Merits.** Points recovered for helping, for representing the school, for
   improvement. The same ledger, in the other direction.
2. **Patterns, before they become incidents.** Three latenesses in a fortnight
   is a signal. Nobody currently sees it until it is a suspension.
3. **A visible path back.** A student who lost 20 points needs to know how to
   earn them back, or the number is just a punishment that follows them.

---

## 5. Messaging, completed

Works: one-to-one, groups, broadcast, realtime, read receipts, typing.

Missing, in order of how much a school will feel it:

1. **Broadcast to a class's parents.** "All Senior 1 parents: visiting day moves
   to the 14th." Currently impossible, and it is the single most common thing a
   school needs to say.
2. **Attachments.** A photo of a notice, a PDF of a timetable.
3. **Managing a group after it exists** — adding and removing people.

---

## Build order, and why

1. **Assessments** — the rename is agreed and the list needs paging. Small, and
   it clears an agreed decision off the board.
2. **Pocket money** — the highest-value item. It replaces a paper ledger, opens
   two new roles, and uses the ID card already built.
3. **Events and activities** — visible on a demo, and consent is a real
   safeguarding gap.
4. **Health** — narrower audience, but the emergency card is the kind of thing
   that justifies a whole system.
5. **Behaviour merits** — small change, large effect on how the system reads.
6. **Messaging: parent broadcast** — the one gap a school hits weekly.

Each lands as its own commit with tests. Anything not finished will be named
explicitly rather than left to look complete.
