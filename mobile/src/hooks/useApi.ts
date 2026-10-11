import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  AcademicYear,
  Term,
  ClassSection,
  Subject,
  AssessmentType,
  TeacherAssignment,
  AttendanceRecord,
  AttendanceSummary,
  Mark,
  TermResult,
  DisciplineIncident,
  Homework,
  Notification,
  Student,
} from '@/types';

// ─── Academic ───────────────────────────────────────────

export function useAcademicYears() {
  return useQuery<AcademicYear[]>({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });
}

export function useTerms(academicYearId?: string) {
  return useQuery<Term[]>({
    queryKey: ['terms', academicYearId],
    queryFn: () =>
      api.get('/academic/terms', { params: { academicYearId } }).then((r) => r.data),
    enabled: !!academicYearId,
  });
}

export function useCurrentTerm() {
  return useQuery<Term | null>({
    queryKey: ['current-term'],
    queryFn: async () => {
      const years: AcademicYear[] = await api.get('/academic/years').then((r) => r.data);
      const currentYear = years.find((y) => y.isCurrent);
      if (!currentYear) return null;
      const terms: Term[] = await api
        .get('/academic/terms', { params: { academicYearId: currentYear.id } })
        .then((r) => r.data);
      return terms.find((t) => t.isCurrent) ?? terms[terms.length - 1] ?? null;
    },
  });
}

export function useClassSections(classLevelId?: string) {
  return useQuery<ClassSection[]>({
    queryKey: ['class-sections', classLevelId],
    queryFn: () =>
      api.get('/academic/sections', { params: { classLevelId } }).then((r) => r.data),
  });
}

export function useSubjects() {
  return useQuery<Subject[]>({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });
}

export function useAssessmentTypes() {
  return useQuery<AssessmentType[]>({
    queryKey: ['assessment-types'],
    queryFn: () => api.get('/academic/assessment-types').then((r) => r.data),
  });
}

export function useTeacherAssignments(teacherId?: string) {
  return useQuery<TeacherAssignment[]>({
    queryKey: ['teacher-assignments', teacherId],
    queryFn: () =>
      api.get('/academic/assignments', { params: { teacherId } }).then((r) => r.data),
    enabled: !!teacherId,
  });
}

/**
 * Every teaching load in the school.
 *
 * Separate from useTeacherAssignments because that one waits for a teacher id
 * and is disabled without one. The "who teaches what" screen wants the lot,
 * and calling the scoped hook with nothing left it pending forever.
 */
export function useAllAssignments() {
  return useQuery<TeacherAssignment[]>({
    queryKey: ['assignments', 'all'],
    queryFn: () => api.get('/academic/assignments').then((r) => r.data),
  });
}

export function useClassTeachers(classSectionId?: string) {
  return useQuery<TeacherAssignment[]>({
    queryKey: ['class-teachers', classSectionId],
    queryFn: () =>
      api.get('/academic/assignments', { params: { classSectionId } }).then((r) => r.data),
    enabled: !!classSectionId,
  });
}

// ─── Timetable ──────────────────────────────────────────

export function useTimetable(classSectionId?: string) {
  return useQuery({
    queryKey: ['timetable', classSectionId],
    queryFn: () =>
      api.get('/academic/timetable', { params: { classSectionId } }).then((r) => r.data),
    enabled: !!classSectionId,
  });
}

export function useTeacherTimetable(teacherId?: string) {
  return useQuery({
    queryKey: ['teacher-timetable', teacherId],
    queryFn: () =>
      api.get(`/academic/timetable/teacher/${teacherId}`).then((r) => r.data),
    enabled: !!teacherId,
  });
}

// ─── Exam Schedule ──────────────────────────────────────

export function useExamSchedule(classSectionId?: string, termId?: string) {
  return useQuery({
    queryKey: ['exam-schedule', classSectionId, termId],
    queryFn: () =>
      api.get('/academic/exams', { params: { classSectionId, termId } }).then((r) => r.data),
    enabled: !!classSectionId,
  });
}

// ─── Attendance ─────────────────────────────────────────

export function useAttendanceSummary(studentId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery<AttendanceSummary>({
    queryKey: ['attendance-summary', studentId, dateFrom, dateTo],
    queryFn: () =>
      api
        .get('/attendance/student-summary', { params: { studentId, dateFrom, dateTo } })
        .then((r) => r.data),
    enabled: !!studentId,
  });
}

/** One student on a day's register, as the API sends it. */
export interface RegisterRow {
  studentId: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | null;
  /** Suspended or away that day: on the register, and never marked. */
  pause?: { kind: 'SUSPENDED' | 'AWAY'; label: string; endsOn: string | null } | null;
}

/**
 * A class's register for a day.
 *
 * The API answers with a summary that holds the list in `students`. This read
 * it as the list itself, so a register already taken that day failed to load
 * on the phone; it now unwraps it.
 */
export function useClassAttendance(classSectionId?: string, date?: string) {
  return useQuery<RegisterRow[]>({
    queryKey: ['class-attendance', classSectionId, date],
    queryFn: () =>
      api
        .get('/attendance/class', { params: { classSectionId, date } })
        .then((r) => (r.data?.students ?? []) as RegisterRow[]),
    enabled: !!classSectionId && !!date,
  });
}

/**
 * The students in one class section.
 *
 * Reads the attendance module's class roster rather than `GET /users`, which is
 * an ADMIN-only endpoint - it returned 403 for every teacher, so marks entry,
 * attendance, discipline logging and NFC registration all showed an empty class.
 *
 * That route answers with a flat row, so it is mapped back into the nested
 * `Student` shape the screens are typed against.
 */
export function useClassStudents(classSectionId?: string) {
  return useQuery<Student[]>({
    queryKey: ['class-students', classSectionId],
    queryFn: () =>
      api
        .get('/attendance/class-students', { params: { classSectionId } })
        .then((r) =>
          (r.data ?? []).map(
            (s: {
              id: string;
              userId: string;
              studentIdNumber: string;
              nfcCardId: string | null;
              firstName: string;
              lastName: string;
            }) => ({
              id: s.id,
              userId: s.userId,
              classSectionId: classSectionId!,
              studentIdNumber: s.studentIdNumber,
              nfcCardId: s.nfcCardId ?? undefined,
              user: {
                id: s.userId,
                firstName: s.firstName,
                lastName: s.lastName,
                email: '',
              },
            }),
          ),
        ),
    enabled: !!classSectionId,
  });
}

export function useBulkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      classSectionId: string;
      date: string;
      type: 'DAILY' | 'SUBJECT';
      subjectId?: string;
      records: { studentId: string; status: string; reasonCategory?: string }[];
    }) => api.post('/attendance/bulk', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['class-attendance'] });
      qc.invalidateQueries({ queryKey: ['attendance-summary'] });
    },
  });
}

// ─── NFC Attendance ─────────────────────────────────────

export function useClassStudentsNfc(classSectionId?: string) {
  return useQuery<{ id: string; studentIdNumber: string; nfcCardId: string | null; firstName: string; lastName: string; userId: string }[]>({
    queryKey: ['class-students-nfc', classSectionId],
    queryFn: () =>
      api.get('/attendance/class-students', { params: { classSectionId } }).then((r) => r.data),
    enabled: !!classSectionId,
  });
}

export function useNfcScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { nfcCardId: string; classSectionId: string; subjectId?: string; type?: string }) =>
      api.post('/attendance/nfc-scan', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['class-attendance'] });
    },
  });
}

export function useRegisterNfcCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { studentId: string; nfcCardId: string }) =>
      api.post('/attendance/register-nfc', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['class-students-nfc'] });
    },
  });
}

// ─── Marks ──────────────────────────────────────────────

/**
 * A single student's marks for a term.
 *
 * Reads the term-result endpoint rather than `GET /marks`: the latter is an
 * unscoped admin/teacher query that returns 403 for parents and students, so
 * the child marks screen always showed "No marks recorded for this term yet."
 * even when the student had a full set. This route is ownership-checked, so a
 * parent only ever sees a child actually linked to them.
 */
export function useStudentMarks(studentId?: string, termId?: string) {
  return useQuery<Mark[]>({
    queryKey: ['student-marks', studentId, termId],
    queryFn: () =>
      api
        .get(`/marks/term-results/student/${studentId}`, { params: { termId } })
        .then((r) => r.data?.marks ?? []),
    enabled: !!studentId && !!termId,
  });
}

export function useStudentTermResult(studentId?: string, termId?: string) {
  return useQuery<TermResult>({
    queryKey: ['term-result', studentId, termId],
    queryFn: () =>
      api
        .get(`/marks/term-results/student/${studentId}`, { params: { termId } })
        // The endpoint returns { result, marks }; useStudentMarks reads the rest.
        .then((r) => r.data?.result ?? r.data),
    enabled: !!studentId && !!termId,
  });
}

export function useReportCard(studentId?: string, termId?: string) {
  return useQuery({
    queryKey: ['report-card', studentId, termId],
    queryFn: () =>
      api.get(`/marks/report-card/${studentId}`, { params: { termId } }).then((r) => r.data),
    enabled: !!studentId && !!termId,
  });
}

export function useBatchMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      subjectId: string;
      classSectionId: string;
      termId: string;
      assessmentTypeId: string;
      marks: { studentId: string; score: number; maxScore?: number }[];
    }) => api.post('/marks/batch', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-marks'] });
    },
  });
}

// ─── Discipline ─────────────────────────────────────────

export function useStudentDiscipline(studentId?: string) {
  return useQuery<{ incidents: DisciplineIncident[]; totalPoints: number }>({
    queryKey: ['student-discipline', studentId],
    queryFn: () => api.get(`/discipline/student/${studentId}`).then((r) => r.data),
    enabled: !!studentId,
  });
}

export function useAcknowledgeIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (incidentId: string) =>
      api.post('/discipline/acknowledge', { incidentId }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-discipline'] });
    },
  });
}

// ─── Homework ───────────────────────────────────────────

export function useStudentHomework(studentId?: string) {
  return useQuery<Homework[]>({
    queryKey: ['student-homework', studentId],
    queryFn: () => api.get(`/homework/student/${studentId}`).then((r) => r.data),
    enabled: !!studentId,
  });
}

export function useHomeworkList(params?: { classSectionId?: string; termId?: string; subjectId?: string }) {
  return useQuery<Homework[]>({
    queryKey: ['homework-list', params],
    queryFn: () => api.get('/homework', { params }).then((r) => r.data),
  });
}

export function useCreateHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      subjectId: string;
      classSectionId: string;
      termId: string;
      title: string;
      description?: string;
      dueDate: string;
      maxMarks?: number;
    }) => api.post('/homework', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homework-list'] });
    },
  });
}

export function useGradeSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, marks }: { submissionId: string; marks: number }) =>
      api.put(`/homework/submissions/${submissionId}/grade`, { marks }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homework-list'] });
    },
  });
}

// ─── Notifications ──────────────────────────────────────

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── Library ────────────────────────────────────────────

export function useCheckoutBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { bookId: string; userId: string; dueDate?: string }) =>
      api.post('/library/checkout', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-books'] });
      qc.invalidateQueries({ queryKey: ['library-active-loans'] });
    },
  });
}

export function useReturnBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) =>
      api.post('/library/return', { loanId }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-books'] });
      qc.invalidateQueries({ queryKey: ['library-active-loans'] });
      qc.invalidateQueries({ queryKey: ['library-overdue-loans'] });
    },
  });
}

export function useLibraryAnalytics(enabled = true) {
  return useQuery<LibraryAnalytics>({
    queryKey: ['library-analytics'],
    queryFn: () => api.get('/library/analytics').then((r) => r.data),
    // /library/analytics is ADMIN and LIBRARIAN only, so do not fire it for students.
    enabled,
  });
}

// ─── Analytics ──────────────────────────────────────────

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get('/analytics/admin/dashboard').then((r) => r.data),
  });
}

export function useTeacherClassAnalytics(classSectionId?: string) {
  return useQuery({
    queryKey: ['teacher-class-analytics', classSectionId],
    queryFn: () =>
      api.get(`/analytics/teacher/class/${classSectionId}`).then((r) => r.data),
    enabled: !!classSectionId,
  });
}

// ─── Help & Support ─────────────────────────────────────

export function useFaqs(search?: string) {
  return useQuery({
    queryKey: ['faqs', search],
    queryFn: () =>
      api.get('/help/faqs', { params: { search: search?.trim() || undefined } }).then((r) => r.data),
  });
}

export function useMyTickets() {
  return useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => api.get('/help/tickets/mine').then((r) => r.data),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { subject: string; description: string; category?: string }) =>
      api.post('/help/tickets', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
    },
  });
}

// ─── Discipline Appeals ─────────────────────────────────

export function useCreateAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { incidentId: string; reason: string }) =>
      api.post('/discipline/appeals', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-discipline'] });
    },
  });
}

// ─── Notifications (extended) ───────────────────────────

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.put('/notifications/read-all').then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── Parent ─────────────────────────────────────────────

export function useParentChildren() {
  return useQuery<Student[]>({
    queryKey: ['parent-children'],
    queryFn: async () => {
      const res = await api.get('/auth/profile');
      const profile = res.data;
      // The profile includes children for parent role
      return profile.children ?? [];
    },
  });
}

// ─── Teacher Dashboard Stats ────────────────────────────

export interface TeacherDashboardStats {
  classesToday: number;
  attendanceRate: string;
  pendingGrades: string;
  unreadMessages: number;
}

export function useTeacherDashboardStats(teacherId?: string) {
  return useQuery<TeacherDashboardStats>({
    queryKey: ['teacher-dashboard-stats', teacherId],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

      // Fetch timetable + notifications in parallel
      const [timetableRes, notifRes] = await Promise.all([
        api.get(`/academic/timetable/teacher/${teacherId}`),
        api.get('/notifications'),
      ]);

      const timetable: any[] = timetableRes.data ?? [];
      const todayClasses = timetable.filter((t: any) => t.dayOfWeek === dayName);
      const classesToday = todayClasses.length;

      // Get unique class section IDs from today's timetable
      const sectionIds = [...new Set(todayClasses.map((t: any) => t.classSectionId))];

      // Fetch today's attendance for each section in parallel
      let totalStudents = 0;
      let presentStudents = 0;
      if (sectionIds.length > 0) {
        const attendanceResults = await Promise.all(
          sectionIds.map((csId) =>
            api.get('/attendance/class', { params: { classSectionId: csId, date: todayStr } })
              .then((r) => r.data as any[])
              .catch(() => [] as any[]),
          ),
        );
        for (const records of attendanceResults) {
          if (Array.isArray(records)) {
            totalStudents += records.length;
            presentStudents += records.filter((r: any) => r.status === 'PRESENT' || r.status === 'LATE').length;
          }
        }
      }

      const attendanceRate = totalStudents > 0
        ? `${Math.round((presentStudents / totalStudents) * 100)}%`
        : classesToday > 0 ? 'N/A' : '--';

      const notifications: any[] = notifRes.data ?? [];
      const unreadMessages = notifications.filter((n: any) => !n.isRead).length;

      return {
        classesToday,
        attendanceRate,
        pendingGrades: '--',
        unreadMessages,
      };
    },
    enabled: !!teacherId,
  });
}

// ─── Library Dashboard Stats ────────────────────────────

export interface LibraryAnalytics {
  totalBooks: number;
  totalCopies: number;
  availableCopies: number;
  activeLoans: number;
  overdueLoans: number;
  lostBooks: number;
  overdueRate: number;
  popularBooks: { title: string; author: string; loanCount: number }[];
  categories: { category: string; count: number; totalCopies: number }[];
}

// ─── Discipline (Teacher) ───────────────────────────────

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      studentId: string;
      termId: string;
      date: string;
      description: string;
      pointsDeducted: number;
      actionTaken: string;
      location?: string;
    }) => api.post('/discipline/incidents', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-discipline'] });
    },
  });
}

// ════════════════════════════════════════════════════════
// Added for the redesign. Everything below backs a screen in
// docs/mobile-screen-inventory.md; nothing here is speculative.
// ════════════════════════════════════════════════════════

// ─── People ─────────────────────────────────────────────

export interface DirectoryUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  photoUrl?: string | null;
  isActive: boolean;
  code?: string | null;
  nationalId?: string | null;
  student?: { id: string; studentIdNumber: string; classSection?: { name: string } } | null;
  teacher?: { id: string } | null;
}

/** One searchable list of everyone, which on the web is three separate pages. */
export function usePeople(params?: { role?: string; search?: string; page?: number }) {
  return useQuery<{ data: DirectoryUser[]; total: number }>({
    queryKey: ['people', params?.role ?? 'all', params?.search ?? '', params?.page ?? 1],
    queryFn: () =>
      api
        .get('/users', {
          params: { role: params?.role, search: params?.search, page: params?.page ?? 1, limit: 30 },
        })
        .then((r) => (Array.isArray(r.data) ? { data: r.data, total: r.data.length } : r.data)),
    placeholderData: (prev) => prev,
  });
}

export function usePerson(id?: string) {
  return useQuery<DirectoryUser>({
    queryKey: ['person', id],
    queryFn: () => api.get(`/users/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown> & { id?: string }) =>
      id ? api.put(`/users/${id}`, body).then((r) => r.data) : api.post('/users', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['people'] });
      qc.invalidateQueries({ queryKey: ['person'] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people'] }),
  });
}

// ─── Academic structure ─────────────────────────────────

export function useClassLevels() {
  return useQuery<{ id: string; name: string; order: number; stage: string }[]>({
    queryKey: ['class-levels'],
    queryFn: () => api.get('/academic/class-levels').then((r) => r.data),
  });
}

export function useTrades() {
  return useQuery<{ id: string; code: string; name: string; sector: string }[]>({
    queryKey: ['trades'],
    queryFn: () => api.get('/academic/trades').then((r) => r.data),
  });
}

export function useCloseTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reopen }: { id: string; reopen?: boolean }) =>
      api.post(`/academic/terms/${id}/${reopen ? 'reopen' : 'close'}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms'] });
      qc.invalidateQueries({ queryKey: ['current-term'] });
    },
  });
}

// ─── Marks and results ──────────────────────────────────

export interface CompletionRow {
  subjectId: string;
  subjectName: string;
  assessmentTypeId: string;
  assessmentTypeName: string;
  entered: number;
  expected: number;
}

export function useMarksCompletion(classSectionId?: string, termId?: string) {
  return useQuery<CompletionRow[]>({
    queryKey: ['marks-completion', classSectionId, termId],
    queryFn: () =>
      api.get('/marks/completion', { params: { classSectionId, termId } }).then((r) => r.data),
    enabled: !!classSectionId && !!termId,
  });
}

export function useClassTermResults(classSectionId?: string, termId?: string) {
  return useQuery<TermResult[]>({
    queryKey: ['class-term-results', classSectionId, termId],
    queryFn: () =>
      api.get('/marks/term-results/class', { params: { classSectionId, termId } }).then((r) => r.data),
    enabled: !!classSectionId && !!termId,
  });
}

export function useCalculateTermResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { classSectionId: string; termId: string }) =>
      api.post('/marks/term-results/calculate', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-term-results'] }),
  });
}

export function usePublishTermResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { classSectionId: string; termId: string }) =>
      api.post('/marks/term-results/publish', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-term-results'] }),
  });
}

export function useSaveResultComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; teacherComment?: string; headmasterComment?: string }) =>
      api.put(`/marks/term-results/${id}/comment`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-term-results'] }),
  });
}

export function useStudentYearResult(studentId?: string, academicYearId?: string) {
  return useQuery({
    queryKey: ['year-result', studentId, academicYearId],
    queryFn: () =>
      api.get(`/marks/year-results/student/${studentId}`, { params: { academicYearId } }).then((r) => r.data),
    enabled: !!studentId && !!academicYearId,
  });
}

// ─── Attendance ─────────────────────────────────────────

export function useAttendanceDashboard(date?: string) {
  return useQuery({
    queryKey: ['attendance-dashboard', date],
    queryFn: () => api.get('/attendance/dashboard', { params: { date } }).then((r) => r.data),
  });
}

export function useChronicAbsentees() {
  return useQuery<{ studentId: string; studentName: string; absences: number; rate: number }[]>({
    queryKey: ['chronic-absentees'],
    queryFn: () => api.get('/attendance/chronic').then((r) => r.data),
  });
}

export function useNotifyChronic() {
  return useMutation({
    mutationFn: (body?: { studentIds?: string[] }) =>
      api.post('/attendance/chronic/notify', body ?? {}).then((r) => r.data),
  });
}

// ─── Discipline ─────────────────────────────────────────

export function useIncidents(params?: { termId?: string; studentId?: string }) {
  return useQuery<DisciplineIncident[]>({
    queryKey: ['incidents', params?.termId, params?.studentId],
    queryFn: () => api.get('/discipline/incidents', { params }).then((r) => r.data),
  });
}

export function usePendingAppeals() {
  return useQuery({
    queryKey: ['pending-appeals'],
    queryFn: () => api.get('/discipline/appeals/pending').then((r) => r.data),
  });
}

export function useReviewAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: 'APPROVED' | 'REJECTED'; reviewNotes?: string }) =>
      api.put(`/discipline/appeals/${id}/review`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-appeals'] }),
  });
}

export function useDisciplineDashboard(termId?: string) {
  return useQuery({
    queryKey: ['discipline-dashboard', termId],
    queryFn: () => api.get('/discipline/dashboard', { params: { termId } }).then((r) => r.data),
  });
}

// ─── Library ────────────────────────────────────────────

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string | null;
  category?: string | null;
  quantity: number;
  availableCount: number;
  barcode?: string | null;
  shelfLocation?: string | null;
  replacementCost?: number | null;
  isActive: boolean;
}

export function useBooks(search?: string) {
  return useQuery<Book[]>({
    queryKey: ['books', search ?? ''],
    queryFn: () =>
      api
        .get('/library/books', { params: { search, limit: 50 } })
        .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.data ?? []))),
    placeholderData: (prev) => prev,
  });
}

export function useBook(id?: string) {
  return useQuery<Book>({
    queryKey: ['book', id],
    queryFn: () => api.get(`/library/books/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useSaveBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown> & { id?: string }) =>
      id ? api.put(`/library/books/${id}`, body).then((r) => r.data) : api.post('/library/books', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['books'] }),
  });
}

export interface Loan {
  id: string;
  bookId: string;
  borrowerUserId: string;
  checkedOutAt: string;
  dueDate: string;
  returnedAt?: string | null;
  status: string;
  book?: { title: string; author: string };
  borrower?: { firstName: string; lastName: string };
}

export function useActiveLoans() {
  return useQuery<Loan[]>({
    queryKey: ['loans', 'active'],
    queryFn: () => api.get('/library/loans/active').then((r) => r.data),
  });
}

export function useOverdueLoans() {
  return useQuery<Loan[]>({
    queryKey: ['loans', 'overdue'],
    queryFn: () => api.get('/library/loans/overdue').then((r) => r.data),
  });
}

export function useMyLoans() {
  return useQuery<Loan[]>({
    queryKey: ['loans', 'mine'],
    queryFn: () => api.get('/library/loans/my').then((r) => r.data),
  });
}

export function useReportLostBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) => api.post('/library/lost', { loanId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans'] }),
  });
}

export function useSendLoanReminders() {
  return useMutation({
    mutationFn: () => api.post('/library/reminders/send').then((r) => r.data),
  });
}

// ─── Reports, cards, exports ────────────────────────────

export function useIdCardRegistry(params?: { classSectionId?: string }) {
  return useQuery({
    queryKey: ['id-card-registry', params?.classSectionId],
    queryFn: () => api.get('/reports/id-cards/registry', { params }).then((r) => r.data),
  });
}

export function useIssueIdCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentId?: string; classSectionId?: string; force?: boolean }) =>
      body.classSectionId
        ? api.post('/reports/id-cards/issue-bulk', body).then((r) => r.data)
        : api.post('/reports/id-cards/issue', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['id-card-registry'] }),
  });
}

export function useRevokeIdCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => api.post('/reports/id-cards/revoke', { studentId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['id-card-registry'] }),
  });
}

export function useGenerateDocument() {
  return useMutation({
    mutationFn: (body: { studentId: string; documentType: string }) =>
      api.post('/reports/document', body).then((r) => r.data),
  });
}

// ─── Promotion ──────────────────────────────────────────

export interface PromotionRow {
  studentId: string;
  studentName: string;
  average: number | null;
  disciplinePoints: number;
  passedAcademic: boolean;
  passedDiscipline: boolean;
  recommendation: string;
}

export function usePromotionPreview(body?: { fromClassSectionId?: string; academicYearId?: string }) {
  return useQuery<{ rows: PromotionRow[] } | PromotionRow[]>({
    queryKey: ['promotion-preview', body?.fromClassSectionId, body?.academicYearId],
    queryFn: () => api.post('/academic/promote/preview', body).then((r) => r.data),
    enabled: !!body?.fromClassSectionId && !!body?.academicYearId,
  });
}

export function useCommitPromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { academicYearId: string; decisions: { studentId: string; promote: boolean; toClassSectionId?: string }[] }) =>
      api.post('/academic/promote/commit', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotion-preview'] }),
  });
}

// ─── Analytics ──────────────────────────────────────────

export function useAdminAnalytics(view: string, params?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ['admin-analytics', view, JSON.stringify(params ?? {})],
    queryFn: () => api.get(`/analytics/admin/${view}`, { params }).then((r) => r.data),
  });
}

export function useStudentAnalytics(studentId?: string, termId?: string) {
  return useQuery({
    queryKey: ['student-analytics', studentId, termId],
    queryFn: () => api.get(`/analytics/student/${studentId}`, { params: { termId } }).then((r) => r.data),
    enabled: !!studentId,
  });
}

export function useParentChildTrends(studentId?: string, academicYearId?: string) {
  return useQuery({
    queryKey: ['child-trends', studentId, academicYearId],
    queryFn: () =>
      api.get(`/analytics/parent/child/${studentId}/trends`, { params: { academicYearId } }).then((r) => r.data),
    enabled: !!studentId,
  });
}

// ─── Messaging ──────────────────────────────────────────

export interface Conversation {
  id: string;
  type: string;
  name?: string | null;
  participants?: { user: { id: string; firstName: string; lastName: string; photoUrl?: string | null } }[];
  lastMessage?: { content: string; createdAt: string; contentType: string } | null;
  unreadCount?: number;
}

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => api.get('/messaging/conversations').then((r) => r.data),
  });
}

export function useContacts() {
  return useQuery<{ id: string; firstName: string; lastName: string; role: string; photoUrl?: string | null }[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/messaging/contacts').then((r) => r.data),
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: string; participantIds: string[]; name?: string }) =>
      api.post('/messaging/conversations', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

// ─── School settings ────────────────────────────────────

export function useSchoolConfig() {
  return useQuery<Record<string, string>>({
    queryKey: ['school-config'],
    queryFn: () => api.get('/school-config').then((r) => r.data),
  });
}

export function useSaveSchoolConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; value: string }) => api.put('/school-config', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-config'] });
      qc.invalidateQueries({ queryKey: ['branding'] });
    },
  });
}

export function useOnboardingStatus() {
  return useQuery<{ currentStep: string; completed: boolean }>({
    queryKey: ['onboarding'],
    queryFn: () => api.get('/school-config/onboarding').then((r) => r.data),
  });
}

// ─── Sessions ───────────────────────────────────────────

export function useSessions() {
  return useQuery<{ id: string; deviceInfo?: string; ipAddress?: string; createdAt: string; expiresAt: string }[]>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/auth/sessions').then((r) => r.data),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', body).then((r) => r.data),
  });
}

// ─── Pocket money ───────────────────────────────────────
// A boarding school holds a child's cash. The counter is a phone in a
// matron's hand, not a desk, which is why this belongs on mobile at all.

export interface PocketMoneyAccount {
  studentId: string;
  student: { name: string; studentIdNumber: string; level: string; photoUrl: string | null };
  balance: number;
  spentToday: number;
  dailyLimit: number | null;
  remainingToday: number | null;
  lowBalanceAlert: number | null;
  isFrozen: boolean;
  isLow: boolean;
}

export interface PocketMoneyEntry {
  id: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL' | 'REFUND' | 'REVERSAL' | 'ADJUSTMENT';
  amount: number;
  signedAmount: number;
  note: string | null;
  createdAt: string;
  recordedBy: string | null;
  reversesId: string | null;
  isReversed: boolean;
}

export function usePocketMoneyAccount(studentId?: string) {
  return useQuery<PocketMoneyAccount>({
    queryKey: ['pocket-money', studentId],
    queryFn: () => api.get(`/pocket-money/student/${studentId}`).then((r) => r.data),
    enabled: !!studentId,
  });
}

export function usePocketMoneyStatement(studentId?: string) {
  return useQuery<{ data: PocketMoneyEntry[]; meta: unknown }>({
    queryKey: ['pocket-money-statement', studentId],
    queryFn: () =>
      api.get(`/pocket-money/student/${studentId}/statement`, { params: { limit: 50 } }).then((r) => r.data),
    enabled: !!studentId,
  });
}

/**
 * A scan resolves the card to the student holding it.
 *
 * The field is `identifier`, matching LookupDto. The API validates with
 * `forbidNonWhitelisted`, so any other name is a 400 on every single scan.
 */
export function useLookupAccount() {
  return useMutation<PocketMoneyAccount, unknown, string>({
    mutationFn: (identifier: string) =>
      api.post('/pocket-money/lookup', { identifier }).then((r) => r.data),
  });
}

export function usePocketMoneyMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, ...body }: { kind: 'deposit' | 'withdraw' | 'refund'; studentId: string; amount: number; note?: string }) =>
      api.post(`/pocket-money/${kind}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pocket-money'] });
      qc.invalidateQueries({ queryKey: ['pocket-money-statement'] });
    },
  });
}

// ─── Activities ─────────────────────────────────────────

export interface Activity {
  id: string;
  kind: 'CLUB' | 'SPORT' | 'ASSEMBLY' | 'TRIP' | 'VISITING_DAY' | 'SCHOOL_EVENT';
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  requiresConsent: boolean;
  tracksAttendance: boolean;
  isCancelled: boolean;
  cancelledReason: string | null;
  myPlace?: { id: string; consent: 'PENDING' | 'GIVEN' | 'REFUSED'; attended: boolean | null } | null;
}

export function useUpcomingActivities(limit = 10) {
  return useQuery<Activity[]>({
    queryKey: ['activities-upcoming', limit],
    queryFn: () => api.get('/activities/upcoming', { params: { limit } }).then((r) => r.data),
  });
}

export function useStudentActivities(studentId?: string) {
  return useQuery<Activity[]>({
    queryKey: ['activities-student', studentId],
    queryFn: () => api.get(`/activities/student/${studentId}`).then((r) => r.data),
    enabled: !!studentId,
  });
}

/**
 * A parent answering a permission slip from their phone.
 *
 * This is the whole reason activities are on mobile: the slip in the schoolbag
 * is why offices spend the evening before a trip on the telephone.
 */
export function useRecordConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, ...body }: { activityId: string; studentId: string; consent: 'GIVEN' | 'REFUSED'; note?: string }) =>
      api.post(`/activities/${activityId}/consent`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities-student'] });
      qc.invalidateQueries({ queryKey: ['activities-upcoming'] });
    },
  });
}

// ─── The clinic ─────────────────────────────────────────

export interface ClinicVisit {
  id: string;
  complaint: string;
  findings: string | null;
  treatment: string | null;
  severity: 'MINOR' | 'MODERATE' | 'SERIOUS';
  outcome: 'RETURNED_TO_CLASS' | 'RESTING_IN_SICK_BAY' | 'REFERRED_OUT' | 'SENT_HOME';
  temperature: number | null;
  referredTo: string | null;
  visitedAt: string;
  dischargedAt: string | null;
  parentNotifiedAt: string | null;
  student: {
    id: string;
    studentIdNumber: string;
    bloodType: string | null;
    allergies: string | null;
    classSection?: { name: string; classLevel?: { name: string } };
    user: { firstName: string; lastName: string; photoUrl: string | null };
  };
  seenBy: { firstName: string; lastName: string; role: string };
  medications?: { id: string; medicine: string; dose: string; givenAt: string }[];
}

export function useClinicVisits(params: Record<string, string | number> = {}) {
  return useQuery<{ data: ClinicVisit[]; meta: { total: number } }>({
    queryKey: ['clinic-visits', params],
    queryFn: () => api.get('/clinic/visits', { params }).then((r) => r.data),
  });
}

export function useClinicSummary(days = 30) {
  return useQuery<{
    days: number;
    visits: number;
    inSickBay: number;
    referred: number;
    dosesGiven: number;
    repeatVisitors: { id: string; user: { firstName: string; lastName: string }; visits: number }[];
  }>({
    queryKey: ['clinic-summary', days],
    queryFn: () => api.get('/clinic/summary', { params: { days } }).then((r) => r.data),
  });
}

/** The one page somebody needs at three in the morning. */
export function useEmergencyCard(studentId?: string) {
  return useQuery({
    queryKey: ['emergency-card', studentId],
    queryFn: () => api.get(`/clinic/student/${studentId}`).then((r) => r.data),
    enabled: !!studentId,
  });
}

export function useStudentVisits(studentId?: string) {
  return useQuery<{ data: ClinicVisit[] }>({
    queryKey: ['clinic-student-visits', studentId],
    queryFn: () => api.get(`/clinic/student/${studentId}/visits`).then((r) => r.data),
    enabled: !!studentId,
  });
}

export function useCreateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/clinic/visits', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic-visits'] });
      qc.invalidateQueries({ queryKey: ['clinic-summary'] });
    },
  });
}

export function useDischarge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/clinic/visits/${id}/discharge`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-visits'] }),
  });
}

export function useMarkParentNotified() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/clinic/visits/${id}/parent-notified`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-visits'] }),
  });
}

/**
 * A dose given.
 *
 * The API refuses an unsafe repeat and says how long ago the last one was, so
 * the message it sends back is worth showing whole.
 */
export function useGiveMedicine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentId: string; visitId?: string; medicine: string; dose: string; reason?: string }) =>
      api.post('/clinic/medication', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-visits'] }),
  });
}

// ─── Merits ─────────────────────────────────────────────

export function useAwardMerit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/discipline/merits', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merits'] });
      qc.invalidateQueries({ queryKey: ['standing'] });
    },
  });
}

export function useStanding(studentId?: string) {
  return useQuery<{
    points: number;
    ceiling: number;
    pointsToCleanSheet: number;
    meritCount: number;
    incidentCount: number;
    merits: {
      id: string;
      category: string;
      description: string;
      points: number;
      date: string;
      awardedBy: { firstName: string; lastName: string };
    }[];
  }>({
    queryKey: ['standing', studentId],
    queryFn: () => api.get(`/discipline/standing/${studentId}`).then((r) => r.data),
    enabled: !!studentId,
  });
}
