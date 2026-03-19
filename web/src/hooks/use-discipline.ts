"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

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
    mutationFn: async (data: any) => (await api.post("/discipline/incidents", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["discipline-dashboard"] });
      toast.success("Incident recorded");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    mutationFn: async (data: any) => (await api.post("/discipline/appeals", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["student-discipline"] });
      qc.invalidateQueries({ queryKey: ["pending-appeals"] });
      toast.success("Appeal submitted");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    mutationFn: async ({ id, ...data }: any) => (await api.put(`/discipline/appeals/${id}/review`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-appeals"] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
      toast.success("Appeal reviewed");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useDisciplineDashboard(termId?: string) {
  return useQuery({
    queryKey: ["discipline-dashboard", termId],
    queryFn: async () => (await api.get("/discipline/dashboard", { params: { termId } })).data,
  });
}
