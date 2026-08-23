import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** The sick bay: visits, doses given, and the emergency card. */

export type ClinicSeverity = "MINOR" | "MODERATE" | "SERIOUS";

export type ClinicOutcome =
  | "RETURNED_TO_CLASS"
  | "RESTING_IN_SICK_BAY"
  | "REFERRED_OUT"
  | "SENT_HOME";

export interface ClinicVisit {
  id: string;
  complaint: string;
  findings: string | null;
  treatment: string | null;
  severity: ClinicSeverity;
  outcome: ClinicOutcome;
  temperature: number | null;
  referredTo: string | null;
  visitedAt: string;
  dischargedAt: string | null;
  parentNotifiedAt: string | null;
  student: {
    id: string;
    studentIdNumber: string;
    bloodType: string | null;
    allergies: string | null;
    isBoarder: boolean;
    classSection?: { name: string; classLevel?: { name: string } };
    user: { firstName: string; lastName: string; photoUrl: string | null };
  };
  seenBy: { firstName: string; lastName: string; role: string };
  medications?: { id: string; medicine: string; dose: string; givenAt: string }[];
}

export interface Dose {
  id: string;
  medicine: string;
  dose: string;
  reason: string | null;
  givenAt: string;
  givenBy: { firstName: string; lastName: string };
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["clinic"] });
}

export function useClinicVisits(filters: {
  studentId?: string;
  severity?: string;
  outcome?: string;
  from?: string;
  to?: string;
  inSickBay?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["clinic", "visits", filters],
    queryFn: async () => (await api.get("/clinic/visits", { params: filters })).data,
  });
}

export function useClinicVisit(id?: string) {
  return useQuery({
    queryKey: ["clinic", "visit", id],
    queryFn: async () => (await api.get(`/clinic/visits/${id}`)).data,
    enabled: !!id,
  });
}

export function useClinicSummary(days = 30) {
  return useQuery({
    queryKey: ["clinic", "summary", days],
    queryFn: async () =>
      (await api.get("/clinic/summary", { params: { days } })).data,
  });
}

/** The emergency card, plus the recent history somebody would want with it. */
export function useEmergencyCard(studentId?: string) {
  return useQuery({
    queryKey: ["clinic", "card", studentId],
    queryFn: async () => (await api.get(`/clinic/student/${studentId}`)).data,
    enabled: !!studentId,
  });
}

export function useStudentVisits(studentId?: string) {
  return useQuery({
    queryKey: ["clinic", "student-visits", studentId],
    queryFn: async () =>
      (await api.get(`/clinic/student/${studentId}/visits`)).data,
    enabled: !!studentId,
  });
}

export function useStudentMedication(studentId?: string) {
  return useQuery<Dose[]>({
    queryKey: ["clinic", "student-medication", studentId],
    queryFn: async () =>
      (await api.get(`/clinic/student/${studentId}/medication`)).data,
    enabled: !!studentId,
  });
}

export function useCreateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      (await api.post("/clinic/visits", data)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Visit recorded");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not record it")),
  });
}

export function useUpdateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      (await api.put(`/clinic/visits/${id}`, data)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Saved");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save it")),
  });
}

export function useDischarge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/clinic/visits/${id}/discharge`)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Sent back from the sick bay");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not discharge")),
  });
}

/**
 * Recording that the family has been told.
 *
 * A parent should not learn from their child that the school kept them in
 * overnight, so this is a dated fact rather than a note somebody remembers.
 */
export function useMarkParentNotified() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/clinic/visits/${id}/parent-notified`)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Noted that the family has been told");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not record that")),
  });
}

/**
 * A dose given.
 *
 * The API refuses an unsafe repeat and says how long ago the last one was, so
 * the error is worth showing in full rather than replacing with our own words.
 */
export function useGiveMedicine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      (await api.post("/clinic/medication", data)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Dose recorded");
    },
    onError: (e: unknown) =>
      toast.error(errorMessage(e, "Could not record the dose")),
  });
}

export function useSaveHealthRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studentId,
      ...data
    }: { studentId: string } & Record<string, unknown>) =>
      (await api.put(`/clinic/student/${studentId}`, data)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Emergency card saved");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save it")),
  });
}
