"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

export function useHomeworks(params?: Record<string, string>) {
  const search = params ? new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["homeworks", params],
    queryFn: async () => (await api.get(`/homework?${search}`)).data,
  });
}

export function useHomework(id?: string) {
  return useQuery({
    queryKey: ["homework", id],
    queryFn: async () => (await api.get(`/homework/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/homework", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homeworks"] }); toast.success("Homework created"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useUpdateHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => (await api.put(`/homework/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homeworks"] }); toast.success("Homework updated"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useDeleteHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/homework/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homeworks"] }); toast.success("Homework deleted"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useSubmitHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/homework/submit", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["student-homework"] }); toast.success("Submitted"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useGradeSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => (await api.put(`/homework/submissions/${id}/grade`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homework"] }); toast.success("Graded"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useStudentHomework(studentId?: string, classSectionId?: string) {
  return useQuery({
    queryKey: ["student-homework", studentId, classSectionId],
    queryFn: async () => (await api.get(`/homework/student/${studentId}`, { params: { classSectionId } })).data,
    enabled: !!studentId && !!classSectionId,
  });
}
