"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

export function useClassAttendance(classSectionId?: string, date?: string) {
  return useQuery({
    queryKey: ["class-attendance", classSectionId, date],
    queryFn: async () =>
      (await api.get("/attendance/class", { params: { classSectionId, date } })).data,
    enabled: !!classSectionId && !!date,
  });
}

export function useBulkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/attendance/bulk", data)).data,
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["class-attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance-dashboard"] });
      toast.success(`${data.count} records saved`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useQrScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/attendance/qr-scan", data)).data,
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["class-attendance"] });
      // Read defensively: a scan that reached the server has been recorded,
      // and the toast naming the student must not be able to report it as a
      // failure just because the response was shaped differently.
      const name = data?.student?.name ?? "Student";
      if (data?.duplicate) {
        toast.info(`${name} already scanned`);
      } else {
        toast.success(`${name}: ${data?.record?.status ?? "recorded"}`);
      }
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Scan failed")),
  });
}

export function useStudentAttendanceSummary(studentId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["student-attendance", studentId, dateFrom, dateTo],
    queryFn: async () =>
      (await api.get("/attendance/student-summary", { params: { studentId, dateFrom, dateTo } })).data,
    enabled: !!studentId,
  });
}

export function useAttendanceDashboard(date?: string) {
  return useQuery({
    queryKey: ["attendance-dashboard", date],
    queryFn: async () => (await api.get("/attendance/dashboard", { params: { date } })).data,
  });
}

export function useChronicallyAbsent(classSectionId?: string, threshold?: number) {
  return useQuery({
    queryKey: ["chronic-absent", classSectionId, threshold],
    queryFn: async () =>
      (await api.get("/attendance/chronic", { params: { classSectionId, threshold } })).data,
  });
}
