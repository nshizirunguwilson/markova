# Testing the phone

One layer, and it covers everything the app does: 2,384 tests over 93 files,
run with `npx jest`.

```bash
cd mobile
npx jest                 # everything
npx jest --coverage      # everything, with the gate
npx jest login           # one file by name fragment
npx tsc --noEmit         # the types, which CI also runs
```

The app had no tests at all before this. What is here now covers every screen,
every hook, every store and every design token, and CI fails on a drop.

## What is under test

| Layer | What it proves |
| --- | --- |
| `src/design` | The colour maths, the type scale and the token ramps hold their contract, including WCAG contrast for every hue a school could pick |
| `src/ui` | The nine shared components behave the way the design system says |
| `src/lib` | Tokens survive being stored, the API renews an expired session, an offline register is kept |
| `src/stores` | Who gets in, and the live messaging socket |
| `src/hooks` | Every read and write the app makes, as two tables |
| `app/` | All 63 screens, from what a role sees to what a refusal says |

## The test rig

`src/test/` holds everything shared. Nothing in it touches a network.

- **`harness.tsx`** renders a screen with the providers it actually reads:
  a query client that neither retries nor caches, and a safe area. It also
  holds the six signed-in people (`teacher`, `admin`, `parent`, `librarian`,
  `matron`, `nurse`) so a test says `signedInAs(matron)` and moves on.
- **`api-mock.ts`** replaces the axios instance, not the hooks. A test declares
  what each url answers with (`givenApi`) or that it fails (`givenApiFails`),
  and an undeclared url is a visible failure rather than a promise that never
  settles.
- **`router-mock.tsx`** records where a screen tried to go rather than drawing
  what came next: `router.push`, `redirectedTo()`, `screenTitle()` and the
  options each navigator declares.

### Stub the network, not the hooks

A screen test replaces `@/lib/api`. That means the screen and the query hooks
under it are exercised together, which is the seam a real user crosses, and a
screen asking for the wrong endpoint fails instead of passing against a stubbed
hook that was told to agree with it.

It has already earned that: the `/library/return` mutation was being posted
`{ loanId: { loanId } }`, so no return ever recorded, and the "who teaches
what" screen asked a hook that waits for a teacher id it never had, so it sat
on a skeleton forever.

## Standing in for the phone

`jest.setup.ts` replaces everything that only exists on a device: the keychain,
the haptic engine, the camera, the document picker, the notification service,
reanimated's native runtime and the gesture handler. Each one is as thin as it
can be while still letting a test assert on what was asked of the device.

Two of them are worth knowing about:

- **Reanimated** ships no mock for version 4, and its animations run on a
  worklet runtime that does not exist here. The stub resolves every animation
  to its final value, which is the thing a test wants to assert on anyway.
- **`Platform.OS`** is a runtime lookup, so a test can flip it. `onAndroid()`
  from the harness runs a case as if the app were on Android, which is how the
  keyboard handling and the missing haptic engine are covered. The screens used
  to read `process.env.EXPO_OS`, which is baked in at build time and is wrong
  for a bundle running somewhere else.

## Two tables instead of 105 copies

`useApi.ts` holds 105 hooks that are all one of two shapes. Hand-writing a spec
for each would rot within a month, so there are two tables:

- **`useApi.queries.spec.ts`** - for each read: the url it asks for, the
  parameters it sends, that a failure reaches the screen, and that it does not
  fire at all before it has the id it needs.
- **`useApi.mutations.spec.ts`** - for each write: the method and url, the body,
  that a refusal reaches the screen, and **which caches it clears**. That last
  one is the bug people describe as "I saved it but nothing changed", which is
  far harder to report than an outright failure.

`useApi.shaping.spec.ts` is hand-written, and only for the hooks that do more
than pass a url through. Several carry a note in the source explaining which
bug they were written to fix, and those notes are the tests.

## Writing a screen test that does not flake

**Wait for the settled screen, not the first paint.** A screen that reads one
thing to find out what to read next passes through two or three states on the
way in: empty, then a skeleton, then the answer. `waitFor` on something that
exists in the empty state resolves immediately and asserts against the wrong
one. Wait for a string that only the final state has.

Where that flicker was visible to a person as well as to a test, the screen was
fixed rather than the test: marks completion, report cards and a child's marks
all showed an empty state, then a skeleton, then the answer, because they read
`isPending` on a query that had not been enabled yet.

**Seed what a screen reads but never draws.** A lookup table the screen only
searches gives a test nothing to wait for. `renderScreen(ui, { seed: [[key,
data]] })` puts it in the cache, held fresh, so the test is about the screen
rather than about timing.

**Count pressables, do not press and hope.** `fireEvent.press` finds an
`onPress` prop on a composite element, so it fires even on a `Row` that renders
no `Pressable` at all. `pressableCount(screen)` from the harness asks the
honest question: how many things on this screen can a finger actually touch.

## Coverage

The gate lives in `mobile/package.json` and fails the build when coverage drops.
It counts every file under `src/` and `app/`, not only the ones a test imports.

The thresholds are a ratchet. Raise them as coverage climbs; never lower them to
make a build pass.
