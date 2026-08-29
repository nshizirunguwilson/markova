"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Payload, PayloadWithId } from "./types";
import { errorMessage } from "@/lib/errors";

// ─── Academic Years ─────────────────────────────────────────────────────────

export function useAcademicYears() {
  return useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => (await api.get("/academic/years")).data,
  });
}

export function useCreateAcademicYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/years", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academic-years"] }); toast.success("Academic year created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

// ─── Terms ──────────────────────────────────────────────────────────────────

export function useTerms(academicYearId?: string) {
  return useQuery({
    queryKey: ["terms", academicYearId],
    queryFn: async () => {
      const params = academicYearId ? `?academicYearId=${academicYearId}` : "";
      return (await api.get(`/academic/terms${params}`)).data;
    },
  });
}

export function useCreateTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/terms", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); toast.success("Term created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useCloseTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/academic/terms/${id}/close`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); toast.success("Term closed"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to close term")),
  });
}

export function useReopenTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/academic/terms/${id}/reopen`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); toast.success("Term reopened"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to reopen term")),
  });
}

// ─── Student Promotion ─────────────────────────────────────────────────────

export function usePromoteStudents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      fromClassSectionId: string;
      toClassSectionId: string;
      academicYearId: string;
      passThreshold?: number;
    }) => (await api.post("/academic/promote", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sections"] }); toast.success("Students promoted successfully"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Promotion failed")),
  });
}

export function usePromotionPreview() {
  return useMutation({
    mutationFn: async (data: {
      fromClassSectionId: string;
      academicYearId: string;
      passThreshold?: number;
      disciplineThreshold?: number;
    }) => (await api.post("/academic/promote/preview", data)).data,
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to load students")),
  });
}

export function useCommitPromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      academicYearId: string;
      toClassSectionId: string;
      decisions: { studentId: string; decision: "PROMOTE" | "RETAIN" }[];
    }) => (await api.post("/academic/promote/commit", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sections"] }); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to commit")),
  });
}

// ─── Class Levels ───────────────────────────────────────────────────────────

/**
 * How a mark becomes a grade.
 *
 * Reference material rather than a record, so it is cached hard: it changes
 * when the school changes its scales, which is once a curriculum reform, and
 * refetching it on every focus would be asking a settled question repeatedly.
 */
export function useGradingScale() {
  return useQuery({
    queryKey: ["grading-scale"],
    queryFn: async () => (await api.get("/academic/grading-scale")).data,
    staleTime: Infinity,
  });
}

export function useClassLevels() {
  return useQuery({
    queryKey: ["class-levels"],
    queryFn: async () => (await api.get("/academic/class-levels")).data,
  });
}

export function useCreateClassLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/class-levels", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Class level created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useUpdateClassLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/academic/class-levels/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Class level updated"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDeleteClassLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/class-levels/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Class level deleted"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

// ─── Trades (A-Level TVET sections) ─────────────────────────────────────────

export function useTrades() {
  return useQuery({
    queryKey: ["trades"],
    queryFn: async () => (await api.get("/academic/trades")).data,
  });
}

export function useCreateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/trades", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trades"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Trade created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useUpdateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/academic/trades/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trades"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Trade updated"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDeleteTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/trades/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trades"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Trade deleted"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

// ─── Class Sections ─────────────────────────────────────────────────────────

export function useSections(classLevelId?: string) {
  return useQuery({
    queryKey: ["sections", classLevelId],
    queryFn: async () => {
      const params = classLevelId ? `?classLevelId=${classLevelId}` : "";
      return (await api.get(`/academic/sections${params}`)).data;
    },
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/sections", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sections"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Section created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/academic/sections/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sections"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Section updated"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/sections/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sections"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Section deleted"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

// ─── Subjects ───────────────────────────────────────────────────────────────

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get("/academic/subjects")).data,
  });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/subjects", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); toast.success("Subject created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useUpdateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/academic/subjects/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); toast.success("Subject updated"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDeleteSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/subjects/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); toast.success("Subject deleted"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

// ─── Assessment Types ───────────────────────────────────────────────────────

export function useAssessmentTypes() {
  return useQuery({
    queryKey: ["assessment-types"],
    queryFn: async () => (await api.get("/academic/assessment-types")).data,
  });
}

export function useCreateAssessmentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/assessment-types", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assessment-types"] }); toast.success("Assessment type created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

// ─── Assignments ────────────────────────────────────────────────────────────

export function useAssignments(filters?: { teacherId?: string; classSectionId?: string; academicYearId?: string }) {
  return useQuery({
    queryKey: ["assignments", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.teacherId) params.set("teacherId", filters.teacherId);
      if (filters?.classSectionId) params.set("classSectionId", filters.classSectionId);
      if (filters?.academicYearId) params.set("academicYearId", filters.academicYearId);
      return (await api.get(`/academic/assignments?${params}`)).data;
    },
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/assignments", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assignments"] }); toast.success("Assignment created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useBulkAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/assignments/bulk", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assignments"] }); toast.success("Assignments created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/assignments/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assignments"] }); toast.success("Assignment deleted"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

// ─── Timetable (weekly schedule: day/time/room) ──────────────────────────────

export function useTimetable(classSectionId?: string, teacherId?: string) {
  return useQuery({
    queryKey: ["timetable", classSectionId, teacherId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (classSectionId) params.set("classSectionId", classSectionId);
      if (teacherId) params.set("teacherId", teacherId);
      return (await api.get(`/academic/timetable?${params}`)).data;
    },
    enabled: !!classSectionId,
  });
}

export function useCreateTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/academic/timetable", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timetable"] }); toast.success("Lesson added"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to add lesson")),
  });
}

export function useUpdateTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/academic/timetable/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timetable"] }); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to update lesson")),
  });
}

export function useDeleteTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/timetable/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timetable"] }); toast.success("Lesson removed"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to remove lesson")),
  });
}

// ─── School Config ──────────────────────────────────────────────────────────

export function useSchoolConfig() {
  return useQuery({
    queryKey: ["school-config"],
    queryFn: async () => (await api.get("/school-config")).data,
  });
}

export function useBulkUpsertConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (configs: { key: string; value: string }[]) =>
      (await api.post("/school-config/bulk", { configs })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["school-config"] }); toast.success("Settings saved"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { currentStep: string; completed?: string }) =>
      (await api.put("/school-config/onboarding", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["school-config"] }),
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "Something went wrong"));
    },
  });
}
