# Future work

_Started 10 October 2026._

These are things Markova will need, but not in the phases being built now. Each
one is written out in full here so that whoever picks it up later, in a month
or in a year, understands the problem without having to rediscover it.

They come from the list in [BLIND-SPOTS.md](BLIND-SPOTS.md), where they are
marked "Future work". The code (A1, E1...) is the same in both documents.

Every item follows the same shape:

- **The problem**, in a sentence or two.
- **An example**, with real people, so it is easy to picture.
- **What Markova does today.**
- **How it could work**: a proposal, not a final decision.
- **To decide**: the questions that need an answer before building.
- **Size and order**: how big it is, and what it depends on.

---

## Families

<a id="a1"></a>
### A1. A guardian who is not a parent

**The problem.** Many children are raised by someone other than their mother or
father: a grandmother, an aunt, an older brother, a foster family, or, in SOS
Children's Villages, an SOS mother. Markova calls every one of them a "parent"
and treats them all the same.

**Example.** Keza lives with her grandmother, Mukamana, while her mother works
in Musanze. The school needs to know that Mukamana is the one who signs papers
and comes to meetings, and that the mother should still receive the report
card.

**Today.** The link between a guardian and a child has a free text field called
"relationship". Somebody can type "Grandmother", but Markova attaches no
meaning to it: it cannot tell a grandmother from a mother, and it cannot tell
who is the main contact.

**How it could work.**

- Replace the free text with a fixed list: mother, father, grandparent, aunt or
  uncle, sibling, foster parent, SOS mother, legal guardian, other.
- Mark one guardian per child as the **main contact**: the person the school
  calls first and whose phone gets urgent messages.
- Keep the word "parent" in the interface where it reads naturally, but show
  the real relationship on the child's page ("Mukamana, grandmother, main
  contact").

**To decide.**

- The exact list of relationships, checked with a few real schools.
- Whether a school may have more than one main contact per child.

**Size and order.** Small. It is mostly a change to one table and the pages
that show guardians. It is the foundation for A2, A3 and A4, so it comes first
of the four.

---

<a id="a2"></a>
### A2. A parent who must not see their child

**The problem.** Sometimes a court, or a social worker, decides that one parent
must not have contact with a child or know where the child is. This happens
after violence at home and in difficult separations. If that parent is linked
in Markova, they can see the child's attendance (so where the child is every
day), marks, health visits and messages.

**Example.** After a court case, Eric is not allowed to contact his son Ganza.
Ganza's mother gives the school a copy of the court order. Today the school can
only delete Eric's link to Ganza, which loses the history, or leave it, which
breaks the court order.

**Today.** Not possible to record. Every linked guardian sees everything about
the child.

**How it could work.**

- A guardian link can be marked **restricted**, with a reason, the date, and a
  copy of the order uploaded to the child's file.
- A restricted guardian sees nothing about the child, receives no messages
  about the child, and the child does not appear in their account at all. To
  them it looks as if the link was never there, which is safer than an error
  saying "access denied".
- Only the head teacher or the principal can set or lift a restriction, and
  every change is recorded in the audit log.
- Staff who open the child's record see a clear warning: "Do not share
  information with Eric. Court order of 3 March 2026."

**To decide.**

- Which roles may set a restriction.
- Whether a restriction should also block the person from entering the school
  (that is a gate and security question, beyond Markova).

**Size and order.** Medium. Needs A1. It touches every place a parent can see a
child, so it needs thorough tests, in the same style as the tests that already
prove one school cannot see another.

---

<a id="a3"></a>
### A3. Different guardians, different rights

**The problem.** Two guardians of the same child do not always share the same
role. One pays the fees, the other does not. One should receive the report card,
both should get attendance alerts. One may sign consent for a school trip,
the other may not.

**Example.** Ivan's parents are separated. His father pays the fees and wants
the invoices. His mother has custody, signs his trip forms and wants his report
card. Today both receive everything.

**Today.** Every linked guardian has the same access to everything about the
child.

**How it could work.** Each guardian link gets a small set of switches, all on
by default so nothing changes for most families:

| Switch | Example |
| --- | --- |
| Sees marks and report cards | On for both |
| Receives fee invoices and pays | Father only |
| Can sign consent forms | Mother only |
| Receives attendance and health alerts | On for both |
| Can message teachers | On for both |

The school sets them on the child's page. The guardian sees, in their own
account, which parts they receive.

**To decide.** The exact list of switches, and whether a guardian may turn a
switch off for themselves (for example to stop fee reminders).

**Size and order.** Medium. Needs A1. Builds on the same checks as A2.

---

<a id="a4"></a>
### A4. Children with no family: orphans and SOS Children's Villages

**The problem.** Some children have no living or reachable parent. In SOS
Children's Villages, a child lives in a family house with an SOS mother, and
the organisation is legally responsible. Other children are looked after by
the state or an NGO. Markova assumes every child has a parent who signs in.

**Example.** At an SOS school, ten children from the same SOS family house have
the same SOS mother, Uwera. When Uwera leaves her post, a new SOS mother takes
over all ten children at once. The village director must also be able to see
how all the children in the village are doing.

**Today.** The only way is to create a "parent" account for a member of staff
and link it to each child by hand.

**How it could work.**

- A guardian can be an **organisation** (SOS Children's Villages Rwanda, an NGO,
  a district office) as well as a person.
- The organisation has people with roles: an SOS mother sees the children of her
  house; a village director sees all the children of the village.
- Handover is one action: "move all of Uwera's children to Clarisse", with the
  date and the reason kept.
- Fees for these children can be billed to the organisation (see E2).

**To decide.**

- How SOS Children's Villages actually organise this, asked directly, since
  they are the first school Markova is being presented to.
- Whether an organisation spans several schools (it often does: one village can
  send children to several schools).

**Size and order.** Medium to large. Needs A1 and the one login design (an
organisation member working across several schools is the same idea as a
parent with children at several schools).

---

<a id="a6"></a>
### A6. A parent with only a basic phone

**The problem.** Only about a third of Rwandan households own a smartphone. Many
parents have a basic phone that can receive SMS and use USSD codes (like
`*182#` for MoMo), but cannot install an app or open a website.

**Example.** Ganza's father, a farmer in Nyamagabe, has a basic Nokia phone. He
wants to know whether Ganza went to school today, how he did this term, and how
much is left to pay.

**Today.** Some notices are sent by SMS (absences, a few alerts). Report cards,
marks and fee balances are not.

**How it could work.** Two ways that work together:

1. **SMS, sent automatically:** a short report card summary at the end of term
   ("Ganza, Term 1: average 72%, position 8 of 41, promoted"), a fee balance
   reminder, and absence alerts. All in Kinyarwanda by default (see the
   language work in step 8).
2. **USSD, when the parent asks:** the parent dials a short code, picks the
   child and the school from a menu, and sees attendance this week, the last
   report card summary or the fee balance on screen. No app, no internet, no
   data cost.

**To decide.**

- The SMS and USSD provider (not chosen yet; Twilio stays for now).
- Who pays for each SMS and each USSD session: the school, the parent, or
  Markova (this links to E4, SMS costs per school).
- How a parent proves who they are on USSD (their phone number, plus a PIN).

**Size and order.** Large. Needs the provider decision and the language work.
The SMS part can come before the USSD part.

---

## Schools

<a id="c2"></a>
### C2. One school, several campuses

**The problem.** Some schools have more than one site under the same
management: a primary campus and a secondary campus, or two branches in two
districts. They want one school in Markova, with each campus kept apart where
it matters.

**Example.** Kigali Hill School has its secondary campus in Kacyiru and its
primary campus in Kimironko. Each campus has its own head teacher, its own
classes and its own register, but one principal, one fee structure and one
brand.

**Today.** Not supported. The only option is to register two separate schools,
which splits the principal's view and the fee records.

**How it could work.**

- A school can have **campuses**. Classes, staff and students belong to a
  campus.
- People can be limited to one campus (the Kimironko head teacher sees only
  Kimironko) or see all of them (the principal).
- Reports and the owner panel can show the school as a whole or campus by
  campus.

**To decide.** What is shared between campuses and what is not, asked of a real
school that has more than one.

**Size and order.** Large. It builds on the wall between schools from step 3,
and is a second, smaller wall inside a school.

---

<a id="c3"></a>
### C3. Schools that follow another curriculum

**The problem.** Some private and international schools in Rwanda do not follow
the national curriculum. They follow Cambridge, the International
Baccalaureate, an American curriculum or another system, each with its own
subjects, grades, terms and report cards.

**Example.** An international school grades with letters A* to U (Cambridge
IGCSE), not with the Rwandan points system, and its report card has a different
layout and different comments.

**Today.** Grading, aggregates and report cards are built around the Rwandan
secondary system.

**How it could work.**

- Make the **grading system a setting of the school**, not something built into
  the code: grade bands, letters, points, what counts towards a total.
- Make the **report card layout a template** the school chooses, starting with
  the national one.
- Ship a few ready made systems (Rwandan national, Cambridge, IB) and let others
  be added.

**To decide.** Which international curricula Rwandan schools actually use, and
how many such schools Markova expects to serve.

**Size and order.** Large. It overlaps with the nursery and primary phase, which
also needs grading to become a setting, so the two should be designed together.

---

## Money

<a id="e1"></a>
### E1. Paying fees with mobile money

**The problem.** Most Rwandan parents pay through MTN MoMo or Airtel Money.
Today they pay at the bank or the school counter and bring a slip, which the
bursar types in by hand. Urubuto, the main competitor, already lets parents
pay from their phone (including by dialling `*775#`).

**Example.** Ange gets the reminder "Keza has 85,000 RWF left to pay for Term
1". She taps "Pay with MoMo", approves on her phone with her MoMo PIN, and the
fee balance updates on its own. The bursar types nothing.

**Today.** The bursar records payments by hand. "Mobile money" exists only as a
label for a payment taken elsewhere.

**How it could work.**

- MTN's MoMo API offers "Request to Pay": Markova asks for an amount from a
  phone number, the parent approves on their phone, and the money goes to the
  school's merchant account. Airtel Money works in a similar way. A payment
  aggregator can offer both through one connection, for a higher fee.
- Each school uses **its own merchant account**, so money goes straight to the
  school, never through Markova.
- When a payment is confirmed, Markova records it against the invoice with the
  provider's reference. Payments are already protected from being recorded
  twice.
- A daily statement for the bursar compares Markova's records with the
  provider's.

**To decide.**

- Direct connection to MTN and Airtel, or one aggregator.
- Who pays the transaction fee: the parent or the school.
- Whether Markova takes any part of a payment (this links to E3, how schools
  pay Markova).

**Size and order.** Large. Going live needs each school's paperwork with MTN
(their KYC process) and a sandbox phase first.

---

<a id="e2"></a>
### E2. Fees paid by a sponsor

**The problem.** Many students' fees are paid, in full or in part, by someone
other than the family: a district bursary, a government scholarship, FARG,
an NGO, or SOS Children's Villages. The school needs to bill the sponsor for
its share and the family for the rest, and to show each sponsor what it paid
for.

**Example.** Divine's fees are 300,000 RWF a term. The district pays 200,000.
Her family pays 100,000. The school sends the district one statement for all
the students it sponsors, and Divine's family sees only their 100,000.

**Today.** Funding (family, district bursary, government, NGO, FARG, staff
child) is recorded when a student is admitted, but invoices know nothing about
it: every invoice is addressed to the family.

**How it could work.**

- Sponsors become records in the school: name, contact, what they pay for.
- A student's fees can be **split by payer**, by amount or by item (the sponsor
  pays tuition, the family pays boarding).
- The bursar sees what each sponsor owes, and can send each one a single
  statement for all its students.
- The family's view shows only the family's share.

**To decide.** How sponsors actually pay schools in practice (per term, per
year, in arrears), asked of a few bursars.

**Size and order.** Medium. Builds on the fee ledger that already exists, and
fits well with A4 (an organisation as a guardian).

---

## The law and the government

<a id="g1"></a>
### G1. Registering Markova with NCSA

**The problem.** Rwanda's data protection law (Law No. 058/2021) says that
anyone who holds or processes people's personal data must register with the
National Cyber Security Authority (NCSA). Markova holds the data of children,
parents and staff, so it must register.

**In plain words.** Each school is the **data controller**: it decides why it
holds a child's data. Markova is the **data processor**: it holds the data on
the school's behalf. Both have duties under the law.

**What registration involves.** The application describes who Markova is and
its contact person, what kinds of data it holds and about whom, why, who
receives it, where it is stored, any transfer outside Rwanda, and the risks
and how they are managed. Once approved, NCSA issues a certificate, and Markova
must tell NCSA when any of this changes.

**How it could work.**

- Before the first paying school: prepare the application with a lawyer who
  knows the law, using the answers this project already has (what is stored,
  where, how it is protected).
- Name a person responsible for data protection at Markova.
- Write a short **data processing agreement** that every school signs: what
  Markova may and may not do with the school's data. (That agreement is near
  work, F7, because schools will ask for it.)

**To decide.** Which lawyer, and whether Markova registers as a company first
(registration is in the company's name).

**Size and order.** Not code. Paperwork and legal advice. It must be done
before Markova holds real schools' data.

---

<a id="g2"></a>
### G2. Keeping the data in Rwanda

**The problem.** The same law says personal data should be stored in Rwanda,
unless NCSA gives permission to store it abroad. Large cloud providers (AWS,
Azure, Google) have no data centre in Rwanda; the nearest are in South Africa
and Kenya.

**Today.** Nothing is deployed yet, so nothing is decided.

**How it could work.** Two paths, chosen in step 7 (servers):

1. **Host in Rwanda**, in a local data centre (AOS, which runs the National Data
   Center, or TrAC). Simplest legally. Prices must be asked for directly.
2. **Host abroad with NCSA's permission**, for example in South Africa. More
   choice of services, but needs the permission, which names the exact
   platform, and must be renewed if the platform changes.

Backups follow the same rule: a backup copied abroad is data stored abroad.

**To decide.** Path 1 or path 2, after getting real prices from the Rwandan
data centres and legal advice on path 2.

**Size and order.** A decision, made in step 7 before any school's data is
stored for real.

---

<a id="g3"></a>
### G3. When someone asks to see, correct or delete their data

**The problem.** Under the law, a person may ask what data is held about them,
ask for mistakes to be corrected, and in some cases ask for it to be deleted.
For a child, the request comes from the parent or guardian.

**Example.** Ange asks Kigali Hill: "What do you hold about me and about Ivan?"
The school must be able to answer in a reasonable time, completely.

**Today.** No tool for it. Someone would have to search the database by hand.

**How it could work.**

- **See:** a "My data" page in each person's account that downloads everything
  held about them (and, for a guardian, about their children) at that school.
- **Correct:** the person points to what is wrong; the school corrects it; the
  change is logged.
- **Delete:** handled carefully. Some records must be kept by law (a school's
  record of a student's results, payments received). So "delete" removes what
  can be removed, and for the rest, the login is unlinked and the record kept
  only as long as the law requires (this links to G4, how long data is kept,
  which is near work).
- Every request, and how it was answered, is recorded.

**To decide.** With legal advice: what a school must keep, and for how long.

**Size and order.** Medium. Builds on the full export that already exists
(C7), which will be checked first.

---

<a id="g6"></a>
### G6. Sending data to the government's SDMS

**The problem.** Every school in Rwanda must keep its data in SDMS, the
Ministry of Education's School Data Management System: students, attendance,
results and more. A school using Markova would type everything twice, once in
Markova and once in SDMS.

**Example.** At the start of the year, the secretary at Kigali Hill types 754
students into Markova, then types the same 754 students into SDMS. At the end of
term, the results are entered twice as well.

**Today.** Nothing connects Markova to SDMS.

**How it could work.**

- First, find out **how SDMS accepts data**: an upload of a spreadsheet in its
  own format, a connection for software (an API), or only typing by hand. This
  needs a conversation with the Ministry of Education.
- If uploads are accepted: Markova produces the file in exactly SDMS's format,
  so the school uploads instead of typing.
- If there is a connection for software: Markova sends the data directly, with
  the school's approval each time.
- Bringing data **from** SDMS into Markova would also make joining Markova much
  easier (this fits with C8, bringing a school's history in).

**To decide.** Everything depends on what the Ministry allows. Being able to
say "no double entry with SDMS" would be a strong reason for a school to choose
Markova.

**Size and order.** Unknown until the Ministry answers. Start with the
conversation.

---

<a id="g7"></a>
### G7. National exams with NESA

**The problem.** NESA (the National Examination and School Inspection
Authority) runs the national exams at the end of primary (P6), lower secondary
(S3) and upper secondary (S6). Schools register their candidates, and later
receive the results. NESA also sets rules for school based assessment, such as
its guidelines for project based assessment.

**Example.** In S3, Kigali Hill must register 120 candidates for the national
exam. Today that list is prepared outside Markova, although Markova already
knows every one of those students.

**Today.** Nothing connects Markova to NESA.

**How it could work.**

- Produce the **candidate list** in the format NESA asks for, from the students
  Markova already knows.
- When national results are published, let the school **bring them into
  Markova**, so they appear in each student's record next to the school's own
  results.
- Follow NESA's assessment rules (such as project based assessment) in how
  marks are recorded, so school results line up with what NESA expects.

**To decide.** Like G6, it depends on what NESA accepts. Ask NESA directly, and
check how candidate registration works today.

**Size and order.** Medium, once the formats are known. Most useful for schools
with P6, S3 or S6 classes, so it also depends on the nursery and primary phase
for P6.

---

## Sources

- [DLA Piper: data protection in Rwanda](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law)
- [Hogan Lovells: key features of the Rwandan data protection law](https://hoganlovells.com/en/publications/key-features-of-the-new-rwandan-data-protection-law)
- [Digital Policy Alert: data localisation in Law 058/2021](https://digitalpolicyalert.org/change/12074-data-localisation-requirement-in-law-no-0582021-relating-to-the-protection-of-personal-data-and-privacy)
- [Data centres in Kigali](https://www.datacentermap.com/rwanda/kigali/)
- [MTN MoMo API Rwanda](https://momoapi.mtn.co.rw/products)
- [UNICEF Rwanda on SDMS](https://www.unicef.org/rwanda/stories/harnessing-transformative-power-technology-educational-outcomes)
- [NESA announcements](https://nesa.gov.rw/announcements)
- [TechCabal: smartphone ownership in Rwanda](https://techcabal.com/2025/06/12/rwanda-internet-penetration-rate/)
- [Urubuto](https://urubuto.rw/)
