# Markova — Feature Outline

A high-level outline of the primary features in the Markova School Management System, grouped by role and area.

---

## 1. Authentication & Access

- Email or phone login
- OTP verification for staff and parents (email/SMS)
- Password reset by email
- Account lockout after repeated failed attempts
- Rate limiting on auth endpoints
- Role-based access control (Admin, Teacher, Student, Parent, Librarian)
- Refresh tokens and concurrent-session limits

## 2. Admin

- School-wide dashboard and analytics
- User management (students, teachers, parents, librarians)
- Bulk student import (CSV)
- Academic configuration (years, terms, subjects, class levels, sections, assessment types)
- Timetable and exam schedule management
- Marks oversight and term/year result calculation
- Attendance oversight (including chronic absenteeism alerts)
- Discipline incidents and appeals
- Library oversight
- Reports and document generation (term reports, transcripts, ID cards)
- Onboarding wizard
- End-of-year student promotion
- School settings (logo, branding, grading scale)
- Help center and support tickets
- Audit trail

## 3. Teacher

- Class and subject dashboard
- Marks entry (single, batch)
- Attendance marking (manual, QR, NFC)
- Homework assignment and grading
- Discipline incident recording
- Class-level analytics
- Messaging with admin, parents, and students
- Profile management

## 4. Student

- Personal dashboard (timetable, recent marks, upcoming homework)
- View own marks and report cards
- View own attendance
- View own discipline record
- Homework submission
- Library catalog and personal loans
- Messaging with teachers and admin
- Personal analytics
- Profile management

## 5. Parent

- Per-child dashboards
- View each child's marks, attendance, discipline, reports, analytics
- File discipline appeals
- Messaging with teachers and admin
- Profile management

## 6. Librarian

- Book catalog management
- Checkout and return
- Active and overdue loan tracking
- Overdue reminders
- Lost-book reporting

## 7. Messaging

- Real-time chat (WebSocket)
- One-on-one, group, and broadcast conversations
- Online presence and read receipts
- Typing indicators

## 8. Notifications

- In-app notifications with unread badge
- Email delivery (via SMTP)
- SMS delivery (via Twilio / Africa's Talking)
- Push notifications to mobile devices

## 9. Reports & Documents

- Term report cards (PDF)
- Year report
- Student ID cards (single and bulk)
- Transfer letters, transcripts, certificates

## 10. File Uploads

- School logo, signature, stamp
- User profile photos
- Persistent storage and public serving

## 11. Mobile App (Expo)

- Native iOS / Android
- Same role-based access as web
- Push notification support
- Secure token storage

## 12. System & Operations

- Health checks (database, Redis)
- Audit logging on sensitive mutations
- Throttling and abuse protection
- Sentry error monitoring
- Structured API errors

---

*See the source modules under `backend/src/modules/` for the implementation of each feature and `web/src/app/` for the corresponding UI routes.*
