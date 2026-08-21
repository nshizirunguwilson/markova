/**
 * Realistic API responses keyed by url fragment.
 *
 * The resilience pass renders every page against an empty API, which proves a
 * page does not fall over but leaves every "render the rows" branch untouched.
 * This is the populated half: one plausible response per endpoint, so the same
 * pass can drive each page through its real content.
 *
 * Names and numbers are Rwandan and match the demo seed, so a screenshot from a
 * test looks like a screenshot from the app.
 */

const user = (id: string, firstName: string, lastName: string, role = "STUDENT") => ({
  id,
  firstName,
  lastName,
  email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@markova.edu`,
  phone: "+250788000001",
  role,
  photoUrl: null,
  isActive: true,
});

export const academicYear = { id: "year-1", name: "2026-2027", isActive: true, startDate: "2026-09-01", endDate: "2027-07-15" };
export const term = { id: "term-1", name: "Term 1", academicYearId: "year-1", isActive: true, isClosed: false, startDate: "2026-09-01", endDate: "2026-12-15" };
export const classLevel = { id: "level-1", name: "Senior 1", stage: "OLEVEL", order: 1 };
export const trade = { id: "trade-1", name: "Software Development", code: "SOD" };
export const classSection = { id: "section-1", name: "A", capacity: 40, classLevelId: "level-1", classLevel, studentCount: 32 };
export const subject = { id: "subject-1", name: "Mathematics", code: "MATH", credits: 4, category: "SCIENCE" };
export const assessmentType = { id: "assess-1", name: "Quiz", weight: 20 };

export const students = [
  { id: "student-1", userId: "u-1", studentIdNumber: "MRK-2026-001", classSectionId: "section-1", classSection, disciplinePoints: 100, user: user("u-1", "Divine", "Niyonkuru") },
  { id: "student-2", userId: "u-2", studentIdNumber: "MRK-2026-002", classSectionId: "section-1", classSection, disciplinePoints: 92, user: user("u-2", "Keza", "Mutesi") },
];

export const teachers = [
  { id: "teacher-1", userId: "u-3", employeeId: "EMP-001", qualification: "BSc Education", user: user("u-3", "Aline", "Uwase", "TEACHER") },
];

export const paginatedUsers = {
  users: [...students.map((s) => s.user), ...teachers.map((t) => t.user)],
  meta: { total: 3, page: 1, limit: 20, totalPages: 1 },
};

export const marks = [
  { id: "mark-1", studentId: "student-1", subjectId: "subject-1", subject, score: 82, maxScore: 100, assessmentType, student: students[0], termId: "term-1" },
  { id: "mark-2", studentId: "student-2", subjectId: "subject-1", subject, score: 67, maxScore: 100, assessmentType, student: students[1], termId: "term-1" },
];

export const termResult = {
  id: "tr-1",
  studentId: "student-1",
  student: students[0],
  termId: "term-1",
  total: 412,
  average: 82.4,
  position: 3,
  grade: "A",
  decision: "PASS",
  isPublished: true,
  comment: "Strong term.",
  subjects: [{ subjectId: "subject-1", subject, score: 82, grade: "A" }],
};

export const book = { id: "book-1", title: "Ubuzima n'Ubumenyi", author: "Mukamana J.", isbn: "978-1-23", category: "SCIENCE", totalCopies: 5, availableCopies: 3 };
export const loan = { id: "loan-1", bookId: "book-1", book, borrowerId: "u-1", borrower: user("u-1", "Divine", "Niyonkuru"), dueDate: "2026-09-30", returnedAt: null, isOverdue: false };

export const incident = { id: "inc-1", studentId: "student-1", student: students[0], category: "LATENESS", severity: "MINOR", points: 5, description: "Late to assembly", actionTaken: "WARNING", createdAt: "2026-08-20T07:30:00Z", reportedBy: user("u-3", "Aline", "Uwase", "TEACHER") };

export const homework = { id: "hw-1", title: "Algebra sheet 3", description: "Questions 1 to 12", subjectId: "subject-1", subject, classSectionId: "section-1", classSection, dueDate: "2026-08-30", submissions: [] };

export const conversation = { id: "conv-1", participants: [user("u-1", "Divine", "Niyonkuru")], lastMessage: { body: "Muraho", createdAt: "2026-08-21T09:00:00Z" }, unreadCount: 1 };
export const message = { id: "msg-1", conversationId: "conv-1", senderId: "u-1", sender: user("u-1", "Divine", "Niyonkuru"), body: "Muraho neza", createdAt: "2026-08-21T09:00:00Z" };

export const attendanceRecord = { id: "att-1", studentId: "student-1", student: students[0], status: "PRESENT", date: "2026-08-21" };

export const faq = { id: "faq-1", question: "How do I reset my password?", answer: "Use the reset link on the sign in page.", category: "ACCOUNT", isPublished: true };
export const ticket = { id: "tkt-1", subject: "Cannot see my marks", body: "Term 1 marks are missing", status: "OPEN", createdAt: "2026-08-20T10:00:00Z", user: user("u-1", "Divine", "Niyonkuru") };

export const notification = { id: "note-1", title: "New report card", body: "Term 1 is published", isRead: false, createdAt: "2026-08-21T08:00:00Z" };

export const timetableEntry = { id: "tt-1", dayOfWeek: 1, startTime: "08:00", endTime: "09:00", subjectId: "subject-1", subject, classSectionId: "section-1", classSection, teacherId: "teacher-1", teacher: teachers[0] };

export const assignment = { id: "asg-1", teacherId: "teacher-1", teacher: teachers[0], subjectId: "subject-1", subject, classSectionId: "section-1", classSection, academicYearId: "year-1" };

/**
 * One populated response per endpoint the dashboard reads. Keys are matched as
 * url fragments, longest first, so the more specific route wins.
 */
export const populatedRoutes: Record<string, unknown> = {
  "/academic/years": [academicYear],
  "/academic/terms": [term],
  "/academic/class-levels": [classLevel],
  "/academic/trades": [trade],
  "/academic/sections": [classSection],
  "/academic/subjects": [subject],
  "/academic/assessment-types": [assessmentType],
  "/academic/assignments": [assignment],
  "/academic/timetable": [timetableEntry],
  "/school-config": { schoolName: "Groupe Scolaire Kigali", primaryColor: "#1B4F72", logoUrl: "", onboardingComplete: true },

  "/users": paginatedUsers,

  "/marks/completion": { total: 2, entered: 2, percentage: 100, missing: [] },
  "/marks/term-results/class": [termResult],
  "/marks/term-results/student": { result: termResult, marks },
  "/marks/year-results/class": [termResult],
  "/marks/year-results/student": { result: termResult, marks },
  "/marks/report-card": { student: students[0], result: termResult, marks },
  "/marks": marks,

  "/attendance/class": [attendanceRecord],
  "/attendance/class-students": students,
  "/attendance/student-summary": { present: 58, absent: 2, late: 1, excused: 0, rate: 95.1, records: [attendanceRecord] },
  "/attendance/dashboard": { present: 300, absent: 12, late: 5, rate: 94.6, byClass: [{ classSection, present: 30, absent: 2 }] },
  "/attendance/chronic": [{ student: students[1], absences: 7 }],

  "/discipline/incidents": [incident],
  "/discipline/student": [incident],
  "/discipline/appeals/pending": [],
  "/discipline/dashboard": { total: 4, bySeverity: [{ severity: "MINOR", count: 3 }], recent: [incident] },

  "/library/books": [book],
  "/library/loans/active": [loan],
  "/library/loans/overdue": [],
  "/library/loans/my": [loan],
  "/library/analytics": { totalBooks: 120, activeLoans: 14, overdue: 2, popular: [book] },

  "/homework/student": [homework],
  "/homework": [homework],

  "/messaging/conversations": [conversation],
  "/messaging/contacts": [user("u-3", "Aline", "Uwase", "TEACHER")],
  "/messaging/unread": { count: 1 },
  "/messaging": [message],

  "/notifications/unread": { count: 2 },
  "/notifications": [notification],

  "/help/faqs": [faq],
  "/help/tickets": [ticket],

  "/analytics/admin/dashboard": { students: 320, teachers: 24, classes: 12, attendanceRate: 94.6, averageScore: 71.2 },
  "/analytics/admin/performance-trends": [{ term: "Term 1", average: 71.2 }],
  "/analytics/admin/class-comparisons": [{ classSection, average: 73.1 }],
  "/analytics/admin/discipline": { total: 4, bySeverity: [{ severity: "MINOR", count: 3 }] },
  "/analytics/admin/library": { totalBooks: 120, activeLoans: 14 },
  "/analytics/admin/attendance": { rate: 94.6, byClass: [{ classSection, rate: 95 }] },
  "/analytics/admin/grade-distribution": [{ grade: "A", count: 40 }],
  "/analytics/admin/enrollment": [{ level: "Senior 1", count: 120 }],
  "/analytics/student": { subjects: [{ subject, average: 82 }], trend: [{ term: "Term 1", average: 82 }] },
  "/analytics/teacher/class": { average: 73.1, distribution: [{ grade: "A", count: 10 }], students: students },
  "/analytics/parent/child": { trend: [{ term: "Term 1", average: 82 }] },

  "/reports/term": { student: students[0], result: termResult, marks },
  "/reports/year": { student: students[0], result: termResult },
  "/reports/id-card": { student: students[0], qr: "data:image/png;base64,AAA" },
  "/reports/id-cards/registry": { cards: [{ id: "card-1", student: students[0], status: "ISSUED", issuedAt: "2026-08-01" }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } },
};
