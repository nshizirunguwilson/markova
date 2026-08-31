# Load balancing, in plain terms

What "three servers" actually means here, how to run it, and how to see for
yourself that the traffic is being shared.

## What is running

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml \
  --profile scale up -d --build
```

Nine containers:

| Container | What it is |
| --- | --- |
| `markova-nginx` | The only door. Everything from a browser arrives here |
| `markova-api-1/2/3` | Three copies of the API. Interchangeable |
| `markova-worker-1/2` | The same image with `WORKER=1`. They render PDFs and serve nobody |
| `markova-pgbouncer` | Shares a small set of database connections between all five |
| `markova-postgres` | The database |
| `markova-redis` | Rate limits, the render queue, the cache, and chat fan-out |
| `markova-web` | The dashboard |

The browser only ever talks to nginx, on port 80. It never sees api-1, api-2 or
api-3, and it does not know how many there are.

## How a request is shared out

```
browser  ->  nginx  ->  api-1  or  api-2  or  api-3
```

nginx sends each request to whichever instance has the fewest open connections
(`least_conn`), not in strict rotation. That matters because these requests are
not the same size: submitting a register is milliseconds and generating a
report used to be seconds. Strict rotation keeps feeding an instance that is
already busy with the expensive one.

If an instance stops answering, nginx marks it failed after three attempts and
stops sending to it for fifteen seconds. The other two carry the traffic and
nobody sees an error.

## Seeing it work

**Which instance answered.** Each container has its own hostname, so ask twenty
times and count:

```bash
for i in $(seq 1 20); do
  curl -s -D- -o /dev/null http://localhost/api/health/live | grep -i "^x-request-id"
done

docker logs markova-api-1 --tail 100 | grep -c "GET /api/health/live"
docker logs markova-api-2 --tail 100 | grep -c "GET /api/health/live"
docker logs markova-api-3 --tail 100 | grep -c "GET /api/health/live"
```

Three numbers that add up to twenty is load balancing working.

**Killing one.** The clearest demonstration:

```bash
docker stop markova-api-2
for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} " http://localhost/api/health/live; done
docker start markova-api-2
```

Ten 200s with one of three instances stopped. Without a balancer that would be
a third of requests failing.

**Watching the shared work.** Queue a report card and watch a worker take it:

```bash
docker logs -f markova-worker-1
```

The API instances never log a render, because they never do one.

## Why this works at all

Three things had to be true, and two of them already were.

**The API keeps nothing in the process.** No sessions in memory, no
per-instance state. That is what makes the instances interchangeable and a
rolling restart invisible.

**Rate limits count in Redis, not memory.** Otherwise "ten login attempts a
minute" would be ten per server, thirty in total, and the limit would be a
third as strict as it says.

**Chat had to be wired across instances.** This is the one that had to be
built. Socket.io keeps its rooms in the memory of the process holding them, so
without the Redis adapter a message sent by somebody on api-1 never reaches
somebody on api-3. It fails silently: perfect between two people who happen to
land on the same instance, nothing at all between two who do not.

## What nginx does besides sharing traffic

- **TLS in one place** rather than three.
- **Flood control** at 30 requests a second per address, and 10 a minute on the
  login routes. This runs before anything reaches the API, so a script is
  refused before it costs a database lookup or a password hash.
- **Caching uploaded files**, so a class list of thirty photographs is not
  thirty trips to an API instance.
- **A request id** on every request, passed to whichever instance answers and
  logged on both sides. It is what makes one request followable across three
  containers.

## What it does not solve

If more traffic arrives than the school's internet connection can carry, it is
saturated before nginx sees any of it. That is answered upstream, by a service
like Cloudflare in front of the origin, and no configuration in this repository
changes it. See `docs/SECURITY.md`.
