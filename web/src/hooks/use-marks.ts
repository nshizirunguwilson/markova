"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Payload, PayloadWithId } from "./types";
import { errorMessage } from "@/lib/errors";

// ─── Marks CRUD ──────────────────────────────────────────────────────────────

export function useMarks(params?: Record<string, string>) {
  const search = params ? new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["marks", params],
    queryFn: async () => (await api.get(`/marks?${search}`)).data,
    enabled: !!params?.termId,
  });
}

export function useCreateMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/marks", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marks"] });
      qc.invalidateQueries({ queryKey: ["marks-completion"] });
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to save mark")),
  });
}

export function useUpdateMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/marks/${id}`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marks"] });
      qc.invalidateQueries({ queryKey: ["marks-completion"] });
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed to update mark")),
  });
}

export function useBatchMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/marks/batch", data)).data,
    onSuccess: (data: Payload) => {
      qc.invalidateQueries({ queryKey: ["marks"] });
      qc.invalidateQueries({ queryKey: ["marks-completion"] });
      toast.success(`${data.count} marks saved`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Batch save failed")),
  });
}

// ─── Completion Tracker ──────────────────────────────────────────────────────

export function useMarksCompletion(classSectionId?: string, termId?: string, subjectId?: string, assessmentTypeId?: string) {
  return useQuery({
    queryKey: ["marks-completion", classSectionId, termId, subjectId, assessmentTypeId],
    queryFn: async () =>
      (await api.get("/marks/completion", { params: { classSectionId, termId, subjectId, assessmentTypeId } })).data,
    enabled: !!classSectionId && !!termId && !!subjectId && !!assessmentTypeId,
  });
}

// ─── Term Results ────────────────────────────────────────────────────────────

export function useTermResults(classSectionId?: string, termId?: string) {
  return useQuery({
    queryKey: ["term-results", classSectionId, termId],
    queryFn: async () =>
      (await api.get("/marks/term-results/class", { params: { classSectionId, termId } })).data,
    enabled: !!classSectionId && !!termId,
  });
}

export function useStudentTermResult(studentId?: string, termId?: string) {
  return useQuery({
    queryKey: ["student-term-result", studentId, termId],
    queryFn: async () =>
      (await api.get(`/marks/term-results/student/${studentId}`, { params: { termId } })).data,
    enabled: !!studentId && !!termId,
  });
}

export function useCalculateTermResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/marks/term-results/calculate", data)).data,
    // Says what it did, not just that it ran. Recalculating an unchanged
    // class produces identical numbers, so without a count the button looks
    // like it does nothing at all.
    onSuccess: (data: Payload) => {
      qc.invalidateQueries({ queryKey: ["term-results"] });
      const n = Number(data?.count ?? 0);
      toast.success(
        n === 0
          ? "No marks recorded for this class yet, so there was nothing to work out"
          : `Worked out totals, grades and positions for ${n} student${n === 1 ? "" : "s"}`,
      );
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Calculation failed")),
  });
}

export function usePublishTermResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/marks/term-results/publish", data)).data,
    // The same endpoint both publishes and withdraws, so the confirmation has
    // to read back what was actually asked for. It said "Results published"
    // either way, which is how unpublishing came to look like it did the
    // opposite of what was pressed.
    onSuccess: (_data: unknown, variables: Payload) => {
      qc.invalidateQueries({ queryKey: ["term-results"] });
      toast.success(
        variables?.isPublished === false
          ? "Results unpublished - students and parents can no longer see them"
          : "Results published - students and parents can now see them",
      );
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Publish failed")),
  });
}

/**
 * Issue or withdraw a class's report cards.
 *
 * Separate from publishing the marks: a school releases marks as soon as they
 * are checked and issues the formal document later, after deliberation and
 * once the head teacher's comments are written.
 */
export function usePublishReportCards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) =>
      (await api.post("/marks/report-cards/publish", data)).data,
    onSuccess: (_data: unknown, variables: Payload) => {
      qc.invalidateQueries({ queryKey: ["term-results"] });
      toast.success(
        variables?.isPublished === false
          ? "Report cards withdrawn - students and parents can no longer open them"
          : "Report cards issued - students and parents can now open them",
      );
    },
    onError: (e: unknown) =>
      toast.error(errorMessage(e, "Could not change the report cards")),
  });
}

export function useUpdateTermResultComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/marks/term-results/${id}/comment`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["term-results"] });
      toast.success("Comment saved");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

// ─── Year Results ────────────────────────────────────────────────────────────

export function useYearResults(classSectionId?: string, academicYearId?: string) {
  return useQuery({
    queryKey: ["year-results", classSectionId, academicYearId],
    queryFn: async () =>
      (await api.get("/marks/year-results/class", { params: { classSectionId, academicYearId } })).data,
    enabled: !!classSectionId && !!academicYearId,
  });
}

export function useStudentYearResult(studentId?: string, academicYearId?: string) {
  return useQuery({
    queryKey: ["student-year-result", studentId, academicYearId],
    queryFn: async () =>
      (await api.get(`/marks/year-results/student/${studentId}`, { params: { academicYearId } })).data,
    enabled: !!studentId && !!academicYearId,
  });
}

export function useCalculateYearResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/marks/year-results/calculate", data)).data,
    onSuccess: (data: Payload) => {
      qc.invalidateQueries({ queryKey: ["year-results"] });
      toast.success(`Calculated year results for ${data.count} students`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Calculation failed")),
  });
}

// ─── Report Card ─────────────────────────────────────────────────────────────

export function useReportCard(studentId?: string, termId?: string) {
  return useQuery({
    queryKey: ["report-card", studentId, termId],
    queryFn: async () => (await api.get(`/marks/report-card/${studentId}`, { params: { termId } })).data,
    enabled: !!studentId && !!termId,
  });
}
