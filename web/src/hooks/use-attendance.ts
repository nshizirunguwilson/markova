"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type { BulkSaveResponse, Payload, ScanResponse } from "./types";
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
    mutationFn: async (data: Payload) => (await api.post("/attendance/bulk", data)).data,
    onSuccess: (data: BulkSaveResponse) => {
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
    mutationFn: async (data: Payload) => (await api.post("/attendance/qr-scan", data)).data,
    onSuccess: (data: ScanResponse) => {
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

/**
 * Tell the families of chronically absent children.
 *
 * The endpoint existed and nothing called it, so a head teacher could see six
 * children were missing school and had to ring each family by hand.
 */
export function useAlertChronicFamilies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post("/attendance/chronic/notify")).data as {
        studentsIdentified: number;
        alertsSent: number;
        unreachable: number;
      },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["chronically-absent"] });
      toast.success(
        r.alertsSent === 0
          ? "Nobody needed telling."
          : `Told ${r.alertsSent} ${r.alertsSent === 1 ? "family" : "families"} about ${r.studentsIdentified} ${r.studentsIdentified === 1 ? "child" : "children"}.`,
      );
      /* Named separately, because this is the half somebody has to act on:
         those families need a phone call rather than a message. */
      if (r.unreachable > 0) {
        toast.warning(
          `${r.unreachable} ${r.unreachable === 1 ? "family has" : "families have"} no email or phone on file and will need a call.`,
        );
      }
    },
    onError: (e) => toast.error(errorMessage(e, "Could not send the alerts")),
  });
}

export function useChronicallyAbsent(classSectionId?: string, threshold?: number) {
  return useQuery({
    queryKey: ["chronic-absent", classSectionId, threshold],
    queryFn: async () =>
      (await api.get("/attendance/chronic", { params: { classSectionId, threshold } })).data,
  });
}
