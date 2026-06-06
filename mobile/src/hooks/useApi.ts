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

export function useClassAttendance(classSectionId?: string, date?: string) {
  return useQuery<AttendanceRecord[]>({
    queryKey: ['class-attendance', classSectionId, date],
    queryFn: () =>
      api
        .get('/attendance/class', { params: { classSectionId, date } })
        .then((r) => r.data),
    enabled: !!classSectionId && !!date,
  });
}

export function useClassStudents(classSectionId?: string) {
  return useQuery<Student[]>({
    queryKey: ['class-students', classSectionId],
    queryFn: () =>
      api.get('/users', { params: { role: 'STUDENT', classSectionId } }).then((r) => r.data?.users ?? r.data),
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

export function useStudentMarks(studentId?: string, termId?: string) {
  return useQuery<Mark[]>({
    queryKey: ['student-marks', studentId, termId],
    queryFn: () =>
      api.get('/marks', { params: { studentId, termId } }).then((r) => r.data?.data ?? r.data),
    enabled: !!studentId,
  });
}

export function useStudentTermResult(studentId?: string, termId?: string) {
  return useQuery<TermResult>({
    queryKey: ['term-result', studentId, termId],
    queryFn: () =>
      api.get(`/marks/term-results/student/${studentId}`, { params: { termId } }).then((r) => r.data),
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
    // /library/analytics is ADMIN/LIBRARIAN only — don't fire it for students.
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
