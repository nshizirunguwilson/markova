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
| A8 | A student turns 18 | Parents keep full access with no change | Near work |
| A9 | A student or a parent dies | No careful way to handle it: messages and fee reminders keep going | Near work |

## B. Students

| # | What can happen | Markova today | Status |
| --- | --- | --- | --- |
| B1 | A student has no phone and no email | Students sign in with invented addresses (`student1@markova.edu`) | Near work |
| B2 | A student forgets their password and has no phone or email | No way back in | Near work |
| B3 | Students want to check results on a phone during the holidays | Blocked on the phone app, and only the app blocks it: the server lets them in. Checked | Near work |
| B4 | A member of staff privately messages a student | **Done, 12 October 2026.** Every chat between staff and a student now also holds somebody watching over it: the school's safeguarding leads, or the principal where none is named. Everyone in the chat is told who. See [below](#b4-no-child-alone-in-a-chat) | Done |
| B5 | Students share computers in the school lab | Nothing signs them out when the next student sits down | Near work |
| B6 | A student's photo is used on ID cards and in the app | No record of whether the family agreed | Near work |
| B7 | A student with a disability needs extra exam time or a reader | Not recorded anywhere | Near work |
| B8 | A student is expelled, or comes back after a long absence | Partly: a student can be marked as left | Near work |

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

Found but still open, for the mobile redesign: the head teacher and the bursar
land in the parent's app on the phone.
