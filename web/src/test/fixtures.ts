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

/** The model flag is `isCurrent`, not `isActive`. Pages read it to pick a default year. */
export const academicYear = { id: "year-1", name: "2026-2027", isCurrent: true, startDate: "2026-09-01", endDate: "2027-07-15" };
export const term = { id: "term-1", name: "Term 1", academicYearId: "year-1", isCurrent: true, isClosed: false, startDate: "2026-09-01", endDate: "2026-12-15" };
/**
 * `/academic/class-levels` returns each level with its sections nested, each
 * one carrying its trade and an ACTIVE-only `_count.students` (see
 * getClassLevels in backend/src/modules/academic/academic.service.ts). Without
 * `sections` here, expanding a level in a test shows an empty card and the
 * test passes having looked at nothing.
 */
export const classLevel = {
  id: "level-1",
  name: "Senior 1",
  stage: "O_LEVEL",
  order: 1,
  sections: [
    {
      id: "section-1",
      name: "A",
      classLevelId: "level-1",
      trade: null,
      tradeId: null,
      _count: { students: 32 },
    },
    {
      id: "section-2",
      name: "B",
      classLevelId: "level-1",
      trade: null,
      tradeId: null,
      _count: { students: 28 },
    },
  ],
};
export const trade = { id: "trade-1", name: "Software Development", code: "SOD" };
export const classSection = { id: "section-1", name: "A", capacity: 40, classLevelId: "level-1", classLevel, studentCount: 32 };
export const subject = { id: "subject-1", name: "Mathematics", code: "MATH", credits: 4, category: "SCIENCE" };
export const assessmentType = { id: "assess-1", name: "Quiz", weight: 20 };

export const students = [
  { id: "student-1", userId: "u-1", studentIdNumber: "STD-2026-001", classSectionId: "section-1", classSection, disciplinePoints: 100, user: user("u-1", "Divine", "Niyonkuru") },
  { id: "student-2", userId: "u-2", studentIdNumber: "STD-2026-002", classSectionId: "section-1", classSection, disciplinePoints: 92, user: user("u-2", "Keza", "Mutesi") },
];

export const teachers = [
  // Staff are identified by `user.code` (TCH-…). The Teacher model has no
  // employeeId, and inventing one here hid a blank column on the teachers page.
  { id: "teacher-1", userId: "u-3", qualification: "A0", user: { ...user("u-3", "Aline", "Uwase", "TEACHER"), code: "TCH-2026-001" } },
];

/**
 * The API's paginated envelope is `{ data, meta }`, from PaginatedResponse in
 * backend/src/common/dto/pagination.dto.ts. Naming the array anything else here
 * makes list pages render an empty table in tests while passing, which is worse
 * than no fixture at all.
 *
 * Each row carries its `student` (or `teacher`) the way `GET /users` really
 * returns it — the record id, the id number and the class, all nested. Rows
 * that were the bare user made anything reading `user.student.id` render an
 * empty picker while its tests passed.
 */
export const paginatedUsers = {
  data: [
    ...students.map((s) => ({
      ...s.user,
      student: {
        id: s.id,
        studentIdNumber: s.studentIdNumber,
        classSectionId: s.classSectionId,
        status: "ACTIVE",
        classSection: s.classSection,
        parentStudents: [],
      },
      teacher: null,
    })),
    ...teachers.map((t) => ({
      ...t.user,
      student: null,
      teacher: { id: t.id, qualification: t.qualification },
    })),
  ],
  meta: { total: 3, page: 1, limit: 20, totalPages: 1 },
};

export const marks = [
  { id: "mark-1", studentId: "student-1", subjectId: "subject-1", subject, score: 82, maxScore: 100, assessmentType, student: students[0], termId: "term-1" },
  { id: "mark-2", studentId: "student-2", subjectId: "subject-1", subject, score: 67, maxScore: 100, assessmentType, student: students[1], termId: "term-1" },
];

/**
 * A term result the way the model actually names its columns: `totalMarks`,
 * `letterGrade` and `rank` (see TermResult in schema.prisma). Calling them
 * total/grade/position here left the Total Marks and Grade columns showing a
 * dash on the marks page while the tests still passed.
 */
export const termResult = {
  id: "tr-1",
  studentId: "student-1",
  student: students[0],
  classSectionId: "section-1",
  termId: "term-1",
  totalMarks: 412,
  average: 82.4,
  letterGrade: "A",
  aggregate: 12,
  aggregateMax: 24,
  rank: 3,
  teacherComment: "Strong term.",
  headmasterComment: null,
  isPublished: true,
  reportCardPublished: true,
  subjects: [{ subjectId: "subject-1", subject, score: 82, grade: "A" }],
};

/**
 * What `GET /reports/term/:studentId` actually answers with.
 *
 * Copied from a live response, not invented. The student and parent report
 * pages were written against a shape nobody checked — `report.termName`,
 * `report.average`, `s.subjectName` — and their tests carried fixtures shaped
 * to match the pages rather than the API. So the tests passed while the real
 * page rendered a card with no subject names and dashes where the average,
 * grade and position should be.
 *
 * Anything reading this endpoint should build its fixture from here.
 */
export const termReport = {
  school: { name: "Markova Academy", motto: "Excellence Through Knowledge", logoUrl: "/uploads/logo.png" },
  student: {
    name: "Divine Niyonkuru",
    studentIdNumber: "STD-2026-001",
    photoUrl: null,
    class: "Senior 1 A",
    stage: "O_LEVEL",
    trade: null,
    gender: "MALE",
    dateOfBirth: "2010-04-12T00:00:00.000Z",
    disciplinePoints: 100,
  },
  term: { name: "Term 1", academicYear: "2025-2026" },
  classTeacher: "Aline Uwase",
  attendance: { present: 58, total: 60 },
  // `subject` carries the name — not `subjectName`, which is what the pages
  // used to read and why every row rendered blank.
  subjects: [
    { subject: "Mathematics", scope: "O_CORE", assessments: [], average: 82, total: 82, grade: "A", points: 6, remark: "Excellent", competence: null },
    { subject: "Kinyarwanda", scope: "O_CORE", assessments: [], average: 65, total: 65, grade: "B", points: 5, remark: "Very Good", competence: null },
  ],
  result: {
    id: "tr-1",
    average: 73.5,
    letterGrade: "B",
    rank: 3,
    aggregate: 11,
    aggregateMax: 54,
    teacherComment: "Strong term.",
    headmasterComment: null,
    isPublished: true,
    reportCardPublished: true,
  },
  classStats: { classAverage: 65.4, totalStudents: 29, rank: 3 },
  verification: { code: "483920175566", url: "https://markova.edu/verify/483920175566" },
};

// The Book model counts copies as `quantity` and `availableCount` (see
// schema.prisma). Naming them totalCopies/availableCopies here left the two
// count columns blank in tests while the pages still passed.
export const book = { id: "book-1", title: "Ubuzima n'Ubumenyi", author: "Mukamana J.", isbn: "978-9970-19-522-4", category: "SCIENCE", quantity: 5, availableCount: 3, barcode: "BK-0001", replacementCost: 12000 };
export const loan = { id: "loan-1", bookId: "book-1", book, borrowerId: "u-1", borrower: user("u-1", "Divine", "Niyonkuru"), dueDate: "2026-09-30", returnedAt: null, isOverdue: false };

export const incident = { id: "inc-1", studentId: "student-1", student: students[0], category: "LATENESS", severity: "MINOR", points: 5, description: "Late to assembly", actionTaken: "WARNING", createdAt: "2026-08-20T07:30:00Z", reportedBy: user("u-3", "Aline", "Uwase", "TEACHER") };

/**
 * One homework with its submissions, the way `/homework/:id` returns them
 * (see findOne in backend/src/modules/homework/homework.service.ts): each one
 * nests the student and their user, and `marks` is null until it is graded.
 * An empty `submissions` here leaves the teacher's grading table untested.
 */
export const homework = {
  id: "hw-1",
  title: "Algebra sheet 3",
  description: "Questions 1 to 12",
  subjectId: "subject-1",
  subject,
  classSectionId: "section-1",
  classSection,
  dueDate: "2026-08-30",
  maxMarks: 20,
  lateDeductionPerDay: 2,
  totalStudents: 2,
  submissions: [
    {
      id: "sub-1",
      homeworkId: "hw-1",
      student: students[0],
      submittedAt: "2026-08-29T14:00:00Z",
      isLate: false,
      marks: 17,
      feedback: "Neat work",
    },
    {
      id: "sub-2",
      homeworkId: "hw-1",
      student: students[1],
      submittedAt: "2026-09-01T08:00:00Z",
      isLate: true,
      marks: null,
      feedback: null,
    },
  ],
};

export const conversation = { id: "conv-1", type: "ONE_ON_ONE", participants: [{ user: user("u-1", "Divine", "Niyonkuru") }], lastMessage: { body: "Muraho", createdAt: "2026-08-21T09:00:00Z" }, unreadCount: 1 };
export const message = { id: "msg-1", conversationId: "conv-1", senderId: "u-1", sender: user("u-1", "Divine", "Niyonkuru"), body: "Muraho neza", createdAt: "2026-08-21T09:00:00Z" };

export const attendanceRecord = { id: "att-1", studentId: "student-1", student: students[0], status: "PRESENT", date: "2026-08-21" };

export const faq = { id: "faq-1", title: "How do I reset my password?", content: "Use the reset link on the sign in page.", category: "ACCOUNT", displayOrder: 1, isPublished: true };
export const ticket = { id: "tkt-1", subject: "Cannot see my marks", message: "Term 1 marks are missing", status: "OPEN", priority: "NORMAL", createdAt: "2026-08-20T10:00:00Z", user: user("u-1", "Divine", "Niyonkuru") };

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
  "/attendance/dashboard": {
    date: "2026-08-21",
    overall: { totalStudents: 320, present: 300, late: 8, absent: 12, rate: 96 },
    sections: [
      { sectionId: "section-1", className: "Senior 1 A", total: 32, present: 30, late: 1, absent: 1, rate: 97 },
    ],
  },
  "/attendance/chronic": [{ student: students[1], absences: 7 }],

  "/discipline/incidents": [incident],
  "/discipline/student": [incident],
  "/discipline/appeals/pending": [],
  "/discipline/dashboard": {
    totalIncidents: 4,
    totalPointsDeducted: 20,
    pendingAppeals: 0,
    byAction: { WARNING: 3, SUSPENSION: 1 },
    topOffenders: [{ student: students[1], count: 2, points: 10 }],
  },

  "/library/books": [book],
  "/library/loans/active": [loan],
  "/library/loans/overdue": [],
  "/library/loans/my": [loan],
  // `popularBooks` with a `loanCount` each, from getAnalytics in
  // backend/src/modules/library/library.service.ts.
  "/library/analytics": {
    totalBooks: 120,
    totalCopies: 340,
    availableCopies: 310,
    activeLoans: 14,
    overdueLoans: 2,
    lostBooks: 1,
    overdueRate: 14,
    popularBooks: [
      { title: "Things Fall Apart", author: "Chinua Achebe", loanCount: 22 },
      { title: "Mathematics for Rwanda Schools", author: "REB", loanCount: 17 },
    ],
    categories: [{ category: "Fiction", count: 40, totalCopies: 120 }],
  },

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
  // A trend line needs at least two terms; one point draws nothing.
  "/analytics/admin/performance-trends": [
    { termName: "Term 1", yearName: "2026-2027", averageScore: 68.4, studentCount: 318 },
    { termName: "Term 2", yearName: "2026-2027", averageScore: 71.2, studentCount: 320 },
    { termName: "Term 3", yearName: "2026-2027", averageScore: 74.9, studentCount: 316 },
  ],
  "/analytics/admin/class-comparisons": [
    { className: "Senior 1 A", averageScore: 73.1, studentCount: 32 },
    { className: "Senior 1 B", averageScore: 66.8, studentCount: 28 },
  ],
  // `byAction`, from getDisciplineStats in analytics.service.ts. A severity
  // breakdown is not what this endpoint returns, and the chart built from it
  // never renders.
  "/analytics/admin/discipline": {
    totalIncidents: 4,
    byAction: [
      { name: "WARNING", count: 3 },
      { name: "PARENT_MEETING", count: 1 },
    ],
  },
  // `popularBooks` with a `loanCount` each, from computeLibraryStats in
  // backend/src/modules/analytics/analytics.service.ts. Without it the
  // most-borrowed chart never renders.
  "/analytics/admin/library": {
    totalBooks: 120,
    totalLoans: 340,
    activeLoans: 14,
    overdueLoans: 2,
    popularBooks: [
      { id: "book-1", title: "Things Fall Apart", author: "Chinua Achebe", loanCount: 22 },
      { id: "book-2", title: "Mathematics for Rwanda Schools", author: "REB", loanCount: 17 },
    ],
  },
  // `byDate` is what the attendance chart plots, one entry per day.
  "/analytics/admin/attendance": {
    totalRecords: 640,
    present: 600,
    absent: 24,
    late: 16,
    attendanceRate: 94,
    byDate: [
      { date: "2026-08-17", present: 118, late: 4, absent: 6 },
      { date: "2026-08-18", present: 122, late: 2, absent: 4 },
      { date: "2026-08-19", present: 120, late: 5, absent: 3 },
    ],
  },
  // Per level, with a letter->count map. See analytics.service.ts.
  "/analytics/admin/grade-distribution": [
    { level: "Senior 1", total: 32, counts: { A: 8, B: 12, C: 9, D: 2, F: 1 } },
    { level: "Senior 2", total: 30, counts: { A: 6, B: 11, C: 10, D: 3 } },
  ],
  "/analytics/admin/enrollment": [{ level: "Senior 1", male: 60, female: 60, total: 120 }],
  /**
   * `/analytics/student/:id/profile`, from getStudentProfileAnalytics in
   * backend/src/modules/analytics/analytics.service.ts: a list of terms, each
   * carrying its own subjects with a `total` and a `grade`. The heatmap on the
   * performance chart is built from exactly that, and a flat `subjects` array
   * left it blank while the tests still passed.
   */
  "/analytics/student": {
    student: { name: "Divine Niyonkuru" },
    terms: [
      {
        termId: "term-1",
        termName: "Term 1",
        yearName: "2026-2027",
        className: "Senior 1 A",
        average: 74.2,
        letterGrade: "B",
        rank: 6,
        classSize: 32,
        subjects: [
          { name: "Mathematics", scope: "GENERAL", total: 82, grade: "A", points: 1 },
          { name: "Kinyarwanda", scope: "GENERAL", total: 61, grade: "C", points: 3 },
        ],
      },
      {
        termId: "term-2",
        termName: "Term 2",
        yearName: "2026-2027",
        className: "Senior 1 A",
        average: 77.8,
        letterGrade: "B",
        rank: 4,
        classSize: 32,
        subjects: [
          { name: "Mathematics", scope: "GENERAL", total: 88, grade: "A", points: 1 },
          { name: "Kinyarwanda", scope: "GENERAL", total: 67, grade: "B", points: 2 },
        ],
      },
    ],
  },
  "/analytics/teacher/class": { average: 73.1, distribution: [{ grade: "A", count: 10 }], students: students },
  "/analytics/parent/child": { trend: [{ term: "Term 1", average: 82 }] },

  "/reports/term": { student: students[0], result: termResult, marks },
  "/reports/year": { student: students[0], result: termResult },
  "/reports/id-card": { student: students[0], qr: "data:image/png;base64,AAA" },
  "/reports/id-cards/registry": { data: [{ id: "card-1", student: students[0], status: "ISSUED", issuedAt: "2026-08-01" }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } },
};

/**
 * The same endpoints, answered with the awkward cases.
 *
 * `populatedRoutes` is a school where everything is fine: marks published,
 * books returned, nobody absent. Every page has a second half that only renders
 * when something is wrong, and that half is the half a head teacher actually
 * looks at. This drives it: overdue books, unpublished results, absent
 * students, homework past its due date, more rows than fit on a page.
 */
const overdueLoan = {
  ...loan,
  id: "loan-2",
  dueDate: "2026-07-01",
  returnedAt: null,
  isOverdue: true,
  daysOverdue: 51,
};

const returnedLoan = {
  ...loan,
  id: "loan-3",
  returnedAt: "2026-08-10",
  isOverdue: false,
};

const unpublishedResult = {
  ...termResult,
  id: "tr-2",
  isPublished: false,
  average: 41.2,
  grade: "F",
  decision: "REPEAT",
  position: 28,
  comment: "",
};

const overdueHomework = {
  ...homework,
  id: "hw-2",
  title: "Overdue essay",
  dueDate: "2026-07-15",
  _count: { submissions: 0 },
};

export const edgeRoutes: Record<string, unknown> = {
  ...populatedRoutes,

  // A bigger roll than one page holds, so pagination renders.
  "/users": {
    data: Array.from({ length: 20 }, (_, i) => ({
      id: `u-${i}`,
      firstName: ["Divine", "Keza", "Aline", "Mugisha", "Uwera"][i % 5],
      lastName: ["Niyonkuru", "Mutesi", "Uwase", "Habimana", "Ingabire"][i % 5],
      email: `person${i}@markova.edu`,
      phone: `+2507880000${String(i).padStart(2, "0")}`,
      role: ["STUDENT", "TEACHER", "PARENT", "LIBRARIAN"][i % 4],
      isActive: i % 7 !== 0,
      photoUrl: null,
    })),
    meta: { total: 84, page: 2, limit: 20, totalPages: 5 },
  },

  "/library/loans/active": [overdueLoan, returnedLoan, loan],
  "/library/loans/overdue": [overdueLoan],
  "/library/loans/my": [overdueLoan],
  "/library/books": [
    // Nothing left on the shelf, which is what the borrow button reads.
    { ...book, availableCount: 0 },
    { ...book, id: "book-2", title: "Imigani", availableCount: 5, category: null },
  ],

  "/marks/term-results/class": [unpublishedResult, termResult],
  "/marks/term-results/student": { result: unpublishedResult, marks: [] },
  "/marks/completion": {
    total: 32,
    entered: 11,
    percentage: 34,
    missing: students.map((s) => ({ student: s, subject })),
  },

  "/attendance/class": [
    { ...attendanceRecord, status: "ABSENT" },
    { ...attendanceRecord, id: "att-2", status: "LATE", student: students[1] },
  ],
  "/attendance/student-summary": {
    present: 20,
    absent: 18,
    late: 6,
    excused: 2,
    rate: 43.5,
    records: [{ ...attendanceRecord, status: "ABSENT" }],
  },
  "/attendance/dashboard": {
    date: "2026-08-21",
    overall: { totalStudents: 320, present: 180, late: 40, absent: 100, rate: 68 },
    sections: [
      { sectionId: "section-1", className: "Senior 1 A", total: 32, present: 12, late: 4, absent: 16, rate: 50 },
    ],
  },

  "/discipline/incidents": [
    { ...incident, severity: "MAJOR", points: 25, actionTaken: "SUSPENSION" },
    incident,
  ],
  "/discipline/appeals/pending": [
    { id: "ap-1", incident, reason: "It was not me", status: "PENDING", createdAt: "2026-08-20T12:00:00Z" },
  ],
  "/discipline/student": [{ ...incident, severity: "MAJOR", points: 25 }],

  "/homework": [overdueHomework, homework],
  "/homework/student": [{ ...overdueHomework, submission: null }],

  "/messaging/conversations": [
    { ...conversation, unreadCount: 12, lastMessage: { content: "Muraho", createdAt: "2026-08-21T09:00:00Z", sender: undefined } },
  ],
  "/notifications": [notification, { ...notification, id: "note-2", isRead: true, type: "ATTENDANCE" }],

  "/help/tickets": [ticket, { ...ticket, id: "tkt-2", status: "CLOSED" }],
  "/help/faqs": [faq, { ...faq, id: "faq-2", title: "Where are marks?", isPublished: false }],

  "/analytics/admin/dashboard": {
    students: 0,
    teachers: 0,
    classes: 0,
    attendanceRate: 0,
    averageScore: 0,
  },
};

/**
 * The same school, answered without any of its relations.
 *
 * A real API drops them all the time: a `select` that forgot an `include`, a
 * row whose teacher was deactivated, a loan whose borrower record went. Every
 * page is full of `l.borrower?.firstName || ""` guards written for exactly
 * that, and until something renders against a row with no borrower on it,
 * none of those guards has ever run.
 *
 * The transform is deliberately blunt: keep the scalars, drop the nested
 * objects and arrays-of-objects. What is left is what a thin `select` returns.
 */
function stripRelations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripRelations);
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (inner === null || typeof inner !== "object") {
      out[key] = inner;
      continue;
    }
    // `data` and `meta` are the response envelope, not a relation, so they
    // have to survive or every list becomes undefined.
    if (key === "data" || key === "meta") out[key] = stripRelations(inner);
  }
  return out;
}

export const thinRoutes: Record<string, unknown> = Object.fromEntries(
  Object.entries(populatedRoutes).map(([url, body]) => [
    url,
    stripRelations(body),
  ]),
);

/**
 * The same school, doing badly.
 *
 * Almost every page colours a figure against a threshold: an attendance rate
 * is green above ninety, amber above seventy-five, red below. A fixture set
 * with one healthy number in it only ever paints the first of those, and the
 * red arm — the one a head teacher actually acts on — is never drawn.
 *
 * So this maps the rates down under every threshold, empties the counts, and
 * flips the flags. It is deliberately blunt: what it proves is that a page
 * renders the same way when the news is bad.
 */
function underThreshold(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => underThreshold(v, key));
  if (value === null || typeof value !== "object") {
    if (typeof value === "number") {
      if (/rate|percent|average|score|attendance|progress/i.test(key)) return 41;
      if (/count|total|pending|overdue|balance|points|marks|quantity/i.test(key)) return 0;
      return value;
    }
    if (typeof value === "boolean") return !value;
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      // The envelope has to keep its shape, or every list becomes unreadable.
      k === "meta" ? v : underThreshold(v, k),
    ]),
  );
}

export const strainedRoutes: Record<string, unknown> = Object.fromEntries(
  Object.entries(populatedRoutes).map(([url, body]) => [
    url,
    underThreshold(body),
  ]),
);

/**
 * The same school with every optional field left empty.
 *
 * Almost every column in this app is written as `value ?? "—"` or
 * `value || 0`, and a fixture set where every field is filled in never draws
 * a single one of those fallbacks. This blanks every leaf that is not an id,
 * a name or part of the response envelope, which is what a record imported
 * from a spreadsheet with three columns in it actually looks like.
 *
 * Ids and names are kept: without them React has no keys and a page cannot be
 * found by the thing it is showing, which would make a failure here impossible
 * to read.
 */
const KEEP = /(^|[a-z])(id|ids|name|title|status|type|kind|role|key|url)$/i;

function blankOptional(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => blankOptional(v, key));
  if (value === null || typeof value !== "object") {
    if (KEEP.test(key)) return value;
    if (typeof value === "string") return "";
    if (typeof value === "number") return null;
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      // The envelope keeps its shape, or every paginated list becomes empty.
      k === "meta" ? v : blankOptional(v, k),
    ]),
  );
}

export const blankRoutes: Record<string, unknown> = Object.fromEntries(
  Object.entries(populatedRoutes).map(([url, body]) => [url, blankOptional(body)]),
);
