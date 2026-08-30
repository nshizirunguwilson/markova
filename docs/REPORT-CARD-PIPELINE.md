# How a report card gets issued

A report card is not a page that renders. It is the last step of a chain that
four different people walk through in order, and every step refuses to run
until the one before it is done. That is the whole design, and almost every
bug in this area has been the same bug: some part of the system knew about one
gate and not the other three.

Read this before changing anything under `marks/` or `report-cards/`.

## The four gates

```
subject teachers          class teacher            DOS                DOS
      |                         |                   |                  |
   enter marks  ->  release  -> write a comment  -> confirm  ->  issue the card
                   the marks     on every card      the class      to families
      |                |               |                |              |
  Mark rows      isPublished     teacherComment    dosConfirmed  reportCardPublished
```

Each arrow is a real refusal in `backend/src/modules/marks/marks.service.ts`,
not a convention:

| Gate | Enforced in | Refuses when |
| --- | --- | --- |
| Release the marks | `publishTermResults` | never; this is the first act |
| Confirm the class | `confirmReportCards` | any result is unpublished, **or** any card's `teacherComment` is blank |
| Issue the cards | `publishReportCards` | any result is unpublished, **or** any card is unconfirmed |

Two of these run backwards as well, and that is deliberate:

- **Withdrawing the marks withdraws the card.** The document prints the marks,
  so leaving it out would publish through the back door exactly what was just
  taken back (`publishTermResults`).
- **Handing a class back withdraws any card already issued.** Otherwise a
  family holds a card the DOS has just said is not right (`confirmReportCards`).

## Who may do what

This is the part people get wrong, because two of the roles cannot cover for
each other even though both are senior.

| Act | Role | Route |
| --- | --- | --- |
| Enter marks | `TEACHER`, `HEAD_TEACHER` | `POST /marks`, `/marks/batch` |
| Work out results | `HEAD_TEACHER` | `POST /marks/term-results/calculate` |
| Release the marks | `HEAD_TEACHER` | `POST /marks/term-results/publish` |
| Write the class teacher's comment | `TEACHER`, and only for their own class | `PUT /marks/term-results/:id/comment` |
| Write the head teacher's comment | `HEAD_TEACHER` | the same route |
| Confirm a class | `HEAD_TEACHER` | `POST /marks/report-cards/confirm` |
| Issue the cards | `HEAD_TEACHER` | `POST /marks/report-cards/publish` |

`HEAD_TEACHER` is the Director of Studies. Note two consequences that are easy
to trip over:

**The DOS cannot write the class teacher's comment.**
`updateTermResultComment` refuses `teacherComment` from anyone whose role is
not `TEACHER`, and refuses it from a teacher who is not the class teacher of
that section. So when a class is stuck at gate 2, the DOS genuinely cannot
unblock it themselves. They have to chase the class teacher. A screen that
offers them a confirm button in that state is offering something the API will
reject.

**The principal has no route here at all.** Marks, the register and report
cards moved to the DOS. `ADMIN` is absent from every route above, and
`backend/src/modules/marks/academic-control.spec.ts` reads the `@Roles`
decorators themselves so that a new route copied from the one above it fails
there rather than in a demo. There is no fallback when the DOS is away; a
school that needs one appoints an acting DOS.

## What a family sees, and when

Three different things become visible at three different moments, which is why
there are three flags rather than one.

| Flag | What it releases |
| --- | --- |
| `isPublished` | the subject breakdown, average and position, on the student's own page |
| `dosConfirmed` | nothing. It is the school's internal check |
| `reportCardPublished` | the document itself, as a page, as HTML and as a PDF |

`reports.service.ts#isReportCardIssued` exists so that every route serving the
document asks the same question. A student who cannot open the card on one
page must not be able to fetch the identical document as HTML or PDF from
another.

## Where the code lives

**Backend**

| File | What it holds |
| --- | --- |
| `modules/marks/marks.service.ts` | the gates: `publishTermResults`, `confirmReportCards`, `publishReportCards`, `updateTermResultComment` |
| `modules/marks/marks.controller.ts` | the `@Roles` on every route |
| `modules/marks/academic-control.spec.ts` | proves the principal has no route on marks, the register or a report card |
| `modules/marks/head-teacher-dashboard.service.ts` | `blockerFor()` and `OWNER_OF`: what is holding each class up, and whose move it is |
| `common/report-comments.ts` | drafts both comments; `MAX_COMMENT_WORDS = 20` |
| `common/validators/max-words.validator.ts` | `@MaxWords(20)`, counted in words because the printed box is two inches tall |
| `modules/reports/reports.service.ts` | the printed card itself, and `isReportCardIssued` |
| `prisma/seed.ts` | `CardStage` and `currentTermStage()` |

**Web**

| File | What it holds |
| --- | --- |
| `lib/report-card-step.ts` | `tally()`, `stepOf()`, `issueBlocker()`, `checkCard()`: the first unmet gate, in one place |
| `app/(dashboard)/admin/marks/page.tsx` | the control strip: release the marks, see the check, issue the cards |
| `app/(dashboard)/admin/report-cards/page.tsx` | write the comments, then confirm the class |
| `app/(dashboard)/head-teacher/page.tsx` | the DOS's morning list, ordered by what needs doing |
| `hooks/use-marks.ts` | the mutations and what each one's toast says |
| `components/layout/dashboard-shell.tsx` | `MOVED_TO_HEAD_TEACHER`, which route guarding reads |

## The two blocker functions, and why there are two

They look duplicated. They are not.

`head-teacher-dashboard.service.ts#blockerFor` answers **across the school**,
from counts the server has already gathered, and it can see one thing the page
cannot: `MARKS_NOT_ENTERED`, which compares subjects marked against subjects
taught. That needs the timetable, so it only exists server side.

`lib/report-card-step.ts#stepOf` answers **for the one class on screen**, from
the results the page already fetched. It starts at `MARKS_DRAFT` because by
the time you are looking at a class's results, whether every subject was
marked is no longer the question in front of you.

Both return the **first** unmet gate and only that one. A class with no
comments and no confirmation is held up by the comments; naming both would
ask somebody to do a thing they cannot do yet. If you add a gate, add it to
both, in pipeline order.

## Working on it, step by step

### Change a rule

1. Change the refusal in `marks.service.ts`. That is the only thing that is
   actually enforced; everything on screen is a report of it.
2. Mirror it in `web/src/lib/report-card-step.ts` so the button is disabled
   for the right reason and says so.
3. Mirror it in `head-teacher-dashboard.service.ts#blockerFor` if it is a
   state a whole class can sit in.
4. Add the case to `report-card-step.test.ts` and `marks.service.spec.ts`.

Rule of thumb: **a disabled control must name the gate that is really
blocking, not the gate nearest to it.** If the button cannot say why, the user
finds out by clicking and reading a rejection, which is where the last bug in
this area lived.

### Change the printed card

`reports.service.ts` builds the HTML, and the PDF is that same HTML rendered
by Chrome through `page.pdf()`. `page.pdf()` uses **print media**, so a
`@media print` block covers both printing and downloading, and it is how the
stamp watermark and the QR code stay off the screen version. Remember that
`position: fixed` repeats on every printed page while `absolute` appears only
on page one, and that the card must stay one page.

### Change a comment

Both comments are capped at twenty words by `@MaxWords(20)`, counted in words
rather than characters because what has to fit is a sentence in a fixed box.
The drafts come from `common/report-comments.ts`, which assembles ordered
clauses with `fit()` until the budget runs out, so the most important thing
survives the trim. Asking for a draft saves nothing: it lands in a box and the
person whose name goes under it decides what is written.

### Test what you changed

```bash
cd backend && npx jest marks           # the gates
cd backend && npx jest academic-control # who may reach them
cd web && npx vitest run src/lib/report-card-step.test.ts
cd web && npx vitest run "src/app/(dashboard)/admin/marks"

# and the browser, which needs web on :3001 and the API on :3000, seeded
WEB=http://localhost:3001 API=http://localhost:3000/api node web/e2e/ui-audit.spec.js
```

Never run `npm run build` in `backend/` while the dev server may be running.
Use `npx tsc --noEmit`, which writes nothing.

## The demo data

A fresh seed used to park every class at the first gate, so that the demo
showed the pipeline from the beginning. That was right about the intent and
wrong in practice: nothing could be confirmed anywhere, so no report card in
the school could be issued, and the screen did not say why.

`currentTermStage()` in `prisma/seed.ts` now spreads the current term across
the gates by section index:

| Stage | What it looks like |
| --- | --- |
| `DRAFT` | marks worked out but not released |
| `WRITING` | marks out, the class teacher part way through the comments |
| `TO_CHECK` | every comment written, waiting on the DOS |
| `TO_ISSUE` | confirmed, ready to issue |
| `ISSUED` | every past term |

Roughly six classes sit in each of the middle stages and the rest stay draft,
so both of the DOS's own controls have a class to act on the moment they sign
in. The demo teacher's own class is pinned to `WRITING`, so signing in as
`aline.uwase@markova.edu` finds cards waiting to be written on rather than a
class the seed already finished.

Reseeding truncates sessions and logs everybody out. Say so before you run it.

## Things that have already gone wrong here

Kept because each one cost an afternoon and each is easy to reintroduce.

- **A page that knew one gate.** `/admin/marks` reported the DOS's check
  whatever was really blocking, and pointed at a confirm button the API
  refuses until every card is written on. Fixed by `report-card-step.ts`.
- **A seed with no comments.** Gate 2 was unmet for all 29 classes, so gate 4
  was unreachable school-wide.
- **Naming somebody who cannot act.** A confirmed class read "Waiting on the
  principal" after issuing had moved to the DOS, so the row pointed at a
  person with no route to clear it.
- **A comment of spaces.** `confirmReportCards` filtered on `null` and `''`
  only, so a box holding a space passed the gate and printed an empty comment.
  It now trims.
- **Adding a page to the wrong list.** In `dashboard-shell.tsx`,
  `SHARED_ADMIN_PAGES` *adds* roles and `MOVED_TO_HEAD_TEACHER` *replaces*
  them. Putting a report card page in the first left the principal with it.
