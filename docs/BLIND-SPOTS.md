# What we have not thought of yet

_Started 10 October 2026. A living list: add to it whenever something new turns
up, and tick items off as they are handled._

Markova was built for one school. Many schools will now use it, with real
children, real money and real families. This list collects the situations the
system does not handle yet, so they are found **before** a school finds them.

Each item has an example, what Markova does **today**, and **when** we deal
with it. "Checked" means it was confirmed by reading the code, not guessed.

**The four labels:**

- **Near work:** done next, after the work of the current phase.
- **[Future work](FUTURE-WORK.md):** planned for later, and explained in full
  in its own document so nothing is lost.
- **Own phase:** big enough to be designed and built as a phase of its own.
- **Check now:** something that may already work and has to be proven.

---

## How we keep finding more

A list written at a desk will still miss things. Four habits catch the rest:

1. **Walk a whole school year.** Before each big step, go through a real year
   day by day as each person: opening day, the first register, fees, mid term,
   exams, report cards, holidays, promotion. Write down every moment where
   Markova has no answer.
2. **Ask "what if" at every step.** Each step starts with ten minutes on what
   could go wrong for a parent, a child, a school and the owner.
3. **Run a pilot before a launch.** Two or three real schools (SOS Children's
   Villages is a natural first) use Markova for a full term before many
   schools do. Real users find what no list can.
4. **Watch what people actually do.** Once schools use it, the owner panel shows
   where people get stuck: pages nobody opens, sign ins that fail, messages
   that bounce.

---

## A. Families

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| A1 | A child's guardian is not a parent: a grandmother, an aunt, an SOS house mother | The link is free text ("relationship"), with no meaning attached. Checked | [Future work](FUTURE-WORK.md#a1) |
| A2 | A parent must **not** see their child, because of a court order or violence at home | Not possible to record. Any linked parent sees everything. Checked | [Future work](FUTURE-WORK.md#a2) |
| A3 | Two guardians, but only one pays fees, or only one should get the report card | Every linked parent gets the same access to everything. Checked | [Future work](FUTURE-WORK.md#a3) |
| A4 | A child with no family at all (orphan, SOS Children's Villages) | Works only by linking a member of staff as a "parent" | [Future work](FUTURE-WORK.md#a4) |
| A5 | A parent with children at several schools | Solved by the one login design | Solved |
| A6 | A parent with a basic phone, no smartphone and no internet | Some notices go by SMS. Report cards, marks and fees do not | [Future work](FUTURE-WORK.md#a6) |
| A7 | A parent who reads only Kinyarwanda (54% of adults) | Everything is in English only. Checked | Near work |
| A8 | A student turns 18 | **Done, 11 October 2026.** From 18 the student decides, with three switches (results, attendance and discipline, health), what their parents see. All start on; fees always stay shared. See [below](#a8-a-student-turns-18) | Done |
| A9 | A student or a parent dies | **Done, 11 October 2026.** The principal records it; nothing more is ever sent about that student, and a parent's account closes. A child left with no parent or guardian is put to the principal, and the class teacher is told privately. See [below](#b8-and-a9-a-students-journey) | Done |

## B. Students

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| B1 | A student has no phone and no email | Students sign in with invented addresses (`student1@markova.edu`) | Near work |
| B2 | A student forgets their password and has no phone or email | No way back in | Near work |
| B3 | Students want to check results on a phone during the holidays | Blocked on the phone app, and only the app blocks it: the server lets them in. Checked | Near work |
| B4 | A member of staff privately messages a student | **Done, 11 October 2026.** Every chat between staff and a student now also holds somebody watching over it: the school's safeguarding leads, or the principal where none is named. Everyone in the chat is told who. See [below](#b4-no-child-alone-in-a-chat) | Done |
| B5 | Students share computers in the school lab | **Done, 11 October 2026.** A student's sign in lasts only until the browser closes, and ends after 10 minutes without use (staff tick "shared computer" for the same). Signing out now ends the session on the server too. See [below](#b5-shared-computers) | Done |
| B6 | A student's photo is used on ID cards and in the app | **Done, 12 October 2026.** Families answer three questions about the photo (ID card, in the app, publicity), in the app or on the admission form, and the office copies in paper forms. A No to the app hides the photo from classmates and other parents; a No to cards leaves it off the card and report card. The public card check now shows the first name only and a smaller photo. See [below](#b6-the-students-photo) | Done |
| B7 | A student with a disability needs extra exam time or a reader | **Done, 12 October 2026.** Each student with special needs can have a support plan: the need, and what to do in tests and exams. Teachers see only what to do, for their own students; every exam has a sheet for the invigilator. See [below](#b7-exam-arrangements) | Done |
| B8 | A student is expelled, or comes back after a long absence | **Done, 11 October 2026.** Suspensions and time away are kept as dates; a suspended student is on the register as suspended, never marked absent, and their family is not texted. Leaving and coming back are recorded with the day and the reason. See [below](#b8-and-a9-a-students-journey) | Done |

## C. Schools

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| C1 | A **nursery or primary** school joins | **Not supported. Markova only knows O Level, A Level and TVET.** Most Rwandan schools are primary. Checked. Gets its own phase, so every kind of school is covered | Own phase |
| C2 | One school has two or three campuses | Not supported | [Future work](FUTURE-WORK.md#c2) |
| C3 | A private school follows Cambridge or IB, not the national curriculum | Grading assumes the Rwandan secondary system | [Future work](FUTURE-WORK.md#c3) |
| C4 | A day school, a boarding school, or both at once | Boarding exists. A school with both is untested | Near work |
| C5 | Each school has its own holidays, closures, exam weeks | Terms have dates; there is no school calendar of holidays and closures | Near work |
| C6 | A school changes its name or logo, merges with another, or closes | Name and logo can change; merging and closing are not handled | Near work |
| C7 | A school leaves Markova and wants all its data | **Checked on 10 October 2026: it works but is not complete.** The download works (a 9 MB zip of readable CSV files in 4 seconds, with no passwords in it), but it holds 26 of the 60 tables. Missing: all fees and payments, admissions, the clinic and health records, messages, pocket money, activities, merits, notifications, report card verification codes, trades and the audit log. Uploaded files (photos, documents, logos) are not included at all | Near work |
| C8 | A school joins mid year with years of history in Excel or another system | People can be imported; marks history cannot. There must be a way to bring that history into Markova | Near work |

## D. Staff

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| D1 | A teacher leaves in the middle of a term | Their classes, marks in progress and chats have no handover | Near work |
| D2 | A substitute covers for a teacher on leave | No temporary access that ends by itself | Near work |
| D3 | A school admin looks at health or discipline records out of curiosity | Every action is logged, but nobody is told | Near work |

## E. Money

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| E1 | A parent wants to pay fees with MTN MoMo or Airtel Money | Not possible. The main competitor (Urubuto) does this. Checked | [Future work](FUTURE-WORK.md#e1) |
| E2 | Fees are paid by a sponsor: an NGO, a district bursary, FARG | Recorded at admission only, not on the fee invoices. Checked | [Future work](FUTURE-WORK.md#e2) |
| E3 | **How schools pay Markova**: price, trial, invoices, what happens if a school does not pay | Nothing exists | Near work |
| E4 | Who pays for each SMS, and how a school sees what it spent | Nothing exists | Near work |

## F. Running Markova as a business

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| F1 | The owner wants to know how Markova is doing this week | Nothing exists | Near work |
| F2 | The owner needs to tell every school about maintenance or a new feature | Nothing exists | Near work |
| F3 | A school asks Markova for help with something inside their data | No safe way: the owner cannot see inside schools, and there is no "let support in for one hour" | Near work |
| F4 | A new feature should reach a few schools first | Every school gets everything at once | Near work |
| F5 | One very big school slows Markova down for everyone | No limits per school | Near work |
| F6 | Markova is down; schools need to know why and when it is back | Nothing exists | Near work |
| F7 | Each school signs an agreement saying how Markova may use its data | Nothing exists, and the law expects it | Near work |

## G. The law and the government

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| G1 | Markova must register with NCSA as a data processor | Not done | [Future work](FUTURE-WORK.md#g1) |
| G2 | Children's data must be stored in Rwanda, or with NCSA's permission | Decides where the servers go | [Future work](FUTURE-WORK.md#g2) |
| G3 | A parent asks to see, correct or delete their data | No way to do it | [Future work](FUTURE-WORK.md#g3) |
| G4 | Old data must be removed after a set time | Nothing is ever removed | Near work |
| G5 | A data leak must be reported quickly | No plan exists | Near work |
| G6 | Schools must also report to the government's SDMS | Typed in twice. No export to SDMS | [Future work](FUTURE-WORK.md#g6) |
| G7 | National exams (NESA): registering candidates, bringing results in | Nothing exists | [Future work](FUTURE-WORK.md#g7) |

## H. Phones, internet and language

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| H1 | Kinyarwanda, French | English only. Checked | Near work |
| H2 | A teacher in a rural school with weak internet | Only the register works offline on the phone | Near work |
| H3 | A parent loses their phone, or their SIM is swapped | No way to prove who they are and get back in | Near work |
| H4 | Data is expensive | The app has never been measured for how much data it uses | Near work |

## I. Busy days and mistakes

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| I1 | **Every school in Rwanda publishes report cards the same week**, because the national calendar ends terms on the same day | Tested for one school's report card evening, not for hundreds at once | Near work |
| I2 | A school deletes something by mistake and wants it back | Restoring would roll back every school at once | Near work |
| I3 | Thousands of SMS go out at once on results day | No queue limits per school or per day | Near work |

---

## Already found and fixed

These came up during the first steps and are done, listed so they are not
searched for twice: secrets in the logs, failed messages never resent, the
mobile app unable to start, blank photos, report cards in the wrong font in
production, and the seed that could not run.

### B4: no child alone in a chat

Any member of staff could open a private chat with any student, and nobody
else could ever see it. Now:

- **Who watches.** The principal names safeguarding leads on a staff member's
  page (People, then the person, then Safeguarding). Every lead watches over
  every chat between staff and a student. A school that names nobody has its
  principal watch, and the head teacher when it is the principal talking.
- **When.** Added the moment such a chat is made, when a student is added to
  a group of adults, and before any message is sent into an older chat that
  has nobody watching (a lead who has left no longer counts).
- **Told, not hidden.** The top of the chat says who is watching and why, to
  the student as much as to the teacher.
- **Cannot be removed.** The last person watching cannot be removed or leave.
- **Quiet for the watcher.** No bell and no badge for every message, only when
  named. Their reading never shows the sender a "Read".
- **Not the parent.** A child telling a teacher about trouble at home must be
  able to do it without that home reading along, so parents are not added.
- **Not needed** in a class group (the whole class is there), an announcement
  (nobody can answer it), or between two adults or two classmates.
- **Who can be reached** is now checked when a chat is made, not only in the
  contact list: a parent cannot open a chat with somebody else's child.

### A8: a student turns 18

- **Three switches** on the student's profile from their 18th birthday:
  results, attendance and discipline, and health visits. All start on, so
  nothing changes for a family unless the student acts. Fees are always
  shared with whoever pays.
- **One rule** (`backend/src/common/parent-sharing.ts`) used by every page and
  message a parent gets: the ownership check names the kind of record, the
  clinic check asks for health, family messages ask too (an absence text is
  attendance). A test lists every route a parent can reach and fails for one
  that does not say what kind of record it shows.
- **Calm, not broken.** A parent sees "Keza has chosen to keep their health
  visits private." where the page would be, never an empty page or a red
  alert. Marks can show while attendance beside them is private.
- **On the phone too**: the same notice on each child screen, and "Private"
  rather than "0%" on the child's overview.
- **No date of birth means under 18**, so nothing is hidden on a guess; the
  students list says how many have none, and lists them to fix.
- **A note on the birthday** itself, telling the student the choice is theirs.
- **The school sees** each adult student's choices on their page, read only.

### B5: shared computers

- **Who:** a student is always signed in as on a shared computer. Staff and
  parents tick "This is a shared computer" on the sign in page.
- **In the browser:** the sign in is kept only in that tab, so closing the
  browser, or opening a new tab, finds nobody signed in. After 9 minutes
  without use a "Still there?" warning shows; at 10 the person is signed out
  and told why. On one's own computer the limit is 60 minutes.
- **On the server, too:** a shared sign in's short-lived token lasts 5
  minutes, a renewal is refused after about 10 minutes of silence, and every
  shared sign in ends after 12 hours, whatever the browser does.
- **Nothing left behind:** signing out wipes everything the browser held, and
  marks are never kept for offline on a shared computer.
- **Sign out everywhere** on the profile page, for the student who walked away
  from a lab computer.
- **Found on the way:** signing out never ended the session on the server.
  It named the wrong token and the web never called it, so a refresh token
  copied off a computer worked for a week after "sign out", and "sign out
  everywhere" could never happen. Fixed, and proven in the browser.

### B6: the student's photo

- **Three answers per student**, each Yes, No or not asked yet: on the ID card
  and report card, in the app for classmates and other parents, and in the
  school's publicity. Every answer is kept with who gave it and how (in the
  app, on a paper form, on the admission form).
- **Who answers:** a parent, for a child under 18, on the web profile or the
  phone. From 18 the student answers, and the parent is told so. The office
  copies in a signed paper form, naming who signed it. The admission form
  asks the three questions, and the answers follow the child in.
- **What a No changes:**
  - **In the app:** classmates and other parents see initials instead of the
    photo, everywhere a person appears (chats, contacts, new messages). The
    staff still see it, and so does the child's own family.
  - **On cards:** the ID card, the report card and the gate check carry no
    photo. The ID card page warns before printing.
  - **Publicity:** Markova publishes nothing itself. The office has a
    "Photos" page listing who may and may not appear, ready to export.
- **Until a family answers**, the card and the app keep the photo, and
  publicity counts as No. The Photos page counts who has not been asked.
- **The public card check** (anyone who scans a card) now shows the first
  name only and a smaller photo, as agreed.
- **Demo:** about 7 in 10 families answered on paper, 3 in 10 not asked yet.
  Andy Cyizere, in student1's class, said No to the app, so student1 sees
  initials for them in the class chat.

### B7: exam arrangements

- **A support plan** per student with special needs: the need (seeing,
  hearing, moving, learning, speech, long-term illness), what to do in tests
  and exams (extra time as a percentage, a reader, a scribe, large print,
  braille, sign language, a separate room, rest breaks, a seat at the front,
  a computer), when to look at it again and who it was agreed with.
- **Who sees what.** The Director of Studies and the nurse keep it. The
  principal reads it, and every opening is written to the audit log. The
  family reads their own child's, on the web and the phone (an adult student
  can keep it private, with their health). A teacher sees only what to do,
  never why, and only for students they teach: on the register and the mark
  book, as "In tests and exams: ...".
- **The exam room.** Every exam on the timetable has an arrangements sheet to
  print, with the extra minutes worked out from the exam's own times.
- **The register** on "Support plans" lists every plan by class, for the
  national exam registration, marks plans past their date, and exports.
- **Demo:** the seed turns the disabilities written at enrolment into plans,
  including one in a class Aline Uwase teaches.

### B8 and A9: a student's journey

Designed in [STUDENT-LIFE-DESIGN.md](STUDENT-LIFE-DESIGN.md). What was built:

- **Standing and pauses.** A student is on the roll, or has left (withdrawn,
  transferred, graduated, expelled, passed away). A student on the roll may be
  suspended or away for a time. Pauses are dates, so a student is back on the
  right day with nothing to remember, and past registers stay right.
- **One rule for what stops**, used by registers, absence texts, the class
  chat, sign in and ID cards (`backend/src/common/student-standing.ts`).
- **Families.** Every message to a family about a student asks first; a test
  fails if a new one does not. Nothing at all goes out to a closed account.
- **Suspended:** on the register as suspended, never marked absent, no
  absence texts, can sign in for homework, reads the class chat without
  posting, card refused at the gate until they are back.
- **Left:** off registers and the class chat, card revoked, can sign in only
  to see their past report cards. **Readmitted:** back in the class chosen,
  same student number, all history kept.
- **Passed away:** the principal records it. Nothing more is sent, the account
  closes, the record and past report cards stay for the family.
- **A parent passed away:** their account closes; each child's class teacher
  is told privately; a child left with nobody is put to the principal.
- **Screens:** a Journey card on each student's page, "Passed away" on a
  parent's page, suspended and away students on the register (web and phone),
  and a report-cards-only view for a student who has left.
- **Found on the way:** the phone register could not reopen a register
  already taken that day (it read the server's reply in the wrong shape).
  Fixed.

Found but still open, for the mobile redesign: the head teacher and the bursar
land in the parent's app on the phone.
