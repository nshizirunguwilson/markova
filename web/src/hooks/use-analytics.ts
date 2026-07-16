"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useAdminDashboard(academicYearId?: string, termId?: string) {
  return useQuery({
    queryKey: ["analytics", "admin", "dashboard", academicYearId, termId],
    queryFn: async () => (await api.get("/analytics/admin/dashboard", { params: { academicYearId, termId } })).data,
  });
}

export function usePerformanceTrends(academicYearId: string) {
  return useQuery({
    queryKey: ["analytics", "admin", "trends", academicYearId],
    queryFn: async () => (await api.get("/analytics/admin/performance-trends", { params: { academicYearId } })).data,
    enabled: !!academicYearId,
  });
}

export function useClassComparisons(termId: string) {
  return useQuery({
    queryKey: ["analytics", "admin", "class-comparisons", termId],
    queryFn: async () => (await api.get("/analytics/admin/class-comparisons", { params: { termId } })).data,
    enabled: !!termId,
  });
}

export function useDisciplineStats(academicYearId?: string) {
  return useQuery({
    queryKey: ["analytics", "admin", "discipline", academicYearId],
    queryFn: async () => (await api.get("/analytics/admin/discipline", { params: { academicYearId } })).data,
  });
}

export function useLibraryAnalytics() {
  return useQuery({
    queryKey: ["analytics", "admin", "library"],
    queryFn: async () => (await api.get("/analytics/admin/library")).data,
  });
}

export function useAttendanceAnalytics(termId?: string) {
  return useQuery({
    queryKey: ["analytics", "admin", "attendance", termId],
    queryFn: async () => (await api.get("/analytics/admin/attendance", { params: { termId } })).data,
  });
}

export function useGradeDistribution(termId?: string) {
  return useQuery({
    queryKey: ["analytics", "admin", "grade-distribution", termId],
    queryFn: async () => (await api.get("/analytics/admin/grade-distribution", { params: { termId } })).data,
  });
}

export function useEnrollment() {
  return useQuery({
    queryKey: ["analytics", "admin", "enrollment"],
    queryFn: async () => (await api.get("/analytics/admin/enrollment")).data,
  });
}

export function useTeacherClassAnalytics(classSectionId: string, termId: string) {
  return useQuery({
    queryKey: ["analytics", "teacher", classSectionId, termId],
    queryFn: async () => (await api.get(`/analytics/teacher/class/${classSectionId}`, { params: { termId } })).data,
    enabled: !!classSectionId && !!termId,
  });
}

export function useStudentAnalytics(studentId: string, termId: string) {
  return useQuery({
    queryKey: ["analytics", "student", studentId, termId],
    queryFn: async () => (await api.get(`/analytics/student/${studentId}`, { params: { termId } })).data,
    enabled: !!studentId && !!termId,
  });
}

export function useParentChildTrends(studentId: string, academicYearId: string) {
  return useQuery({
    queryKey: ["analytics", "parent", studentId, academicYearId],
    queryFn: async () => (await api.get(`/analytics/parent/child/${studentId}/trends`, { params: { academicYearId } })).data,
    enabled: !!studentId && !!academicYearId,
  });
}
