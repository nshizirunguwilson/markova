# 🎤 Markova — Presentation Runbook

Everything you need to stand up the system and demo it, in order.

- **Project root:** `/Users/wilson/Work/markova`
- **Start order (matters):** Docker (DB) → Backend → Web → Mobile (optional)
- **Password for every demo account:** `Password123!`

---

## A. Start everything (the happy path)

Open **3 terminal tabs** and run one block per tab.

### Tab 1 — Database (Postgres + Redis)
```bash
cd /Users/wilson/Work/markova
docker compose up -d        # postgres on :5434, redis on :6380
```

### Tab 2 — Backend API (NestJS, port 3000)
```bash
cd /Users/wilson/Work/markova/backend
npm run start:dev           # API at http://localhost:3000/api
```
Wait for `Nest application successfully started`.
**Keep this tab visible during login — the OTP codes print here.**

### Tab 3 — Web app (Next.js, port 3001)
```bash
cd /Users/wilson/Work/markova/web
npm run dev                 # http://localhost:3001
```

Then open **http://localhost:3001** in the browser.

---

## B. The URLs

| What | URL |
|---|---|
| **Web app (present this)** | http://localhost:3001 |
| Login page | http://localhost:3001/login |
| Backend health check | http://localhost:3000/api/health |
| API base | http://localhost:3000/api |

---

## C. Demo logins

**Password for every account:** `Password123!`

| Role | Login with | OTP needed? |
|---|---|---|
| **Admin** | `wilsonshizirungu@gmail.com` | Yes |
| **Teacher** | `aline.uwase@markova.academy` | Yes |
| **Librarian** | `librarian@markova.academy` | Yes |
| **Parent** | `+250788100000` (phone login) | Yes |
| **Student** | `student1@markova.academy` | **No — logs straight in** |

### The OTP trick (important for the live demo)
Admin / Teacher / Parent / Librarian get a 6-digit one-time code.
It is emailed, but you don't need email:

- **The code prints in the Backend terminal (Tab 2)** as `OTP for …: 123456`.
- It also comes back in the login API response as `devOtp`.
- The code **expires in 5 minutes**.
- **Students skip OTP entirely.**

> The demo accounts above are set to **skip the forced password change**, so they land
> straight on the dashboard. Other seeded users would be prompted to change their
> password on first login.

---

## D. Mobile app (optional — only if showing it)

Open the iPhone 15 Pro simulator first, then:
```bash
cd /Users/wilson/Work/markova/mobile
npm run ios                 # or: npx expo start  then press "i"
```

- Log in as **teacher / parent / librarian / admin** — these work on mobile.
- **Students are blocked on mobile by design.** Logging in as a student shows:
  *"The mobile app is for staff and parents. Students, please use the web portal."*
  (This is an intended feature to demo, not a bug.)
- The phone and the Mac share the same backend; mobile points at your machine's API.

---

## E. Reset to clean demo data (only if needed)

The seeded data is **date-relative** (current term, recent attendance), so it looks
current automatically — you usually do **not** need to reseed. Only run this if you've
messed up the data while practising:

```bash
cd /Users/wilson/Work/markova/backend
npx prisma migrate deploy   # ensure the schema is applied
npx prisma db seed          # wipes + reseeds: 330 students, 30 teachers, 15 subjects (Rwandan names)
```
Takes ~30–60s. Re-run before the presentation if you've been clicking around a lot.
**Do not run this mid-presentation** — it wipes data.

---

## F. 10-second "is it all up?" check

```bash
docker ps --format '{{.Names}}: {{.Status}}'        # both markova-* show Up
curl -s http://localhost:3000/api/health            # {"status":"ok","db":"ok","redis":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/login   # 200
```

---

## G. Shut everything down (after the presentation)

- In **Tab 2** and **Tab 3**: press `Ctrl + C` to stop backend and web.
- Stop the database containers (data is preserved):
  ```bash
  cd /Users/wilson/Work/markova
  docker compose down         # add -v ONLY if you want to delete all data
  ```

---

## H. Common gotchas

| Symptom | Fix |
|---|---|
| "Network Error" / login spins forever | Backend (Tab 2) isn't up yet, or Docker DB is down. Check Tab 1 + health endpoint. |
| Health shows `db: error` | Run `docker compose up -d`, give Postgres ~10s. |
| Port already in use (3000 / 3001) | Kill the lingering process: `lsof -ti:3000 \| xargs kill` (or `:3001`). |
| OTP says "expired" | It lasts 5 min. Just log in again and grab the fresh code from Tab 2. |
| Data looks wrong / empty | Reseed (Section E) — but never mid-presentation. |

---

## I. Reference — ports & services

| Service | Port | Notes |
|---|---|---|
| Postgres | `5434` | Docker container `markova-postgres` |
| Redis | `6380` | Docker container `markova-redis` |
| Backend API | `3000` | NestJS, routes prefixed with `/api` |
| Web app | `3001` | Next.js |
| Mobile (Expo) | `8081` | Metro bundler |

**Default DB credentials (local dev):** user `markova`, password `password`, db `markova`.

---

## J. Suggested demo flow (optional script)

1. **Admin** — show the dashboard, students/teachers lists, settings (school name, color theme),
   onboarding, promotion, publish a report card.
2. **Teacher** — enter marks, take attendance, assign + grade homework, message a parent.
3. **Parent** — view a child's marks/attendance/report card, raise an appeal.
4. **Student** — view marks, submit homework, browse the library.
5. **Librarian** — check a book out and back in, show overdue loans.
6. **Mobile** — quick login as a teacher; show the student-block message.

---

*Tip: do a full dry run the night before — start all three tabs, log in as each role, and
confirm the OTP shows in Tab 2.*
