---
goal: Full Implementation Plan for Markova — Standalone Self-Hosted Edition
version: 2.0
date_created: 2026-03-13
last_updated: 2026-03-13
status: 'Planned'
tags: feature, architecture, full-stack, standalone, education, flutter, nextjs, nodejs, postgresql
---

# Markova — Implementation Plan v2.0 (Standalone Edition)

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

**Generated**: March 13, 2026
**Estimated Complexity**: High (4–8 months for solo developer)
**Reference Document**: Markova-PRD-v2.0.docx

**KEY CHANGE FROM v1**: Markova is now a **standalone, self-hosted product** — NOT a SaaS platform. Each school buys it once, installs it on their own server, and runs it independently. This removes all multi-tenant complexity, subscription billing, super-admin panels, and cross-school features.

This plan is organized into **10 Sprints across 3 Phases** with atomic, Claude Code-ready tasks.

---

## 🤖 CLAUDE CODE INSTRUCTIONS — READ FIRST

### How to Execute This Plan

1. **Follow this plan exactly** — sprint by sprint, task by task, in exact order. Do not skip, reorder, or add features not listed.
2. **Work one task at a time** — complete Task 1.1 fully before moving to Task 1.2, and so on.
3. **After each task**, report:
   - ✅ What was completed
   - 📁 Key files created/modified
   - 🧪 How to test/validate it
   - ➡️ What the next task is
   Then **STOP and wait** for the user to say "continue" or give feedback before proceeding.

### Git Commit Rules (CRITICAL)

**Commit after EVERY completed task.** Use `git add . && git commit -m "..."` — **NEVER push. NEVER run git push.**

Commit message format:
```
feat(scope): short description

- Detail 1
- Detail 2
```

Examples of GOOD commits:
```
feat(setup): initialize monorepo with docker-compose for postgres and redis
feat(db): implement complete prisma schema with 25+ models and all relations
feat(seed): add comprehensive seed data for development
feat(auth): implement JWT login with OTP verification for admin/teacher/parent
feat(auth): add password reset via email and SMS OTP
feat(auth): add forced password change on first login
feat(users): add user CRUD with role-based filtering
feat(users): add bulk CSV import with template download and validation
feat(web): initialize next.js with tailwind and base UI components
feat(web): build login page with OTP flow
feat(web): build dashboard layout with role-based sidebar
feat(marks): add marks entry API with validation and auto-save
feat(marks): implement auto-calculation of averages, grades, and rankings
feat(attendance): add QR scan attendance with time window validation
feat(discipline): add points-based incident recording with SMS to parent
feat(library): add book catalog CRUD with barcode check-in/out
fix(attendance): correct duplicate scan prevention logic
refactor(common): extract pagination logic into shared DTO
```

**NEVER** use vague commit messages like "update", "fix", "changes", "wip", "misc".

Also commit at sub-feature checkpoints within larger tasks — for example, if Task 2.1 (Auth Module) is large, commit after:
1. Basic login endpoint works → commit
2. OTP verification added → commit
3. JWT refresh tokens added → commit
4. Session management added → commit
5. Account lockout added → commit

### Tech Stack (non-negotiable)

- **Backend**: Node.js + NestJS + TypeScript + Prisma ORM
- **Database**: PostgreSQL 15+ with Redis for cache/queues
- **Web Dashboard**: Next.js 14+ (App Router) + TypeScript + Tailwind CSS
- **Mobile** (Phase 2): Flutter
- **API**: REST only — no GraphQL
- **File storage**: Local filesystem (`./uploads/` directory)
- **PDF generation**: Puppeteer
- **QR codes**: `qrcode` npm package
- **Job queue**: BullMQ with Redis

### Architecture Rules

- **Single-tenant** — one database per school. NO `school_id` column on any table.
- **No SaaS features** — no subscriptions, no billing, no super-admin, no multi-school.
- **Modular NestJS** — each feature is its own module under `src/modules/`.
- **Prisma** for all DB operations — no raw SQL unless absolutely necessary.
- **class-validator** for DTO validation on all endpoints.
- **Swagger/OpenAPI** auto-generated at `/api/docs`.
- **Audit logging** via NestJS interceptor on all write operations.
- **Global exception filter** with friendly error messages.

### Web Dashboard Design Rules

- **Simple, minimal, clean with lots of white space** — #1 design principle.
- **Blue theme** — primary: `#1B4F72`, secondary: `#2E86C1`, accent: `#D6EAF8`.
- **Light mode only** — no dark mode.
- **Left sidebar + top bar** layout. Desktop only — not mobile responsive.
- **English only** — no i18n.
- **Tailwind CSS** utility classes only.
- **lucide-react** for all icons.
- **Recharts** for charts/graphs.
- **sonner** for toast notifications.
- **react-hook-form + zod** for all forms.
- **@tanstack/react-query** for all API data fetching.
- **zustand** for global state (auth, user info).

### Starting the Project

Begin with **Sprint 1, Task 1.1: Initialize Project Structure**. Read the full task description below, execute it, commit, report back, and wait.

---

## 1. Requirements & Constraints

- **REQ-001**: Single-tenant architecture — one database per school installation, no `school_id` scoping
- **REQ-002**: REST API — all frontend clients communicate via REST endpoints
- **REQ-003**: PostgreSQL database — relational, properly indexed
- **REQ-004**: Node.js + NestJS backend — TypeScript, modular
- **REQ-005**: Next.js web dashboard — left sidebar + top bar, desktop only
- **REQ-006**: Flutter mobile app — single app, role-based views, bottom tabs
- **REQ-007**: Self-hosted — school deploys on their own Linux server
- **REQ-008**: 4 primary roles + 4 special roles (DOS, HOD, Class Teacher, Librarian)
- **REQ-009**: Offline mark entry with conflict resolution
- **REQ-010**: QR-based attendance with static student QR on ID cards
- **REQ-011**: School configures their own SMS and email providers
- **REQ-012**: No integrated payment gateway — fees recorded manually
- **SEC-001**: Encrypted at rest and in transit
- **SEC-002**: OTP auth for admin/teacher/parent; email+password for students
- **SEC-003**: Role-based access control
- **SEC-004**: Full audit trail
- **SEC-005**: Max 3 device sessions
- **SEC-006**: Account lockout after 5 failed attempts
- **CON-001**: Solo developer — atomic, testable tasks
- **CON-002**: Web dashboard first, Flutter app second
- **CON-003**: AI features deferred to Phase 3
- **CON-004**: English only, light mode only

---

## 2. Prerequisites

### Development Environment
- Node.js v20+, npm/yarn
- PostgreSQL 15+
- Redis
- Git + GitHub
- Flutter SDK 3.x+
- Docker (for local dev)
- VS Code or preferred IDE

### Key Packages
- `@nestjs/cli`, `prisma`, `next` (via create-next-app)

---

## 3. Implementation Steps

---

# PHASE 1: BACKEND + WEB DASHBOARD (MVP)

> Build the complete backend and web dashboard. This is the product you pilot with 1 school.

---

## Sprint 1: Project Setup & Database Schema

**Goal**: Initialize projects, design single-tenant database, set up dev environment.
**Validation**: Migrations run, seed data loads, projects build.

---

### Task 1.1: Initialize Project Structure

- **Location**: `/markova/`
- **Description**: Create root project with backend, web, and mobile sub-projects
- **Dependencies**: None
- **Steps**:
  1. Create root `/markova/` directory
  2. Init git with `.gitignore`
  3. Create structure:
     ```
     markova/
     ├── backend/          # NestJS API
     ├── web/              # Next.js dashboard
     ├── mobile/           # Flutter (empty for Phase 2)
     ├── docs/             # Deployment docs, user guides
     │   └── deployment-guide.md
     ├── docker-compose.yml  # PostgreSQL + Redis for dev
     ├── .env.example
     └── README.md
     ```
  4. Create `docker-compose.yml`:
     - PostgreSQL 15 (port 5432)
     - Redis 7 (port 6379)
  5. Create `.env.example`:
     ```
     DATABASE_URL=postgresql://markova:password@localhost:5432/markova
     REDIS_URL=redis://localhost:6379
     JWT_SECRET=your-secret-key
     JWT_REFRESH_SECRET=your-refresh-secret
     SMS_PROVIDER=africas_talking  # or twilio
     SMS_API_KEY=
     SMS_USERNAME=
     EMAIL_HOST=
     EMAIL_PORT=
     EMAIL_USER=
     EMAIL_PASS=
     UPLOAD_DIR=./uploads
     SCHOOL_NAME=
     ```
- **Acceptance Criteria**: `docker-compose up -d` starts both containers
- **Validation**: `docker ps` shows PostgreSQL and Redis running

---

### Task 1.2: Initialize NestJS Backend

- **Location**: `/markova/backend/`
- **Description**: Scaffold NestJS with Prisma, JWT, validation, Swagger
- **Dependencies**: Task 1.1
- **Steps**:
  1. `nest new backend --strict --package-manager npm`
  2. Install deps:
     - `prisma @prisma/client`
     - `@nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt`
     - `bcryptjs class-validator class-transformer`
     - `@nestjs/swagger swagger-ui-express`
     - `@nestjs/bull bull ioredis` (job queues)
     - `helmet compression uuid multer`
     - `qrcode` (for ID card generation)
     - `puppeteer` (for PDF generation)
  3. Init Prisma: `npx prisma init`
  4. Create module structure:
     ```
     backend/src/
     ├── app.module.ts
     ├── main.ts
     ├── common/
     │   ├── decorators/     # @CurrentUser, @Roles
     │   ├── guards/         # AuthGuard, RolesGuard
     │   ├── interceptors/   # AuditLogInterceptor
     │   ├── filters/        # HttpExceptionFilter
     │   ├── dto/            # Pagination, response wrapper
     │   └── utils/
     ├── config/
     ├── prisma/             # PrismaService
     └── modules/            # Feature modules
     ```
  5. Create PrismaService
  6. Configure global pipes, filters, CORS, Swagger at `/api/docs`
- **Acceptance Criteria**: `npm run start:dev` starts; `GET /api/docs` shows Swagger
- **Validation**: `curl http://localhost:3000/api/docs` returns HTML

---

### Task 1.3: Design Single-Tenant Database Schema

- **Location**: `/markova/backend/prisma/schema.prisma`
- **Description**: Complete Prisma schema — NO `school_id` on any table (single-tenant)
- **Dependencies**: Task 1.2

**CRITICAL DIFFERENCE FROM v1**: No `school_id` column anywhere. This is a single-school database.

**Schema:**

```
ENUMS:
- Role: ADMIN, TEACHER, STUDENT, PARENT, LIBRARIAN
- SpecialRole: DOS, HOD, CLASS_TEACHER
- EmploymentStatus: FULL_TIME, PART_TIME, CONTRACT
- StudentStatus: ACTIVE, INACTIVE, GRADUATED, TRANSFERRED
- Gender: MALE, FEMALE
- AttendanceStatus: PRESENT, ABSENT, LATE
- AbsenceReason: SICK, FAMILY, PERMISSION, UNEXCUSED
- LoanStatus: ACTIVE, RETURNED, OVERDUE, LOST, DAMAGED
- DisciplineAction: VERBAL_WARNING, WRITTEN_WARNING, DETENTION, SUSPENSION, EXPULSION
- AppealStatus: PENDING, APPROVED, REJECTED
- FeeStatus: PAID, UNPAID, PARTIAL
- PaymentMethod: MOMO, AIRTEL, CARD, CASH, BANK
- ConversationType: ONE_ON_ONE, GROUP, BROADCAST
- MessageContentType: TEXT, FILE, VOICE
- NotificationType: SMS, EMAIL, PUSH

CORE:
- SchoolConfig (id, key, value)  # school_name, logo_url, motto, stamp_url, signature_url, primary_color, starting_discipline_points, borrowing_limit, borrowing_duration_days, pass_threshold, etc.
- User (id, email, phone, password_hash, role, first_name, last_name, photo_url, is_active, force_password_change, last_login_at, created_at, updated_at)
- UserSession (id, user_id, device_info, ip_address, token, is_active, created_at, expires_at)
- AuditLog (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address, created_at)

ACADEMIC:
- AcademicYear (id, name, start_date, end_date, is_current)
- Term (id, academic_year_id, name, start_date, end_date, is_current, is_closed)
- ClassLevel (id, name, order)
- ClassSection (id, class_level_id, name)
- Subject (id, name, category, max_marks, is_active)
- AssessmentType (id, name)
- Timetable (id, class_section_id, subject_id, teacher_id, day_of_week, start_time, end_time, room)

STUDENTS:
- Student (id, user_id, student_id_number, class_section_id, date_of_birth, gender, blood_type, allergies, medical_conditions, previous_school, enrollment_date, status, discipline_points, created_at)
- ParentStudent (id, parent_user_id, student_id, relationship)

TEACHERS:
- Teacher (id, user_id, employment_status, is_active)
- TeacherRole (id, teacher_id, role, class_section_id?, department?)
- TeacherSubjectClass (id, teacher_id, subject_id, class_section_id, academic_year_id)

MARKS:
- Mark (id, student_id, subject_id, class_section_id, term_id, assessment_type_id, score, max_score, teacher_id, created_at, updated_at)
- TermResult (id, student_id, class_section_id, term_id, total_marks, average, letter_grade, rank, teacher_comment, headmaster_comment, is_published)
- YearResult (id, student_id, class_section_id, academic_year_id, term1_avg, term2_avg, term3_avg, yearly_average, letter_grade, rank, discipline_average, is_promoted)

ATTENDANCE:
- Attendance (id, student_id, class_section_id, date, type, subject_id?, status, reason_category?, scanned_at, marked_by_user_id)
- TeacherAttendance (id, teacher_id, date, status, scanned_at)

DISCIPLINE:
- DisciplineIncident (id, student_id, term_id, recorded_by_user_id, date, time, location, description, points_deducted, action_taken, parent_acknowledged, parent_acknowledged_at, created_at)
- DisciplineAppeal (id, incident_id, submitted_by_user_id, statement, evidence_urls, status, reviewed_by_user_id, review_notes, created_at)

LIBRARY:
- Book (id, title, author, isbn, category, quantity, available_count, barcode, replacement_cost, is_active)
- BookLoan (id, book_id, borrower_user_id, checked_out_at, due_date, returned_at, status, replacement_cost)

HOMEWORK:
- Homework (id, teacher_id, subject_id, class_section_id, term_id, title, description, due_date, max_marks, late_deduction_per_day, created_at)
- HomeworkSubmission (id, homework_id, student_id, file_url, submitted_at, is_late, marks, graded_at, graded_by_user_id)

MESSAGING:
- Conversation (id, type, name?, created_by_user_id, created_at)
- ConversationParticipant (id, conversation_id, user_id, joined_at, is_admin)
- Message (id, conversation_id, sender_user_id, content, content_type, file_url?, created_at)
- MessageRead (id, message_id, user_id, read_at)

FEES:
- FeeRecord (id, student_id, academic_year_id, term_id, amount_due, amount_paid, balance, status, payment_method, payment_date, receipt_number, notes, created_at)

NOTIFICATIONS:
- Notification (id, user_id, title, message, type, is_read, related_entity_type, related_entity_id, created_at)

SUPPORT:
- SupportTicket (id, user_id, title, description, screenshot_url, category, status, created_at, resolved_at)
- FaqArticle (id, title, content, category, display_order, is_published)
```

- **Steps**:
  1. Write complete Prisma schema with all models, relations, enums, indexes
  2. Add `@@index` on frequently queried columns
  3. Add unique constraints (e.g., `[student_id, subject_id, term_id, assessment_type_id]` on Mark)
  4. Run `npx prisma migrate dev --name init`
- **Acceptance Criteria**: All tables created; `npx prisma studio` shows schema
- **Validation**: `npx prisma migrate dev` succeeds; studio accessible

---

### Task 1.4: Create Seed Data

- **Location**: `/markova/backend/prisma/seed.ts`
- **Dependencies**: Task 1.3
- **Steps**:
  1. Seed script generating:
     - SchoolConfig entries (name, logo, starting points, etc.)
     - 1 admin, 5 teachers (with DOS/HOD/ClassTeacher), 30 students, 15 parents
     - Academic year + 3 terms
     - 8 subjects, 3 class sections
     - Sample marks, attendance, discipline
     - 20 library books
     - Sample messages
  2. All passwords hashed, `force_password_change: true`
- **Acceptance Criteria**: `npx prisma db seed` populates all tables
- **Validation**: Prisma Studio shows data

---

### Task 1.5: Initialize Next.js Web Dashboard

- **Location**: `/markova/web/`
- **Dependencies**: Task 1.1
- **Steps**:
  1. `npx create-next-app@latest web --typescript --tailwind --app --src-dir`
  2. Install: `axios zustand react-hook-form zod @hookform/resolvers lucide-react clsx tailwind-merge @tanstack/react-query date-fns sonner recharts`
  3. Create folder structure (app/(auth), app/(dashboard)/admin|teacher|student|parent|librarian, components/ui, lib/, hooks/, stores/, types/)
  4. Build base UI components: Button, Input, Card, Modal, Table, Badge, Avatar, Spinner
  5. Configure Tailwind blue theme
  6. Set up Axios instance with auth interceptors
  7. Create Zustand auth store
- **Acceptance Criteria**: `npm run dev` starts on port 3001 with Markova styling
- **Validation**: Visit localhost:3001

---

### Task 1.6: Set Up CI/CD

- **Location**: `/markova/.github/workflows/ci.yml`
- **Dependencies**: Tasks 1.2, 1.5
- **Steps**: GitHub Actions for lint, type-check, test, build on push to main/develop

---

## Sprint 2: Authentication & User Management

**Goal**: Complete auth system + user CRUD + bulk import.
**Validation**: Login works for all roles, bulk import creates accounts.

### Task 2.1: Auth Module (Backend)
- Login with OTP (admin/teacher/parent) and without (student)
- JWT access + refresh tokens
- Password change (forced on first login), reset via email/SMS
- Session tracking (max 3 devices), account lockout after 5 failures
- `@CurrentUser()` decorator, `@Roles()` guard

### Task 2.2: User Management Module (Backend)
- CRUD for all user roles (admin only)
- Bulk import via CSV/Excel with template download
- Auto-generate student ID: `{year}-{sequence}`
- Parent-student linking (one parent, multiple children)
- Profile photo upload (local filesystem `./uploads/`)
- Soft delete

### Task 2.3: Login Page (Web)
- Email/phone + password → OTP (if not student) → dashboard redirect
- Force password change screen on first login
- Minimal design, blue theme

### Task 2.4: Dashboard Layout (Web)
- Left sidebar (role-based menu items) + top bar (user info, notifications, search, logout)
- Auth check → redirect if no token

### Task 2.5: User Management Pages (Web — Admin)
- User list with filters, add user form, bulk import, user detail/edit

---

## Sprint 3: School Setup & Academic Structure

**Goal**: Onboarding wizard + academic year/term/class/subject management.
**Validation**: Fresh install → wizard → fully configured school.

### Task 3.1: School Config Module (Backend)
- CRUD for SchoolConfig key-value pairs
- File upload for logo, stamp, signature (local `./uploads/`)
- Onboarding status tracking

### Task 3.2: Academic Structure Module (Backend)
- CRUD: academic years, terms, class levels, sections, subjects, assessment types
- Teacher-subject-class assignments (manual + CSV)
- Term closing/reopening (locks marks)
- Student promotion (auto based on threshold)

### Task 3.3: Onboarding Wizard (Web)
- 10-step wizard: school info → branding → academic year → terms → classes → subjects → import teachers → import students → assign teachers → review
- Progress saved, resumable, tooltips on first visit

### Task 3.4: School Settings Pages (Web)
- General, branding, academic, classes, subjects, system config, data export

---

## Sprint 4: Marks Management

**Goal**: Teacher enters marks → auto-calculate averages/grades/ranks → all roles view.
**Validation**: Full marks flow from entry to student viewing.

### Task 4.1: Marks Module (Backend)
- Mark CRUD with validation (reject out of range)
- Auto-calculate: term average, letter grade (A=80-100...), class rank
- Full year: avg of 3 terms + discipline average
- Completion tracker (X/30 graded)
- Marks locked when term is closed

### Task 4.2: Marks Entry Page (Web — Teacher)
- Select class → subject → assessment → enter marks one by one
- Auto-save, validation, progress bar
- Offline queue with sync indicator

### Task 4.3: Marks Viewing Pages (Web — Student, Parent, Admin)
- Student: term selector, marks table, trend chart, class avg comparison
- Parent: child dropdown, same view
- Admin: class overview, submission progress, CSV/PDF export

---

## Sprint 5: Attendance System

**Goal**: QR scanning + manual fallback + real-time dashboard + parent SMS.
**Validation**: Scan QR → attendance recorded → parent SMS for absences.

### Task 5.1: Attendance Module (Backend)
- QR scan processing (validate student, time window, prevent duplicates)
- Manual fallback endpoint
- Daily + per-subject attendance
- Absence → SMS to parent
- Chronic absenteeism detection (configurable threshold)
- Teacher attendance via QR
- Real-time dashboard data

### Task 5.2: Attendance Pages (Web)
- Teacher: scan button (webcam), manual toggle list
- Admin: real-time dashboard, chronically absent list
- Student/Parent: attendance summary + calendar view

---

## Sprint 6: Discipline Management

**Goal**: Points system + incidents + parent SMS + appeals.
**Validation**: DOS records incident → points deducted → parent SMS → appeal flow.

### Task 6.1: Discipline Module (Backend)
- Incident CRUD (DOS only), points deduction, SMS to parent
- Appeal with evidence upload
- Term reset (preserve history, calculate yearly average)
- Discipline reports per student/class

### Task 6.2: Discipline Pages (Web)
- DOS: record incident, view all incidents, student search
- Admin: stats, pending appeals, appeal review
- Student: points balance, incident list, appeal button
- Parent: acknowledge (digital signature), appeal with evidence

---

## Sprint 7: Library Management

**Goal**: Book catalog + barcode check-in/out + reminders + analytics.
**Validation**: Add books → scan checkout → reminder → return → analytics.

### Task 7.1: Library Module (Backend)
- Book CRUD + bulk import, search with filters
- Check-out (scan student QR + book barcode), validate limits/overdue blocks
- Return (scan book → auto-find loan)
- Lost/damaged tracking with replacement cost
- Reminder scheduling (2 days before due)
- Analytics (totals, popular, overdue rate)

### Task 7.2: Library Pages (Web)
- Librarian: dashboard, catalog CRUD, checkout/return flow, bulk import
- Student: my loans, borrowing history, catalog search

---

## Sprint 8: Homework, Messaging & Notifications

**Goal**: Homework submission, messaging system, multi-channel notifications.
**Validation**: Full homework flow, messaging between roles, SMS/email/push delivery.

### Task 8.1: Homework Module (Backend)
- CRUD, PDF upload to `./uploads/`, grading with numeric mark
- Late detection + auto-deduction
- Push notification on grade

### Task 8.2: Messaging Module (Backend)
- One-on-one, group, broadcast conversations
- Text + file + voice note support
- Admin-configured permissions (who can message whom)
- Admin moderation (can see all messages)
- Unread count, read receipts

### Task 8.3: Notification Service (Backend)
- Centralized service: sendSMS, sendEmail, sendPush
- SMS: configurable provider (Africa's Talking / Twilio) via env vars
- Email: configurable SMTP via env vars
- Push: via Firebase (for mobile, Phase 2)
- Queue with Bull/Redis, retry on failure
- Store all notifications in DB for in-app list
- All trigger integrations: marks, discipline, attendance, library, homework, announcements

### Task 8.4: Homework Pages (Web)
- Teacher: create assignment, view submissions, grade
- Student: assignments list, PDF upload, view grades

### Task 8.5: Messaging Pages (Web)
- Conversation list, chat view (text/file/voice), new conversation, broadcast creation

---

## Sprint 9: Report Cards, Fees, Documents & Analytics

**Goal**: Report card generation, fee tracking, document templates, analytics dashboards.
**Validation**: Generate branded report cards, track fees, view analytics.

### Task 9.1: Report Card Generation (Backend)
- Generate term report PDFs (Puppeteer): school branding, marks, rank, comments, stamp, signature
- Full Year report: 3 terms side-by-side + averages + discipline average
- Admin: generate, preview, publish flow
- Term closing workflow: close → lock → review → publish
- SMS notification on publish
- Parent digital acknowledgment

### Task 9.2: Fee Module (Backend)
- Record payments manually (amount, method, date, receipt#)
- Auto-calculate balance
- Generate receipt PDF with school branding
- Fee summary for admin

### Task 9.3: Document Generation (Backend)
- Transfer letter, enrollment confirmation, discipline report, transcript
- Student ID cards with QR code (using `qrcode` package)
- Bulk ID card generation
- All documents with school branding

### Task 9.4: Analytics Module (Backend)
- Admin: performance trends, class comparisons, discipline stats, library usage, attendance
- Teacher: class analytics, underperforming student suggestions
- Student: performance vs class average
- Parent: child's trend graphs

### Task 9.5: Build All Remaining Pages (Web)
- Report card pages (admin generate, parent/student view/download)
- Fee pages (admin record, parent view)
- Document pages (admin generate from student profile)
- Analytics dashboards for all roles (using Recharts)
- ID card generation page

---

## Sprint 10: Help System, Deployment Docs & Polish

**Goal**: In-app help, support tickets, deployment documentation, final polish.
**Validation**: Help center works, deployment guide complete, pilot-ready.

### Task 10.1: Help & Support System (Backend + Web)
- FAQ articles CRUD (admin manages)
- Searchable help center page
- Support ticket submission with screenshot
- Ticket status tracking
- First-visit tooltip system (track which tooltips user has seen)

### Task 10.2: Deployment Documentation
- **Location**: `/markova/docs/deployment-guide.md`
- Complete step-by-step guide:
  1. Server requirements (Ubuntu 22+, 4GB RAM, 50GB disk)
  2. Install Node.js 20+, PostgreSQL 15+, Redis 7+
  3. Clone/download Markova
  4. Configure `.env` (database, SMS, email, school name)
  5. Run database migrations
  6. Run seed (creates admin account)
  7. Build and start backend
  8. Build and start web dashboard
  9. Configure reverse proxy (Nginx)
  10. SSL setup (Let's Encrypt)
  11. Systemd service for auto-start
  12. Backup setup (pg_dump cron job)
  13. Update instructions (pull new version, run migrations)
- Also create: troubleshooting guide, FAQ for IT teams

### Task 10.3: Final Polish & Testing
- End-to-end testing of all critical flows
- UI consistency review
- Error handling review (friendly errors, local save on network failure)
- Performance testing (simulate 500 students)
- Security audit (check all endpoints require auth, RBAC enforced)

---

# PHASE 2: FLUTTER MOBILE APP

> Build the Flutter app with all Phase 1 features + QR scanning + offline support.

---

## Sprint 11: Flutter App

### Task 11.1: Project Setup
- Init Flutter, configure themes (blue, minimal, light only)
- Dio for API, Riverpod for state, flutter_secure_storage for tokens
- Firebase setup for push notifications

### Task 11.2: Auth Screens
- Login, OTP, password change, password reset

### Task 11.3: Role-Based Navigation
- Bottom tabs per role, global search

### Task 11.4: All Module Screens
- Dashboards, marks (entry + viewing), attendance (QR scanner), discipline, library, homework, messaging, notifications, report cards, fees, settings, help

### Task 11.5: Offline Support
- SQLite/Hive for offline marks storage
- Sync queue with conflict resolution UI
- Connectivity monitoring

### Task 11.6: Push Notifications
- Firebase Cloud Messaging integration
- Handle notification taps (deep link to relevant screen)

---

# PHASE 3: AI + MARKETING

> Add AI features and build marketing presence.

---

## Sprint 12: AI Insights

### Task 12.1: At-Risk Detection
- Multi-factor analysis (marks + attendance + discipline)
- Alert class teacher + admin + parent
- Suggest specific interventions
- Track follow-up

---

## Sprint 13: Marketing & Sales

### Task 13.1: Marketing Website (markova.rw)
- Landing page, features, pricing (one-time), about, contact/demo form
- Demo video embedded

### Task 13.2: App Store Publication
- Google Play + Apple App Store listings

---

## 4. Alternatives Considered

- **ALT-001**: SaaS multi-tenant model — rejected; changed to standalone per client preference
- **ALT-002**: Docker-based deployment — rejected; detailed documentation chosen for school IT teams
- **ALT-003**: License key system — rejected; fully independent installations preferred
- **ALT-004**: Integrated payment gateways — rejected; fees recorded manually in standalone model

## 5. Dependencies

- **DEP-001**: Node.js v20+
- **DEP-002**: PostgreSQL 15+
- **DEP-003**: Redis 7+
- **DEP-004**: Flutter SDK 3.x+
- **DEP-005**: Firebase project (push notifications)
- **DEP-006**: SMS provider account (school provides their own)
- **DEP-007**: Email/SMTP service (school provides their own)
- **DEP-008**: GitHub for source control

## 6. Key Files

- **FILE-001**: `/markova/backend/prisma/schema.prisma` — Complete database schema
- **FILE-002**: `/markova/backend/src/modules/` — All backend feature modules
- **FILE-003**: `/markova/web/src/app/` — All web dashboard pages
- **FILE-004**: `/markova/mobile/lib/` — Flutter app source
- **FILE-005**: `/markova/docs/deployment-guide.md` — Installation documentation
- **FILE-006**: `/markova/.env.example` — Environment configuration template
- **FILE-007**: `/markova/docker-compose.yml` — Local development environment

## 7. Testing Strategy

- **TEST-001**: Unit tests for all service methods (Jest)
- **TEST-002**: Integration tests for all API endpoints (Supertest)
- **TEST-003**: E2E tests for critical flows (Playwright)
- **TEST-004**: Flutter widget tests + integration tests
- **TEST-005**: Manual pilot testing with 1 real school
- **TEST-006**: Performance test with 500 simulated students

## 8. Risks & Assumptions

- **RISK-001**: Solo developer scope — stick to MVP phasing
- **RISK-002**: School IT teams may struggle with deployment — comprehensive docs critical
- **RISK-003**: Different schools have different server capabilities — minimum requirements must be clear
- **RISK-004**: Offline sync conflicts could cause data issues — conflict UI is essential
- **RISK-005**: PDF report generation may be slow — use background job queue
- **ASSUMPTION-001**: Schools have a Linux server or can provision one
- **ASSUMPTION-002**: Schools have IT staff capable of following deployment documentation
- **ASSUMPTION-003**: Schools will configure their own SMS/email providers
- **ASSUMPTION-004**: Pilot school available for real-world testing

## 9. What Was Removed from v1 (SaaS → Standalone)

These features from v1 are **no longer needed**:

| Removed Feature | Reason |
|----------------|--------|
| `school_id` on every table | Single-tenant, one DB per school |
| Multi-tenant data isolation | Not applicable |
| Super admin panel | No central management |
| Subscription/billing system | One-time purchase |
| Invoice generation (for Markova) | No recurring billing |
| Payment gateway integration | Fees recorded manually |
| Cross-school student transfers | Schools are independent |
| School verification/approval | No onboarding gate |
| Platform-wide analytics | Each school is standalone |
| SMS credit billing | School manages own provider |
| 14-day grace period | No subscriptions |
| School suspension | No central control |
| Impersonation / support access | No remote access |
| Platform announcements | No central broadcast |

**Estimated complexity reduction: ~25-30%** from v1. Fewer tables, simpler architecture, no billing logic.

## 10. Related Documents

- [Markova PRD v2.0 — Standalone Edition](./Markova-PRD-v2.0.docx)
- [NestJS Docs](https://docs.nestjs.com/)
- [Prisma Docs](https://www.prisma.io/docs)
- [Next.js Docs](https://nextjs.org/docs)
- [Flutter Docs](https://docs.flutter.dev/)
