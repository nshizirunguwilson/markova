# What we have not thought of yet

_Started 10 October 2026. A living list: add to it whenever something new turns
up, and tick items off as they are handled._

Markova was built for one school. Many schools will now use it, with real
children, real money and real families. This list collects the situations the
system does not handle yet, so they are found **before** a school finds them.

Each item has an example, what Markova does **today**, and **when** we deal
with it. "Checked" means it was confirmed by reading the code, not guessed.

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

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| A1 | A child's guardian is not a parent: a grandmother, an aunt, an SOS house mother | The link is free text ("relationship"), with no meaning attached. Checked | Step 3 |
| A2 | A parent must **not** see their child, because of a court order or violence at home | Not possible to record. Any linked parent sees everything. Checked | Step 3 |
| A3 | Two guardians, but only one pays fees, or only one should get the report card | Every linked parent gets the same access to everything. Checked | Step 3 |
| A4 | A child with no family at all (orphan, SOS Children's Villages) | Works only by linking a member of staff as a "parent" | Step 3 |
| A5 | A parent with children at several schools | Solved by the one login design | Step 3 |
| A6 | A parent with a basic phone, no smartphone and no internet | Some notices go by SMS. Report cards, marks and fees do not | Step 8 |
| A7 | A parent who reads only Kinyarwanda (54% of adults) | Everything is in English only. Checked | Step 8 |
| A8 | A student turns 18 | Parents keep full access with no change | Later |
| A9 | A student or a parent dies | No careful way to handle it: messages and fee reminders keep going | Step 3 |

## B. Students

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| B1 | A student has no phone and no email | Students sign in with invented addresses (`student1@markova.edu`) | Step 4 |
| B2 | A student forgets their password and has no phone or email | No way back in | Step 4 |
| B3 | Students want to check results on a phone during the holidays | Blocked on the phone app, and only the app blocks it: the server lets them in. Checked | Decide now |
| B4 | A member of staff privately messages a student | **Any staff member can start a private chat with any student, and nobody else can see it.** A child safety gap. Checked | Soon |
| B5 | Students share computers in the school lab | Nothing signs them out when the next student sits down | Step 4 |
| B6 | A student's photo is used on ID cards and in the app | No record of whether the family agreed | Step 3 |
| B7 | A student with a disability needs extra exam time or a reader | Not recorded anywhere | Later |
| B8 | A student is expelled, or comes back after a long absence | Partly: a student can be marked as left | Check in step 3 |

## C. Schools

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| C1 | A **nursery or primary** school joins | **Not supported. Markova only knows O Level, A Level and TVET.** Most Rwandan schools are primary. Checked | Before launch |
| C2 | One school has two or three campuses | Not supported | Step 3 |
| C3 | A private school follows Cambridge or IB, not the national curriculum | Grading assumes the Rwandan secondary system | Later |
| C4 | A day school, a boarding school, or both at once | Boarding exists. A school with both is untested | Check |
| C5 | Each school has its own holidays, closures, exam weeks | Terms have dates; there is no school calendar of holidays and closures | Step 3 |
| C6 | A school changes its name or logo, merges with another, or closes | Name and logo can change; merging and closing are not handled | Step 5 |
| C7 | A school leaves Markova and wants all its data | A full export to CSV files exists. Checked | Step 5 |
| C8 | A school joins mid year with years of history in Excel or another system | People can be imported; marks history cannot | Step 5 |

## D. Staff

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| D1 | A teacher leaves in the middle of a term | Their classes, marks in progress and chats have no handover | Step 3 |
| D2 | A substitute covers for a teacher on leave | No temporary access that ends by itself | Later |
| D3 | A school admin looks at health or discipline records out of curiosity | Every action is logged, but nobody is told | Step 5 |

## E. Money

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| E1 | A parent wants to pay fees with MTN MoMo or Airtel Money | Not possible. The main competitor (Urubuto) does this. Checked | Soon |
| E2 | Fees are paid by a sponsor: an NGO, a district bursary, FARG | Recorded at admission only, not on the fee invoices. Checked | Step 3 |
| E3 | **How schools pay Markova**: price, trial, invoices, what happens if a school does not pay | Nothing exists | Step 5 |
| E4 | Who pays for each SMS, and how a school sees what it spent | Nothing exists | Step 5 |

## F. Running Markova as a business

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| F1 | The owner wants to know how Markova is doing this week | Nothing exists | Step 5 |
| F2 | The owner needs to tell every school about maintenance or a new feature | Nothing exists | Step 5 |
| F3 | A school asks Markova for help with something inside their data | No safe way: the owner cannot see inside schools, and there is no "let support in for one hour" | Step 5 |
| F4 | A new feature should reach a few schools first | Every school gets everything at once | Step 5 |
| F5 | One very big school slows Markova down for everyone | No limits per school | Step 7 |
| F6 | Markova is down; schools need to know why and when it is back | Nothing exists | Step 7 |
| F7 | Each school signs an agreement saying how Markova may use its data | Nothing exists, and the law expects it | Before launch |

## G. The law and the government

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| G1 | Markova must register with NCSA as a data processor | Not done | Before launch |
| G2 | Children's data must be stored in Rwanda, or with NCSA's permission | Decides where the servers go | Step 7 |
| G3 | A parent asks to see, correct or delete their data | No way to do it | Step 3 |
| G4 | Old data must be removed after a set time | Nothing is ever removed | Step 6 |
| G5 | A data leak must be reported quickly | No plan exists | Step 7 |
| G6 | Schools must also report to the government's SDMS | Typed in twice. No export to SDMS | Later |
| G7 | National exams (NESA): registering candidates, bringing results in | Nothing exists | Later |

## H. Phones, internet and language

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| H1 | Kinyarwanda, French | English only. Checked | Step 8 |
| H2 | A teacher in a rural school with weak internet | Only the register works offline on the phone | Step 9 |
| H3 | A parent loses their phone, or their SIM is swapped | No way to prove who they are and get back in | Step 4 |
| H4 | Data is expensive | The app has never been measured for how much data it uses | Step 9 |

## I. Busy days and mistakes

| # | What can happen | Markova today | When |
| --- | --- | --- | --- |
| I1 | **Every school in Rwanda publishes report cards the same week**, because the national calendar ends terms on the same day | Tested for one school's report card evening, not for hundreds at once | Step 7 |
| I2 | A school deletes something by mistake and wants it back | Restoring would roll back every school at once | Step 6 |
| I3 | Thousands of SMS go out at once on results day | No queue limits per school or per day | Step 7 |

---

## Already found and fixed

These came up during the first steps and are done, listed so they are not
searched for twice: secrets in the logs, failed messages never resent, the
mobile app unable to start, blank photos, report cards in the wrong font in
production, and the seed that could not run.

Found but still open, for the mobile redesign: the head teacher and the bursar
land in the parent's app on the phone.
