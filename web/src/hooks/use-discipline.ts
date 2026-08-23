"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Payload, PayloadWithId } from "./types";
import { errorMessage } from "@/lib/errors";

export function useIncidents(params?: Record<string, string>) {
  const search = params ? new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["incidents", params],
    queryFn: async () => (await api.get(`/discipline/incidents?${search}`)).data,
  });
}

export function useIncident(id?: string) {
  return useQuery({
    queryKey: ["incident", id],
    queryFn: async () => (await api.get(`/discipline/incidents/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/discipline/incidents", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["discipline-dashboard"] });
      toast.success("Incident recorded");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDeleteIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/discipline/incidents/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      toast.success("Incident deleted, points restored");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useStudentDiscipline(studentId?: string) {
  return useQuery({
    queryKey: ["student-discipline", studentId],
    queryFn: async () => (await api.get(`/discipline/student/${studentId}`)).data,
    enabled: !!studentId,
  });
}

export function useCreateAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/discipline/appeals", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["student-discipline"] });
      qc.invalidateQueries({ queryKey: ["pending-appeals"] });
      toast.success("Appeal submitted");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function usePendingAppeals() {
  return useQuery({
    queryKey: ["pending-appeals"],
    queryFn: async () => (await api.get("/discipline/appeals/pending")).data,
  });
}

export function useReviewAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/discipline/appeals/${id}/review`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-appeals"] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
      toast.success("Appeal reviewed");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useAcknowledgeIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (incidentId: string) => (await api.post("/discipline/acknowledge", { incidentId })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["student-discipline"] });
      toast.success("Incident acknowledged");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDisciplineDashboard(termId?: string) {
  return useQuery({
    queryKey: ["discipline-dashboard", termId],
    queryFn: async () => (await api.get("/discipline/dashboard", { params: { termId } })).data,
  });
}

// ─── MERITS ─────────────────────────────────────────────────────────────────
// The other half of behaviour. A system with only deductions teaches a student
// that the best possible outcome is to be unnoticed.

export type MeritCategory =
  | "ACADEMIC_EFFORT"
  | "HELPING_OTHERS"
  | "LEADERSHIP"
  | "SPORT"
  | "ARTS"
  | "SERVICE"
  | "HONESTY"
  | "IMPROVEMENT";

export interface Merit {
  id: string;
  category: MeritCategory;
  description: string;
  points: number;
  date: string;
  student: {
    id: string;
    studentIdNumber: string;
    disciplinePoints: number;
    classSection?: { name: string; classLevel?: { name: string } };
    user: { firstName: string; lastName: string; photoUrl: string | null };
  };
  awardedBy: { firstName: string; lastName: string; role: string };
}

export function useMerits(params?: Record<string, string>) {
  const search = params ? new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["merits", params],
    queryFn: async () => (await api.get(`/discipline/merits?${search}`)).data,
  });
}

export function useAwardMerit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) =>
      (await api.post("/discipline/merits", data)).data,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["merits"] });
      qc.invalidateQueries({ queryKey: ["merit-summary"] });
      qc.invalidateQueries({ queryKey: ["watch-list"] });
      qc.invalidateQueries({ queryKey: ["standing"] });
      toast.success(
        res?.pointsRestored > 0
          ? `Recorded. ${res.pointsRestored} conduct points restored.`
          : "Recorded. Their conduct score was already clean.",
      );
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not record it")),
  });
}

/** Both sides of one student's ledger, plus how far back to a clean sheet. */
export function useStanding(studentId?: string, termId?: string) {
  return useQuery({
    queryKey: ["standing", studentId, termId],
    queryFn: async () =>
      (
        await api.get(`/discipline/standing/${studentId}`, {
          params: termId ? { termId } : {},
        })
      ).data,
    enabled: !!studentId,
  });
}

/**
 * Who to look at this week.
 *
 * Not "who has the fewest points", which is the same names all year. This is
 * movement: incidents picked up recently with nothing on the other side.
 */
export function useWatchList(days = 30) {
  return useQuery({
    queryKey: ["watch-list", days],
    queryFn: async () =>
      (await api.get("/discipline/merits/watch-list", { params: { days } })).data,
  });
}

export function useMeritSummary(termId?: string, days = 30) {
  return useQuery({
    queryKey: ["merit-summary", termId, days],
    queryFn: async () =>
      (
        await api.get("/discipline/merits/summary", {
          params: { ...(termId ? { termId } : {}), days },
        })
      ).data,
  });
}
