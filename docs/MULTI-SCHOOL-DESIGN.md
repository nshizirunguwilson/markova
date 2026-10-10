# One person, many schools

_Design for step 3. Written 10 October 2026. Nothing here is built yet: this is
for agreeing how it will work before any code changes._

Markova is becoming one system that holds many schools, in one shared database.
This document is about the hardest part of that: **people**. A school is easy to
separate from another school. A person who belongs to two of them is not.

---

## 1. The people who make this hard

| Who | What happens today if every school is separate |
| --- | --- |
| A parent with four children at four schools | Four accounts, four passwords, signing out and in to see each child |
| A teacher who teaches part time at two schools | Two accounts, and messages from one school are invisible while signed in to the other |
| A teacher whose own child goes to the school they teach at | Today this is impossible: one account has one role |
| A student who transfers in Senior 3 | The new school starts them from nothing, and they lose their sign in |
| Two parents who share one phone | Very common in Rwanda. Today the phone can belong to only one of them |

The rule this design follows: **sign in once, see every school you belong to,
switch between them like Slack switches workspaces, and never let one school see
anything of another.**

---

## 2. Three ways to build it

### A. A separate account in every school

What we would get by just adding a school column to everything. Simple, and
fully separate, but it fails every person in the table above. **Rejected.**

### B. One global person with a role in each school

One `User` row for the person, shared by every school, plus a table saying
"this person is a parent at school X and a teacher at school Y".

The problem is the shared row. Today a `User` row holds the name, photo, phone,
gender, date of birth and national ID, and a school admin can edit all of it.
If the row is shared, then:

- School A's admin edits the parent's phone number and it changes at school B.
- School A can see that the person also belongs to school B, which is personal
  data school A has no reason to have (Law 058/2021).
- About 40 records point at `User` (marks recorded by, payments taken by,
  incidents logged by...). Every one would have to start asking "in which
  school?", and 88 places in the backend read `user.role` assuming there is one.

**Rejected**, because it puts a hole in the wall between schools.

### C. One login, a separate member record in each school (chosen)

This is the shape Slack uses: you sign in once with one email, every workspace
you belong to appears in a sidebar, and you switch between them, while each
workspace keeps its own profile for you.

Split today's `User` into two things:

```
Account        the login. One per human being.
               email, phone, password, sign in codes, lockout.
               Holds nothing a school owns.

Member         the person inside one school. One per school (or per role).
(today's User) school, role, name, photo, code, national ID, gender...
               Everything the 40 records already point at.
```

```
                      Account (Ange, +250788100000)
                     /            |              \
   Member @ Kigali Hill      Member @ Lycee       Member @ Kigali Hill
   PARENT of Ivan            PARENT of Keza       TEACHER of Maths
```

Why this wins:

- **The 40 links and the 88 role checks do not change.** They point at the
  member, and a member belongs to exactly one school with exactly one role, as
  a `User` does today.
- **The wall between schools stays whole.** A member row carries a school like
  every other row, so the same isolation rule covers it. School A can edit its
  member's name or photo without touching school B's.
- **The account knows nothing about schools' data.** It only knows how to sign
  a person in and which members are theirs.

---

## 3. The tables

```
School         id, name, slug, status, createdAt ...       (step 5 manages it)

Account        id, email (unique), phone (unique), passwordHash,
               forcePasswordChange, lastLoginAt, platformRole
               platformRole is null for everyone except the Markova owner

User (Member)  id, schoolId, accountId, role, firstName, lastName, photoUrl,
               code, nationalId, gender, dateOfBirth, isActive, ...
               unique (schoolId, accountId, role)
               unique (schoolId, code), unique (schoolId, nationalId)
```

The table keeps the name `User` in the code, so nothing that points at it moves.
In this document it is called a member to keep the two ideas apart.

`unique (schoolId, accountId, role)` is what lets a teacher also be a parent at
the same school: two members, one account, two roles. It also stops a school
creating the same person twice in the same role.

Everything a school owns gets a `schoolId`: almost all of today's 60 tables. A
few belong to the account instead, because they are about the login rather than
a school: sign in sessions, and the phone's push token. Every rule that says "this must be unique" becomes "unique inside the
school" (51 of them).

---

## 4. Signing in and switching

### Signing in

1. The person enters their email or phone and password (or code), once.
2. The API checks the **account**, applies the lockout and the one time code,
   exactly as today.
3. It looks up the account's active members in active schools.
   - **One member:** straight in, as today.
   - **More than one:** a short list, "Which school?", with the school's crest
     and the role. The app remembers the last one and opens it next time.
   - **None** (every school removed them, or suspended): a plain message, never
     an empty dashboard.
4. The token issued is for **one member**: it carries the member, the school
   and the role. Every request after that is inside that one school.

### Switching

A school switcher sits where the user's name is today (web) and as a sidebar on
the phone, like Slack's. Picking another school swaps the token for one issued
to the other member **of the same account**, with no password, because the
account is already proven. The API checks the target member really belongs to
that account and that school is active, then issues it.

On the phone, each school in the sidebar shows its own unread badge, so a parent
sees "Kigali Hill 2, Lycee 1" without switching.

### Why one token per school, not one token for everything

A token that opens every school at once would mean every query has to be told
which school it is for, and one forgotten filter shows school B's data inside
school A. A token for one member makes "which school" a fact of the request,
set once, that the database itself enforces (section 7).

---

## 5. Adding a person who already has an account

School B's admin adds a parent with phone +250788100000. That phone already has
an account, from school A.

- The system **links** the new member to the existing account rather than
  making a second one.
- The parent gets a message: "Lycee Notre Dame has added you as a parent. Open
  Markova to see Keza." Next time they sign in, school B is in their list. Their
  password does not change.
- **School B's admin is never told the account already existed.** The screen
  says "invitation sent" either way. Otherwise school B could find out who
  else uses Markova by typing phone numbers.

When the phone has no account yet, one is created with no password, and the
message carries a link to set one. This is how new parents already join today.

**The shared family phone.** Two parents, one phone, one account. Both are
still separate people in the school's records (two parent links to the child),
but they sign in to the same account, which then has one parent member per
school. This is the honest description of a shared phone, and it works.

---

## 6. Leaving, suspending, removing

| Event | The account | The member in that school | Other schools |
| --- | --- | --- | --- |
| A school deactivates a member | Untouched | Cannot be switched to | Untouched |
| A student transfers | Untouched | Old school keeps the record, marked transferred; new school gets a new member | Untouched |
| The owner suspends a school | Untouched | Hidden from the switcher while suspended | Untouched |
| A person deletes their account | Deleted | Each school keeps its record of them (it is the school's legal record), unlinked from any login | Same |
| Phone number changes | Updated once | Nothing to do | Nothing to do |

Changing the phone or email belongs to the account, so it is done once, by the
person, after a code to the old or new number. A school admin can no longer
change a person's sign in details, only their record in that school. Today an
admin can change any user's phone; under this design they correct the school's
contact record, and the person changes their own login.

---

## 7. The wall between schools

Two layers, as today, but both now about schools:

1. **The application.** Every request carries one school, from the token. A
   Prisma extension adds `schoolId` to every read and every write for the
   tables that have it, so a service cannot forget it.
2. **The database.** Postgres row level security on every school table:
   a row is visible only when its `school_id` matches the school the request
   set. The connection already sets `app.user_id` and `app.role` at the start
   of each transaction; it will set `app.school_id` the same way.

One change from today matters a lot: **missing context must show nothing.**
Today a query with no context sees everything, which was safe with one school.
With many, a background job that forgets to set its school would read all of
them. So the rule becomes: no school set, no rows, unless the code says out loud
that it is a platform task (the seed, the owner panel, the nightly backup),
which sets an explicit bypass that ordinary requests can never set.

Background jobs (PDF rendering, email and SMS delivery) carry the school in
their payload and set it before they touch anything. Redis keys (cache, rate
limits, chat) get the school in their name. Chat rooms are per school. Uploaded
files go under the school's own folder.

---

## 8. The parent's own view across schools

A parent with children at four schools should be able to see "is everyone at
school today" without switching four times. That is one screen that crosses the
wall, so it is built narrowly on purpose:

- It belongs to the **account**, not to any school.
- For each of the account's parent members, it runs **inside that member's
  school**, with that school's isolation switched on, and asks only for that
  member's own children's summary: attendance today, unread alerts, fees due.
- It returns a short list. It never mixes data between schools, and no school
  can call it.

It is the same data the parent could already see by switching, just gathered.

---

## 9. The Markova owner

The owner is an **account with `platformRole = SUPER_ADMIN` and no member in
any school.** They sign in to a separate platform area (step 5) that manages
schools: add, suspend, reinstate, remove, see usage. They cannot open a school's
marks, health or money records, because they have no member there and the
database wall applies to them too.

If support ever needs to look inside a school, the school's own admin grants it
for a set time, and it is written to the audit log. That is a later feature;
the default is no access.

---

## 10. Students signing in

Most students have no email or phone of their own. Today they sign in with an
address like `student1@markova.edu` that the seed invents. Real schools need a
real answer. Two options, decided in step 4 (how each school gets in):

- **School code plus student number**, for example school `KHS` and
  `STD-2026-0142`, plus a password. Works with no email and no phone.
- **An email or phone**, for students who have one.

Either way it is an account like any other, so a student who later becomes a
teacher, or a parent, keeps the same login for life.

---

## 11. What changes in the code

| Area | Change | Size |
| --- | --- | --- |
| Schema | Add `School`, `Account`; `schoolId` on almost every table; 51 unique rules made per school; indexes | Large, mostly mechanical |
| Migration | Today's data becomes school one; every user gets an account | Medium, must be exact |
| Auth | Sign in against the account; tokens per member; switch endpoint; school list | Medium |
| Isolation | Prisma extension adding `schoolId`; RLS on every table; fail closed; platform bypass | Medium, the most careful part |
| Background work | Jobs carry the school; Redis keys, chat rooms and upload folders per school | Medium |
| Admin screens | "Add person" links to an existing account; contact details split from login details | Medium |
| Web and mobile | School picker after sign in, switcher, per school badges | Medium (the mobile part folds into the redesign) |
| Seed | Three Rwandan schools, with people who belong to more than one | Medium |
| Tests | Every route, as school A, asking for school B's records by id: all must fail | Large, and the point of the whole step |

## 12. In what order

Each line is its own pull request, tested before the next starts:

1. **Schools and accounts in the schema**, today's data moved into school one.
   The app keeps working exactly as now.
2. **The wall**: school on every request, the Prisma extension, RLS on every
   table, failing closed.
3. **Sign in, school list and switching** in the API, then on the web.
4. **Everything else that remembers things**: jobs, Redis, chat, uploads.
5. **Proof**: the three school seed and the cross school test across every route.

Step 4 (how schools are reached) and step 5 (the owner panel) build on this.

---

## 13. Questions for Jarvis

1. **Do you agree with design C** (one login, a member record per school)?
2. **Can a school admin still change a person's phone number?** This design
   says no: the school edits its contact record, the person changes their own
   login. It is safer, but it is a change from today.
3. **The parent's cross school view (section 8):** build it in step 3, or leave
   it for the mobile redesign?
4. **Students' sign in (section 10):** decide now, or in step 4 as planned?
