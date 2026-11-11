"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Payload, PayloadWithId } from "./types";
import { errorMessage } from "@/lib/errors";

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
    mutationFn: async (data: Payload) => (await api.post("/homework", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homeworks"] }); toast.success("Homework created"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useUpdateHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/homework/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homeworks"] }); toast.success("Homework updated"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDeleteHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/homework/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homeworks"] }); toast.success("Homework deleted"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

/**
 * Upload the sheet a piece of work is set on (a past paper, a worksheet).
 * Answers with where it landed and the name it had; the create or update
 * then names both.
 */
export function useUploadSheet() {
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return (
        await api.post("/homework/upload", body, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data as { fileUrl: string; fileName: string };
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "The file could not be uploaded")),
  });
}

export function useSubmitHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/homework/submit", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["student-homework"] }); toast.success("Submitted"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useGradeSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/homework/submissions/${id}/grade`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homework"] }); toast.success("Graded"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useStudentHomework(studentId?: string, classSectionId?: string) {
  return useQuery({
    queryKey: ["student-homework", studentId, classSectionId],
    queryFn: async () => (await api.get(`/homework/student/${studentId}`, { params: { classSectionId } })).data,
    enabled: !!studentId && !!classSectionId,
  });
}
