# Letting somebody else see Markova

Everything keeps running on your Mac. Port forwarding only carries the traffic;
nothing is hosted anywhere.

## Why forwarding port 3001 alone does not work

Markova is two servers, and the split is not where people expect it.

The web app on `:3001` does not fetch data on the visitor's behalf. It sends
them a page, and then **their browser** calls the API directly. So when you
forward only 3001, the visitor's browser is told to call
`http://localhost:3000/api` — and that is *their* localhost, not yours.

That is the error in the screenshot:

```
Cannot reach the server. Check your connection and that the API is running.

Access to fetch at 'http://localhost:3000/api/school-config/public'
from origin 'https://v0k7pbb7-3001.inc1.devtunnels.ms'
has been blocked by CORS policy
```

Three separate problems are stacked in there:

1. **`localhost:3000` is the visitor's own machine.** Nothing of yours is on it.
2. **The page is `https` and the API address is `http`.** Browsers refuse that
   mixture outright, even if the address were reachable.
3. **The API does not know that origin.** It only accepts calls from origins
   listed in `CORS_ORIGINS`, and the tunnel is not one of them.

So: forward **two** ports, and make **two** settings agree.

## The short version

```bash
# 1. Forward both ports and make both public (see below).

# 2. Point both halves at the forwarded address.
node scripts/share.mjs https://v0k7pbb7-3001.inc1.devtunnels.ms

# 3. Restart both servers.

# 4. Send them the 3001 address.
```

To go back:

```bash
node scripts/share.mjs --local
```

Then restart both servers again.

## Forwarding the ports

### VS Code dev tunnels

In the **Ports** panel:

1. Forward `3001` — the web app.
2. Forward `3000` — the API.
3. Right-click each → **Port Visibility** → **Public**.

Step 3 is the one people miss. Dev tunnels are **private** by default: the
visitor is asked to sign in to a Microsoft account they do not have, and what
they see is a login wall or a silent failure that looks like your app is broken.

The addresses you get back look like this, and the port is in the hostname:

```
https://v0k7pbb7-3001.inc1.devtunnels.ms    ← the web app, send this one
https://v0k7pbb7-3000.inc1.devtunnels.ms    ← the API, needed but not sent
```

### ngrok

Two tunnels, so two terminals:

```bash
ngrok http 3001
ngrok http 3000
```

Free ngrok gives unrelated hostnames for each, so `scripts/share.mjs` cannot
work the second out from the first. Set them by hand — see below.

### On the same wi-fi

No tunnel needed. Find your machine's address and use that:

```bash
ipconfig getifaddr en0        # e.g. 192.168.1.20
node scripts/share.mjs http://192.168.1.20:3001
```

Restart both servers, and send them `http://192.168.1.20:3001`. Everyone has
to be on the same network.

## What the script actually changes

Two lines, in two files. You can set them yourself if you would rather.

**`web/.env.local`** — where the visitor's browser will look for the API:

```
NEXT_PUBLIC_API_URL=https://v0k7pbb7-3000.inc1.devtunnels.ms/api
```

One variable covers everything: REST calls, the chat websocket, and uploaded
images. Note the `/api` on the end — without it every request 404s.

**`backend/.env`** — which origins the API will answer:

```
CORS_ORIGINS=http://localhost:3001,http://localhost:8081,https://v0k7pbb7-3001.inc1.devtunnels.ms
```

That is the **web** address, not the API one, and localhost stays in the list so
you can still use the app yourself. The same setting governs the chat
websocket, so leaving the tunnel out means messages silently never connect
while everything else works.

## Restarting is not optional

`NEXT_PUBLIC_*` is read when Next.js compiles, not when a page loads. Change it
and the running server keeps serving the old address until it restarts — which
looks exactly like the change not working.

```bash
# in the backend terminal              # in the web terminal
Ctrl-C && npm run start:dev            Ctrl-C && npm run dev
```

If the web app still points at the old address after a restart, clear the build
cache and start again:

```bash
cd web && npm run dev:fresh
```

## Checking it before you send the link

From your own machine, against the forwarded addresses:

```bash
# The API answers, and says who it will talk to.
curl -s -i https://v0k7pbb7-3000.inc1.devtunnels.ms/api/school-config/public \
  -H "Origin: https://v0k7pbb7-3001.inc1.devtunnels.ms" | head -20
```

You want a `200`, and an `access-control-allow-origin` header naming the web
tunnel. If the header is missing, `CORS_ORIGINS` has not taken effect — the API
was not restarted.

Then open the web address in a private window. A private window has none of
your tokens, so it is the closest thing to being the visitor.

## What they can do once they are in

Every seeded account uses the password `Password123!`.

| Role | Sign in with |
| --- | --- |
| Admin | `wilsonshizirungu@gmail.com` |
| Teacher | `aline.uwase@markova.edu` |
| Student | `student1@markova.edu` |
| Parent | `+250788100000` (phone only) |
| Librarian | `librarian@markova.edu` |
| Patron | `patron@markova.edu` |
| Matron | `matron@markova.edu` |
| Nurse | `nurse@markova.edu` |

## Worth knowing before you share

- **Anyone with the link is on your machine's database.** Whatever they change,
  everyone sees. Reseed afterwards if it matters — and note that reseeding logs
  everyone out.
- **The tunnel dies when the terminal does.** VS Code tunnels stop when the
  window closes; ngrok stops on Ctrl-C.
- **The address changes each session** unless you pay for a reserved one, so
  step 2 has to be repeated every time.
- **This is a development server.** It is not hardened, it is not fast, and it
  should not be left running for strangers.
