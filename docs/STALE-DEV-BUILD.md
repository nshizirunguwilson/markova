# When a change doesn't show up

The dev server sometimes serves assets built before your change, and keeps
doing it across a restart. It has happened three times now: once with
JavaScript and twice with CSS. Every time the code on disk was correct and the
browser was being handed something older.

It is worth knowing because a wedged build is indistinguishable from a broken
feature. You test, nothing happens, and every instinct says the change is
wrong.

## The shape it takes with CSS

The third time was the confusing one, because it was **partial**. The
Tailwind-generated utilities were current — classes added the same hour were
in the stylesheet — while the hand-written rules in `globals.css` were a
round behind. So the page looked *almost* right, and the one thing that had
changed was the one thing missing.

It also survived a restart and a `touch` of the file. What eventually rebuilt
it was a second `touch` a few seconds later; what would have fixed it in one
step is the command below.

The symptom to watch for: a change you can see in the source, cannot see in
the browser, and cannot explain. Check what is served before you go looking
for a bug in the code.

## The one command

```bash
cd web && npm run dev:fresh
```

That clears `.next` and starts the dev server. Do this before concluding a
change did not work.

## How to tell that is what you are looking at

Ask the server what it is actually serving, rather than trusting the browser:

```bash
# The stylesheet the page links to
CSS=$(curl -s http://localhost:3001/admin/users | grep -o '/_next/static/[^"]*\.css' | head -1)

# Is your change in it?
curl -s "http://localhost:3001$CSS" | grep -c "the-class-you-added"
```

`0` means the server never built your change — no amount of reloading the
browser will help, because the bytes it is being handed are old. Anything
above `0` means the CSS is fine and the problem is elsewhere.

For a rule you cannot grep for by class name — a pseudo-element, say — ask the
browser what it computed instead. `web/e2e/ui-audit.spec.js` does this for the
message bubbles, which is why a stale stylesheet now fails the audit rather
than waiting to be noticed:

```js
const before = getComputedStyle(el, '::before');
// content: "none" means the rule never reached the browser at all.
```

The same trick works for JavaScript:

```bash
curl -s http://localhost:3001/admin/users | grep -o '/_next/static/[^"]*\.js' | while read c; do
  curl -s "http://localhost:3001$c" | grep -l "somethingFromYourChange" >/dev/null && echo "found in $c"
done
```

## Why a browser reload is not enough

The dev server sends `Cache-Control: no-cache, must-revalidate`, so the
browser does ask again on every load — and is handed the same stale bytes. The
staleness is on the server, not in the browser cache, which is why
Cmd+Shift+R does not fix it and why restarting sometimes does not either:
Turbopack reuses what is already in `.next`.

Touching the source file can shake it loose, because that forces a recompile
of that file. `dev:fresh` is the reliable version of the same idea.

## What it is not

Before reaching for this, rule out the two things that look identical:

- **The API is not running.** The page renders but nothing loads. Check
  `http://localhost:3000/api/health`.
- **You are looking at a different account than you think.** Roles land on
  different dashboards and see different menus.
