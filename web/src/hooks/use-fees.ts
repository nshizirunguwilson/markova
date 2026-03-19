"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useFees(params?: { studentId?: string; academicYearId?: string; termId?: string; status?: string }) {
  return useQuery({
    queryKey: ["fees", params],
    queryFn: async () => (await api.get("/fees", { params })).data,
  });
}

export function useStudentFees(studentId: string) {
  return useQuery({
    queryKey: ["fees", "student", studentId],
    queryFn: async () => (await api.get(`/fees/student/${studentId}`)).data,
    enabled: !!studentId,
  });
}

export function useFeeSummary(academicYearId?: string, termId?: string) {
  return useQuery({
    queryKey: ["fees", "summary", academicYearId, termId],
    queryFn: async () => (await api.get("/fees/summary", { params: { academicYearId, termId } })).data,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => (await api.post("/fees", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees"] }),
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Record<string, unknown>) =>
      (await api.patch(`/fees/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees"] }),
  });
}

export function useFeeReceipt(id: string) {
  return useQuery({
    queryKey: ["fees", "receipt", id],
    queryFn: async () => (await api.get(`/fees/${id}/receipt`)).data,
    enabled: false,
  });
}
