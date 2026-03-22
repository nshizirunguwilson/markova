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
  FeeRecord,
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

// ─── Fees ───────────────────────────────────────────────

export function useStudentFees(studentId?: string) {
  return useQuery<FeeRecord[]>({
    queryKey: ['student-fees', studentId],
    queryFn: () => api.get(`/fees/student/${studentId}`).then((r) => r.data),
    enabled: !!studentId,
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
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
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
