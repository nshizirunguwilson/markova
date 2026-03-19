"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

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
    mutationFn: async (data: any) => (await api.post("/academic/years", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academic-years"] }); toast.success("Academic year created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    mutationFn: async (data: any) => (await api.post("/academic/terms", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); toast.success("Term created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

// ─── Class Levels ───────────────────────────────────────────────────────────

export function useClassLevels() {
  return useQuery({
    queryKey: ["class-levels"],
    queryFn: async () => (await api.get("/academic/class-levels")).data,
  });
}

export function useCreateClassLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/academic/class-levels", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Class level created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useUpdateClassLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => (await api.put(`/academic/class-levels/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Class level updated"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useDeleteClassLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/class-levels/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Class level deleted"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    mutationFn: async (data: any) => (await api.post("/academic/sections", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sections"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Section created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => (await api.put(`/academic/sections/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sections"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Section updated"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/sections/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sections"] }); qc.invalidateQueries({ queryKey: ["class-levels"] }); toast.success("Section deleted"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    mutationFn: async (data: any) => (await api.post("/academic/subjects", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); toast.success("Subject created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useUpdateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => (await api.put(`/academic/subjects/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); toast.success("Subject updated"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useDeleteSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/subjects/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); toast.success("Subject deleted"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    mutationFn: async (data: any) => (await api.post("/academic/assessment-types", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assessment-types"] }); toast.success("Assessment type created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    mutationFn: async (data: any) => (await api.post("/academic/assignments", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assignments"] }); toast.success("Assignment created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useBulkAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/academic/assignments/bulk", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assignments"] }); toast.success("Assignments created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/academic/assignments/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assignments"] }); toast.success("Assignment deleted"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { currentStep: string; completed?: string }) =>
      (await api.put("/school-config/onboarding", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["school-config"] }),
  });
}
