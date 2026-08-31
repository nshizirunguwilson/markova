# Running Markova at scale

5,000 accounts is not 5,000 concurrent anything. A school's traffic is peaky
and the peaks are predictable, which changes what has to be built.

| Moment | Who | Concurrent | Shape |
| --- | --- | --- | --- |
| Register, 07:30 | 43 teachers | ~40 | Short writes, bursty |
| Normal school day | Staff and students | 30 to 80 | Mixed reads |
| Marks deadline | Teachers | ~40 | Sustained writes |
| **Report cards issued** | 1,149 parents | 300 to 600 | Read heavy, PDF heavy |
| Fees notice | Parents | 200 to 400 | Read heavy |

The fourth row is the design constraint. Everything below exists for it.

## The topology

```
                       nginx
              TLS, static, flood control
                         |
        +----------------+----------------+
        |                |                |
     api-1            api-2            api-3      (stateless, no browser)
        |                |                |
        +--------+-------+-------+--------+
                 |               |
            pgbouncer        Redis          worker-1, worker-2
                 |         cache, queue,    (PDF rendering only)
            PostgreSQL     rate limits,
                           chat fan-out
```

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml \
  --profile scale up -d --build
```

## Why each piece is there

**nginx.** One door, TLS in one place, and flood control that costs nothing.
The application's own rate limits are per user and per route and cost a Redis
round trip; nginx's are per address and cost nothing, so they are the cheap
first line. The credential routes get their own bucket at ten a minute,
matching the application, so an attacker is stopped before it costs a bcrypt.

**Three API instances.** The application keeps no state in the process, so they
are interchangeable and a rolling restart drops nothing. `least_conn` rather
than round robin, because these requests are not the same size: a register
submission and a report card differ by an order of magnitude, and round robin
keeps feeding an instance that is already busy with the expensive one.

**Workers.** The same image with `WORKER=1`, which is the only thing that
registers the render processor. An API instance therefore never launches a
browser. This is the single largest capacity win in the whole document: before
it, one parent opening a report card held a server slot for the length of a
Chrome page layout.

**pgbouncer.** Three instances open three Prisma pools and Postgres allows 100
connections. Transaction pooling lets them share a much smaller set, because a
connection is held for the length of a transaction rather than a request. Note
`?pgbouncer=true` on the connection string: it tells Prisma to stop using
prepared statements, which transaction pooling cannot keep across a connection
handed to somebody else.

**Redis.** Already doing four jobs: rate limit counters, the render queue, the
branding cache, and chat fan-out.

## The one that fails silently

Socket.io keeps its rooms in the memory of the process holding them. With three
instances, Aline's browser is connected to api-1 and Jean's to api-3, and a
message Aline sends is emitted into api-1's rooms, where Jean is not.

Chat works perfectly for two people who happen to land on the same instance and
does nothing at all for two who do not. There is no error on either end.

`RedisIoAdapter` fixes it by publishing every emit through Redis. It is wired
in `main.ts` and it is best effort: a single instance works without it, so
refusing to boot because Redis was slow would turn a warning into an outage.

**`ip_hash` is deliberately not used.** It would pin a browser to one instance
and look like it solved the problem, while quietly breaking rolling restarts.

## Live and ready are different questions

| Endpoint | Question | Checks |
| --- | --- | --- |
| `/api/health/live` | Should this container be restarted? | Nothing |
| `/api/health/ready` | Should this instance get traffic? | Postgres, Redis |
| `/api/health` | What is going on? | Everything, with latencies |

`/live` deliberately checks nothing. If it answered on the database, one slow
database would restart all three instances at the same moment, turning a slow
query into an outage and losing every in-flight request with it.

`/ready` answers 503 rather than a 200 with a sad body, because a balancer
reads the status code and nothing else.

## Load testing

```bash
k6 run infra/load/report-card-evening.js
API=http://localhost/api k6 run infra/load/report-card-evening.js
```

It models the worst moment: 300 parents ramping in over 90 seconds while eight
staff keep working. The thresholds are stated in the file so k6 exits non-zero
when they are missed, and it can gate a release:

| Measure | Target |
| --- | --- |
| Parent page reads, p95 | under 1.5s |
| Staff operations, p95 | under 5s |
| Failed requests | under 1% |

Run it against the scaled stack, not a single dev server. A dev build is
unoptimised and one instance is not what is being tested.

## Tuning from the results

| Knob | Where | Start at |
| --- | --- | --- |
| Render concurrency | `RENDER_CONCURRENCY` | 2 per worker |
| Prisma pool | `connection_limit` in the URL | 10 per instance |
| pgbouncer pool | `DEFAULT_POOL_SIZE` | 25 |
| Worker count | compose | 2 |

Render concurrency is the one to be careful with. Each job in flight is a
Chrome page with its own compositor, and memory runs out before CPU does: past
a handful the box swaps and every render slows down, including the ones already
running.

## What is still not done

- **Off-site backups.** `./backups` survives a dropped table, not the building.
- **Metrics.** Request ids and error tracking are in; there is no
  Prometheus endpoint and no dashboard.
- **TLS certificates.** nginx listens on 80. A real deployment terminates TLS
  here, and the config has the place for it.
- **Autoscaling.** Three instances is a fixed number chosen for a school. It is
  the right shape and the wrong mechanism for a district.
