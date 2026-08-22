# Testing the dashboard

Three layers, each answering a different question.

| Layer | Question | Command |
| --- | --- | --- |
| Unit and component | Does this behave correctly? | `npx vitest run --coverage` |
| Browser audit | Does the real app still work? | `node e2e/ui-audit.spec.js` |
| Accessibility audit | Can everyone use it? | `node e2e/a11y-audit.spec.js` |

All three run in CI. The two browser audits run against a live API and a real
build, in the `Web (browser audit + accessibility)` job.

## Running them

```bash
# unit and component, with the coverage gate
cd web && npx vitest run --coverage

# the browser audits need the API on :3000 and the dashboard on :3001,
# with the demo seed loaded
WEB=http://localhost:3001 API=http://localhost:3000/api node e2e/ui-audit.spec.js
WEB=http://localhost:3001 API=http://localhost:3000/api node e2e/a11y-audit.spec.js
```

## The test rig

`src/test/` holds everything shared. Nothing in it touches a network.

- **`harness.tsx`** puts a component under the query provider and signs a user
  into the auth store. `signIn("TEACHER")` is the whole ceremony.
- **`page.tsx`** renders a page the way the app does. Its four serve helpers are
  the four states every page has to survive: `serve` (declared routes),
  `serveAll` (one answer for everything, usually empty), `serveFailure`, and
  `serveNever` for the loading state.
- **`hooks.tsx`** drives the `use-<domain>` hooks from a table. Those hooks are
  all one of two shapes, and 144 hand-written copies of the same eight lines
  would rot; a row per hook does not.
- **`fixtures.ts`** holds one realistic response per endpoint. Rwandan names and
  `+250` numbers, matching the demo seed.

### Stub the network, not the hooks

Page tests replace `@/lib/api`, not `@/hooks/use-*`. A page test therefore
exercises the page and the query hooks under it together, which is the seam a
real user crosses. It also means a page asking for the wrong endpoint fails the
test instead of passing against a stubbed hook that was told to agree with it.

`serve` rejects any url the test did not declare, so an unanticipated request is
a visible failure rather than a promise that never settles.

### Watch the response envelope

List endpoints answer with `{ data, meta }`, from `PaginatedResponse` in
`backend/src/common/dto/pagination.dto.ts`. A fixture that names the array
anything else renders an empty table and passes, which is worse than having no
fixture at all. That mistake is why `paginatedUsers` carries a comment.

## The exercise pass

`src/test/exercise.tsx` drives a page the way a person would: choose the
filters, fill the fields, click every control, walk a wizard forward, open each
dialog and work through it, submit every form. It asserts three things, and they
are deliberately blunt: nothing threw, no promise was left unhandled, and the
screen is not blank.

Three details in it matter more than they look:

- **Filters cascade.** The section select is disabled until a level is chosen,
  the term until a year. Setting them in one pass leaves every dependent control
  disabled, and the whole page behind the filter bar goes untested. It waits for
  each dependent query before choosing the next.
- **It waits for data before looking for options.** A select renders instantly
  with only its placeholder. Running straight away finds nothing to choose and
  gives up silently.
- **It stubs downloads.** Export and print handlers reach for
  `URL.createObjectURL` and `window.open`, neither of which jsdom has, and
  without stubs the pass dies before reaching them.

## The resilience pass

`src/app/__tests__/pages.resilience.test.tsx` renders every dashboard page four
ways: empty API, failing API, slow API, and populated. Its table is generated
from the route tree, so a new page is covered without anyone remembering to add
it.

It is deliberately shallow. It proves a page survives; a page's own test file
proves it is correct. It has already caught pages that white-screened on a
response one field thinner than expected, which is the failure mode that matters
most here: a blank screen tells a teacher their marks are gone.

## Writing a page test that does not flake

Two rules, both learned the hard way here.

**Use `fireEvent` for form fields, not `userEvent.type`.** react-hook-form
settles its state asynchronously; typing key by key races the resolver, and a
submit can land on a form that has not registered the typing. One test passed
about two runs in three until it was changed to a synchronous
`fireEvent.change` followed by `fireEvent.submit`.

**Wait for the data, not for the frame.** `waitFor(() => body.textContent !==
"")` resolves the instant a heading renders, long before any query lands. Wait
for the thing you are about to interact with: a select with real options, a row
with a name in it.

## Coverage

The gate lives in `vitest.config.ts` and fails the build when coverage drops.

Note `include: ['src/**/*.{ts,tsx}']`. Counting only the files a test imports
reported 79% while the real figure across the codebase was 2%, because it was
measuring the corner it already covered. Every source file is counted.

The thresholds are a ratchet. Raise them as coverage climbs; never lower them to
make a build pass.

## What the audits are for

The browser audit covers what unit tests structurally cannot: a route guard that
stopped guarding, a form that stopped saving, a table that overflows on a phone.

It is also the reason it runs in CI. It sat broken for months, pointing at
`@markova.academy` addresses when the seed uses `@markova.edu`, and nobody
noticed because nothing ran it. A test that is not in the pipeline is a test
that has already stopped working.
