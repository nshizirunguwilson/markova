"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

export function useTermReport(studentId: string, termId: string) {
  return useQuery({
    queryKey: ["reports", "term", studentId, termId],
    queryFn: async () => (await api.get(`/reports/term/${studentId}`, { params: { termId } })).data,
    enabled: !!studentId && !!termId,
  });
}

export function useTermReportHtml(studentId: string, termId: string) {
  return useQuery({
    queryKey: ["reports", "term", "html", studentId, termId],
    queryFn: async () => (await api.get(`/reports/term/${studentId}/html`, { params: { termId } })).data,
    enabled: false,
  });
}

export function useGenerateClassReports() {
  return useMutation({
    mutationFn: async (data: { classSectionId: string; termId: string }) =>
      (await api.post("/reports/term/class", data)).data,
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Something went wrong');
    },
  });
}

export function useYearReport(studentId: string, academicYearId: string) {
  return useQuery({
    queryKey: ["reports", "year", studentId, academicYearId],
    queryFn: async () => (await api.get(`/reports/year/${studentId}`, { params: { academicYearId } })).data,
    enabled: !!studentId && !!academicYearId,
  });
}

export function useGenerateDocument() {
  return useMutation({
    mutationFn: async (data: { studentId: string; type: string }) =>
      (await api.post("/reports/document", data)).data,
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Something went wrong');
    },
  });
}

export function useIdCard(studentId: string) {
  return useQuery({
    queryKey: ["reports", "id-card", studentId],
    queryFn: async () => (await api.get(`/reports/id-card/${studentId}`)).data,
    enabled: !!studentId,
  });
}

export function useBulkIdCards() {
  return useMutation({
    mutationFn: async (data: { classSectionId: string }) =>
      (await api.post("/reports/id-cards/bulk", data)).data,
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Something went wrong');
    },
  });
}
