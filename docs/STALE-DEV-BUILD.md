# When a change doesn't show up

The dev server sometimes serves assets built before your change, and keeps
doing it across a restart. It has happened twice: once with JavaScript, once
with CSS. Both times the code on disk was correct and the browser was being
handed something older.

It is worth knowing because a wedged build is indistinguishable from a broken
feature. You test, nothing happens, and every instinct says the change is
wrong.

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
