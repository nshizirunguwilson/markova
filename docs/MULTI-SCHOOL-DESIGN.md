# One person, many schools

_A plan for step 3, written 10 October 2026. Nothing is built yet._

Markova will hold many schools in one database. Keeping schools apart is the
easy part. The hard part is **people who belong to more than one school.**
This document explains how that will work.

---

## 1. Who this is for

- **A parent with children at different schools.** Example: Ange has Ivan at
  Kigali Hill School and Keza at Lycée Notre Dame.
- **A teacher who works at two schools.** Example: Eric teaches maths at Kigali
  Hill in the morning and at Lycée Notre Dame in the afternoon.
- **A teacher who is also a parent at the same school.** Example: Aline teaches
  at Kigali Hill, and her son studies there.
- **A student who changes school.** Example: Divine moves from Kigali Hill to
  Lycée Notre Dame in Senior 3.

If every school gave these people a separate account, Ange would need two
passwords and would sign out and in every time she wanted to see her other
child. That is a bad experience.

---

## 2. The idea in one sentence

**Each person signs in once, sees every school they belong to, and switches
between them, the way Slack lets you switch between workspaces.**

---

## 3. How it works

Every person has two kinds of record:

1. **A login.** Only one, for life. It holds how they sign in: their phone or
   email, and their password. Nothing else.
2. **A school record.** One in each school they belong to. It holds what that
   school knows about them: their name, photo, role (parent, teacher...) and
   their work in that school.

Example: Ange.

| | Holds |
| --- | --- |
| **Ange's login** | Phone +250788100000, her password |
| Her school record at **Kigali Hill** | Parent of Ivan |
| Her school record at **Lycée Notre Dame** | Parent of Keza |

Example: Aline, who is a teacher and a parent at the same school.

| | Holds |
| --- | --- |
| **Aline's login** | Her email, her password |
| School record at **Kigali Hill** | Teacher of Mathematics |
| Another school record at **Kigali Hill** | Parent of her son |

---

## 4. What the person sees

**Signing in**

1. Ange types her phone number and password, once.
2. Markova sends her the usual six digit code.
3. Then:
   - If she belongs to **one school**, she goes straight in, like today.
   - If she belongs to **several**, she sees a short list: "Kigali Hill,
     Parent" and "Lycée Notre Dame, Parent". She taps one.
   - Next time, Markova opens the school she used last.

**Switching**

- On the website, a school switcher sits next to her name at the top.
- On the phone, a side panel lists her schools, like Slack's.
- Each school shows its own count of unread messages, for example
  "Kigali Hill 2, Lycée 1", so she knows where to look.
- Switching does not ask for her password again.

---

## 5. Keeping schools apart

This is the most important rule: **one school must never see anything of
another school.**

- When Ange is inside Kigali Hill, she sees only Kigali Hill. To see Lycée, she
  switches. She is never inside both at the same moment.
- Kigali Hill's staff can never see that Ange also belongs to Lycée. That is
  private, and Rwanda's data protection law protects it.
- Kigali Hill can change Ange's name or photo in **its own** record. That does
  not change anything at Lycée.
- The check happens twice: the app checks it, and the database checks it again
  on every single row. If the app ever forgets, the database still says no.
- If something asks the database for data **without saying which school**, it
  gets nothing. Today it would get everything, which was fine with one school
  and is dangerous with many.

---

## 6. Adding a person who already uses Markova

Lycée Notre Dame's admin adds Ange as a parent, using her phone number. Ange
already has a login from Kigali Hill.

- Markova does **not** create a second login. It adds Lycée to her existing one.
- Ange gets a message: "Lycée Notre Dame has added you as a parent. Open
  Markova to see Keza." Her password stays the same.
- Lycée's admin sees "Invitation sent", whether Ange already had a login or not.
  Otherwise any school could type phone numbers to find out who uses Markova.

If the number has never been used, Markova creates a new login and the message
has a link to set a password. That is how parents join today.

---

## 7. When someone leaves

| What happens | Result |
| --- | --- |
| A school removes a person | They can no longer open that school. Their other schools are not affected. |
| A student changes school | The old school keeps its records. The new school starts its own. The student keeps the same login. |
| The Markova owner suspends a school | That school disappears from everyone's list until it is reinstated. |
| A person changes their phone number | They change it once, on their login, and every school is up to date. |

**One change from today:** a school admin will no longer be able to change a
person's **sign in** phone or email, because that login is shared with their
other schools. The admin can still change the school's own **contact** details.

---

## 8. The Markova owner

You, as the owner, get a special login that belongs to **no school**. It opens
the owner panel (step 5), where you add, suspend, reinstate and remove schools.

It **cannot** read inside a school: no marks, no health records, no money.
Schools trust Markova with children's data, and the owner not being able to see
it is part of that trust.

---

## 9. Optional: one screen for all your children

A parent with children at several schools could see one summary screen:
"Ivan: at school today. Keza: at school today, 1 new message." It would show
only the parent's own children, only basic facts, and each school's part would
be fetched with that school's wall in place. This can be built now or with the
mobile redesign (question 3 below).

---

## 10. Students

Most students have no phone or email of their own. Today they sign in with a
made up address like `student1@markova.edu`, which will not work for real
schools. Two possible answers:

- **School code and student number**, for example `KHS` and `STD-2026-0142`,
  with a password.
- **Their own phone or email**, for students who have one.

Either way, a student keeps the same login for life, even after they leave
school and come back one day as a teacher or a parent.

---

## 11. The order of work

Each part is its own pull request, tested before the next one starts:

1. Add schools and logins to the database. Today's data becomes the first
   school. Everything keeps working as now.
2. Build the wall between schools, in the app and in the database.
3. Sign in, the school list, and switching.
4. Make everything else respect schools: background jobs, saved files, chat.
5. Prove it: demo data with three Rwandan schools, and a test that tries to
   reach another school's data through every part of the system. All attempts
   must fail.

---

## 12. Questions for you

1. Do you agree with the idea: **one login per person, one record per school**?
2. Should a school admin be **unable** to change a person's sign in phone or
   email (section 7)?
3. The summary screen for all of a parent's children (section 9): build it now,
   or with the mobile redesign?
4. How students sign in (section 10): decide now, or in step 4 as planned?

---

## For developers

The technical shape, kept short:

- **New tables:** `School`, and `Account` (the login: email, phone, password
  hash, sign in state, and a `platformRole` that is set only for the owner).
- **Today's `User` table stays, as the school record.** It gains `schoolId` and
  `accountId`, and loses the sign in fields to `Account`. The roughly 40 tables
  that point at `User` and the 88 places that read `user.role` keep working,
  because a `User` still means one person in one school with one role.
- **Unique rules:** `(schoolId, accountId, role)` on `User`. Every other unique
  rule (51 in all) becomes unique within a school.
- **`schoolId` on almost every table.** Sign in sessions and push tokens belong
  to the `Account` instead.
- **Tokens:** each access token is for one `User`, so it carries one school and
  one role. Switching exchanges it for a token for another `User` of the same
  `Account`, after checking that the school is active.
- **The wall:** a Prisma extension adds `schoolId` to every query, and Postgres
  row level security on every school table checks `school_id` against
  `app.school_id`, set per transaction like `app.user_id` today. No setting
  means no rows. Platform tasks (the seed, the owner panel, backups) use an
  explicit bypass that a request can never set.
- **Elsewhere:** jobs carry `schoolId`; Redis keys and chat rooms include it;
  uploads go under a folder per school.
