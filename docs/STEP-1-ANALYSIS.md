# Step 1: The full check of Markova

_Done on 10 October 2026. Nothing was changed or deleted. This is a report only._

How it was done: every part of the code was read, every test and check was run
on this machine, and the internet was searched for Rwandan schools, the law,
competitors, prices and good design practice. Sources are at the bottom.

---

## 1. The short version

**Markova is strong underneath, but it is not ready, and its mobile app looks
plain.**

The ten most important things found:

| # | What | How bad |
| --- | --- | --- |
| 1 | CI has not really run for a long time. The last 100 runs never started because of a GitHub billing problem. Nothing was checking the code. | Very bad |
| 2 | The web app has a **critical** security hole (Next.js remote code execution). The backend has 1 critical and 14 high ones. | Very bad |
| 3 | Every password reset token is written into the server log in plain text, in production too. Anyone who reads the logs can take over any account. | Very bad |
| 4 | Email and SMS "retry 6 times" does not work. The send functions hide their own errors, so the queue thinks every message was sent. | Bad |
| 5 | On the mobile app, the **head teacher** and the **bursar** get the **parent's** screens. | Bad |
| 6 | There is no Kinyarwanda. 54% of Rwandan adults can read **only** Kinyarwanda. Most parents cannot fully use the app. | Bad |
| 7 | Parents cannot pay fees by MoMo or Airtel Money. Urubuto, the main competitor, does this (and USSD `*775#`). | Bad for sales |
| 8 | Markova can hold only one school. No table knows which school a row belongs to. | Expected, step 3 fixes it |
| 9 | The mobile app is one build per school (the server address is baked in). | Expected, step 3 fixes it |
| 10 | The mobile design is a list of grey rows on every screen. It works, but it has no life. | Step 8 fixes it |

---

## 2. The numbers I checked myself

| Check | Backend | Web | Mobile |
| --- | --- | --- | --- |
| Type check | Pass | Pass | Pass |
| Tests | 3,188 pass | 4,889 pass | 2,384 pass (one is flaky when the machine is busy) |
| Coverage rule | Pass | **Fails** (96% against a 98% rule) | Pass (99%) |
| Lint | 0 errors, 5,023 warnings | **2 errors**, 853 warnings | Not set up |
| `any` (unsafe types) | 192 | 408 | 136 |
| Security advisories | 1 critical, 14 high | 1 critical, 4 high | 1 critical, 29 high (mostly build tools) |
| Clean install (`npm ci`) | Works | Works | **Fails** (lock file out of date) |

So even if CI ran today, the web job and the mobile job would both fail.

Design checks pass: tokens are in sync and all 78 colour pairs meet WCAG AA.

---

## 3. The mobile app: what is wrong with the design

I read every screen. The problems, simply:

1. **Every screen looks the same.** A sentence at the top, three numbers, then
   a list of grey rows. The `Row` component is used 219 times; a card is used 9
   times. It feels like a phone's Settings menu, not an app about children.
2. **No pictures, almost no charts.** A parent never sees their child's face
   large, or a line going up or down. Only two screens draw a chart.
3. **The parent's home is too thin.** It only checks discipline points. It does
   not show: was my child at school today, the latest marks, fees owed,
   homework due, what is coming this week.
4. **Hidden features.** Each role gets 4 tabs and a "More" drawer. 13 screens
   are hidden with a workaround, and many useful things live behind "More".
5. **Two roles are broken.** The head teacher and the bursar fall through to
   the parent's app, which then asks for data they are not allowed to see.
6. **English only, light only.** The web has dark mode; mobile is locked to
   light (`userInterfaceStyle: 'light'`). No Kinyarwanda, no French.
7. **Offline is half done.** Only the register works without internet. Marks
   entry on mobile needs a connection (the web version works offline).
8. **Small text on cheap phones.** The design document itself admits Poppins
   is hard to read at small sizes on low-cost Android screens.
9. **Signing in is a password.** Competitors that parents like (ClassDojo) let
   a parent join from an invitation. Many Rwandan parents forget passwords. A
   phone number plus a one-time SMS code would be easier.
10. **No money in the app.** A parent can see fees but cannot pay them.

What is good and should stay: the careful colour system that keeps any
school's brand colour readable, the role-based tabs idea, haptics, motion that
respects "reduce motion", the push notifications, and the strong tests.

---

## 4. The backend: what is wrong

| Problem | Where | Why it matters |
| --- | --- | --- |
| Reset token in logs | `auth.service.ts` line 472 | Account takeover by anyone with log access |
| Retry queue never retries | `notifications.service.ts` `sendEmailToAddress` and `sendSMSToPhone` catch and hide errors | OTP codes silently lost, the exact bug the queue was built to fix |
| SMS through Twilio | `notifications.service.ts` | Costs far more in Rwanda than local providers (about 20 RWF a message) |
| When Twilio is missing, the SMS text (with codes) goes to the log | same file, line 328 | Codes in logs |
| Row level security only on 5 tables | `row_level_security` migration | Fees, health records, messages are not covered |
| Row level security "fails open" | `prisma.service.ts` | With no user context, every row is visible. With many schools this becomes dangerous |
| Every single query becomes a small transaction | `prisma.service.ts` | About 5 trips to the database instead of 1. Slower under load |
| Very large files | `reports.service.ts` 2,679 lines; six more over 1,000 | Hard to change safely |
| Single school everywhere | `SchoolConfig` is one key list; 51 unique rules assume one school | The base for step 3 |

## 5. The web dashboard: what is wrong

- 75 of 91 pages run fully in the browser. Next.js can do much of this on the
  server, which is faster on slow connections.
- The login token is kept in `localStorage`. If any script is ever injected,
  it can read it. A secure cookie is safer.
- Two chart libraries (ECharts, and Recharts for one page). One is enough.
- One file, `messages-screen.tsx`, is 1,879 lines.
- 2 lint errors from React's newer rules (`messages-screen.tsx`, `modal.tsx`).

## 6. Servers and backups today

- "3 API copies" all run on **one machine**. If that machine dies, everything
  is down. It spreads the load, but it does not keep the system up.
- Uploaded files live on that machine's disk, so a second machine cannot share them.
- Backups: one full copy of the whole database each night, kept on the same
  machine unless you set an off-site command. Not encrypted. No way to restore
  to a moment in time, and **no way to back up or restore one school**.
- `pgbouncer:latest` is not pinned to a version, so a rebuild can change it.
- Deploying is an SSH script. There is no staging server and no monitoring
  apart from Sentry.

---

## 7. What the internet says about Rwanda

**The people**
- Only 34% of households own a smartphone, and 20% of people use mobile
  internet. Data costs about $0.41 to $0.81 per GB.
  **Meaning:** the app must be light, work offline, and parents without a
  smartphone need SMS.
- 54% of adults are literate in Kinyarwanda only; 14% in Kinyarwanda and English.
  **Meaning:** Kinyarwanda is not optional for parents.

**The law (Law No. 058/2021 on personal data)**
- A school is a data controller; Markova is a data processor. Both must
  **register with NCSA**.
- Personal data must be stored **in Rwanda** unless NCSA gives a certificate.
  AWS or Azure in South Africa counts as abroad.
- Local hosting exists: AOS (the National Data Center) and TrAC. No big cloud
  provider has a region in Rwanda.
  **Meaning:** this shapes step 7 (servers) a lot.

**The school year**
- Three terms. 2026/27 started on 7 September 2026, with terms ending in
  December, April and July. National exams in June and July. Markova's term
  model already fits this.
- The government's own system, SDMS, collects school data and exam results.
  Schools must use it anyway. **An export to SDMS would save schools double work.**

**Competitors**

| Who | Strong point | What Markova can learn |
| --- | --- | --- |
| Urubuto (BK TecHouse) | Fees by MoMo, Airtel, banks and USSD `*775#`; basic plan is free | Online fee payment is the door into schools |
| Academic Bridge | Parent app, SMS, about 90 schools at its peak | Parents and SMS matter most |
| SDMS (government) | Every school must use it | Do not compete, connect to it |
| Zeraki (Kenya) | 4,000 to 5,000 schools, mobile first, teachers save time | Win teachers first, and sell through partners |

**Prices seen in the region:** about $2.50 to $5 per pupil per year, or $0.50
per pupil per month. These are vendor claims, so treat them as rough.

**Payments:** MTN MoMo has an open API (Request to Pay) with a free sandbox;
going live needs company documents (KYC). Airtel works the same way.
Aggregators (Paypack, IntouchPay) give one API for both, for a higher fee.

**Design trends 2026:** Apple's "Liquid Glass" on iOS 26 and Google's
"Material 3 Expressive" on Android. Research on users with low literacy says:
big icons, pictures, few choices per screen, little typing, and test with
real users.

---

## 8. What is not needed (a list for step 2, nothing deleted yet)

**Files and folders**

| What | Size | Note |
| --- | --- | --- |
| `screenshots/` | 17 MB, 105 files in git | Old pictures from June. Ignored, but still in git |
| `skills.zip` | 9.6 MB | A copy of your skills library. Not part of Markova |
| `me.txt` | small | Your personal profile with your phone number, inside the project folder |
| `backups/` | 57 MB | Local backup copy (not in git) |
| `backend/uploads/` | 47 MB | Test uploads (not in git) |
| `coverage/` folders | 30 MB | Test reports, made again on every run |
| `backend/dist/` | 4.6 MB | Build output |
| `.idea/`, `.vscode/`, root `node_modules/` | small | Editor files and an empty folder |
| Flutter lines in `.gitignore` | 5 lines | Markova has no Flutter now |

**Docs that are old or repeated**
- `readiness.md`, `markova-implementation-plan-v2.md` (plans Flutter),
  `mobile-app-plan.md`, `ROADMAP.md`: history, can go into an `archive/` folder.
- `deployment-guide.md` (systemd) is replaced by Docker Compose.
- `PRESENTATION.md` repeats `presentations/`.
- Two backup scripts and two backup guides: `scripts/backup-db.sh` +
  `scripts/README-backup.md` (old) and `scripts/backup.sh` + `docs/BACKUPS.md` (new).
- Both Excalidraw diagrams still say "five roles".

**Code**
- `web/src/lib/id-card.ts`: only its own test uses it.
- `mobile/src/hooks/useQueryError.ts`: only its own test uses it.
- `recharts` in web: used by one page only.
- `twilio`: replace with a local SMS provider.
- 17 open Dependabot pull requests, some 2 months old.

**Features to ask about** (I will not decide these for you)
- NFC card attendance and NFC pocket money. Useful, but needs cards and phones that read them.
- The 10-step onboarding wizard. With many schools, onboarding moves to the
  owner panel (step 5).

---

## 9. What Markova does well (keep these)

- **Clear structure.** Every backend feature has the same shape. Easy to find things.
- **Lots of tests.** About 10,400, and they pass.
- **Good security thinking.** Two layers of access control, a database user that
  cannot bypass the rules, payments that cannot be taken twice, safe uploads.
- **A real design system.** One token file for web and mobile, colours checked
  for readability, any school colour made safe automatically.
- **Report cards on a queue.** Heavy PDFs do not slow the dashboard.
- **Honest documentation.** Comments explain why, not only what.
- **Real Rwandan detail.** Boarding roles, pocket money, the Director of Studies
  split, three terms, phone-only parents.

---

## 10. What to do first (before step 2)

These are small and urgent, so they should not wait for the big steps:

1. Fix GitHub billing so CI runs again.
2. Update Next.js (critical hole) and the backend packages.
3. Stop logging reset tokens.
4. Make the email and SMS sending throw errors so retries work.
5. Fix the mobile lock file.

I have not done any of these. Say yes and I will.

---

## Sources

- [Urubuto](https://urubuto.rw/) and [KT Press on UrubutoPay](https://www.ktpress.rw/2020/11/bk-tech-house-revolutionizes-e-education-school-fees-payment/)
- [KT Press on parents following children remotely](https://www.ktpress.rw/2023/02/new-school-management-system-allows-parents-to-follow-children-remotely/)
- [UNICEF Rwanda on SDMS](https://www.unicef.org/rwanda/stories/harnessing-transformative-power-technology-educational-outcomes) and [MINEDUC on data use](https://www.mineduc.gov.rw/news-detail/government-of-rwanda-moves-to-strengthen-data-use-at-school-level-across-the-country)
- [DLA Piper: data protection in Rwanda](https://www.dlapiperdataprotection.com/index.html?c=RW&t=law) and [Hogan Lovells on the law](https://hoganlovells.com/en/publications/key-features-of-the-new-rwandan-data-protection-law)
- [Digital Policy Alert: data localisation in Law 058/2021](https://digitalpolicyalert.org/change/12074-data-localisation-requirement-in-law-no-0582021-relating-to-the-protection-of-personal-data-and-privacy) and [PwC guide](https://www.pwc.com/rw/en/assets/pdf/data-protection-in-rwand.pdf)
- [TechCabal: Rwanda internet use and cost](https://techcabal.com/2025/06/12/rwanda-internet-penetration-rate/) and [Daba Finance on ITU data](https://dabafinance.com/en/news/rwanda-digital-inclusion-connectivity-cost-barriers-itu-data-2025)
- [UNESCO on Kinyarwanda](https://en.wal.unesco.org/countries/rwanda/languages/kinyarwanda-2)
- [Data centres in Kigali](https://www.datacentermap.com/rwanda/kigali/) and [AOS](https://www.datacentermap.com/rwanda/kigali/aos/), [TrAC](https://www.datacentermap.com/rwanda/kigali/trac-kigali/), [Cloudscene](https://cloudscene.com/market/data-centers-in-rwanda/kigali)
- [MTN MoMo API Rwanda products](https://momoapi.mtn.co.rw/products) and [MoMo integration guide](https://mctaba.com/learn/rwanda/momo-api-integration-rwanda)
- [Rwanda SMS pricing guide](https://sent.dm/resources/rwanda-sms-pricing) and [Africa's Talking bulk SMS](https://africastalking.com/sms/bulksms)
- [AllAfrica: 2026/27 school calendar](https://allafrica.com/stories/202607290303.html) and [MINEDUC 2025/26 opening](https://www.mineduc.gov.rw/news-detail/ministry-of-education-marks-the-beginning-of-the-2025-2026-academic-year)
- [Academic Bridge on the App Store](https://apps.apple.com/st/app/id6740765646) and [African Leadership Magazine](https://www.africanleadershipmagazine.co.uk/rwanda-female-app-developer-improves-education-system/)
- [Zeraki](https://www.zeraki.app) and [TechCrunch on Zeraki](https://techcrunch.com/2022/12/08/zeraki-a-kenyan-edtech-providing-digital-solutions-for-school-admin-raises-1-8m/amp/)
- [School software cost in Kigali](https://kolonell.com/en/blog/private-school-management-software-cost-kigali-2026) and [Rongeka Africa pricing](https://www.softwareadvice.com.au/software/559867/Rongeka-Africa)
- [Capterra: ClassDojo reviews](https://capterra.com/p/124446/ClassDojo/reviews/) and [Jotform: parent communication apps](https://www.jotform.com/blog/apps-for-teachers-to-communicate-with-parents/)
- [Dimagi: designing for low-literate users](https://dimagi.atlassian.net/wiki/x/-jPKfw)
- [Liquid Glass vs Material 3 Expressive](https://orangeloops.com/2025/12/liquid-glass-vs-material-3-expressive-next%e2%80%91gen-ui-design-compared/)
- [Bytebase: Postgres row level security mistakes](https://www.bytebase.com/blog/postgres-row-level-security-footguns.md)
