import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** Clubs, matches, assemblies, visiting day and trips. */

export type ActivityKind =
  | "CLUB"
  | "SPORT"
  | "ASSEMBLY"
  | "TRIP"
  | "VISITING_DAY"
  | "SCHOOL_EVENT";

export type ConsentState = "PENDING" | "GIVEN" | "REFUSED";

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  audience: "WHOLE_SCHOOL" | "LEVELS" | "CLASSES";
  requiresConsent: boolean;
  tracksAttendance: boolean;
  capacity: number | null;
  isCancelled: boolean;
  cancelledReason: string | null;
  classLevels?: { classLevel: { id: string; name: string } }[];
  sections?: { classSection: { id: string; name: string } }[];
  _count?: { participants: number };
  myPlace?: { id: string; consent: ConsentState; attended: boolean | null } | null;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["activities"] });
}

export function useActivities(filters: {
  kind?: string;
  from?: string;
  to?: string;
  includeCancelled?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["activities", "list", filters],
    queryFn: async () => (await api.get("/activities", { params: filters })).data,
  });
}

export function useUpcomingActivities(limit = 5) {
  return useQuery<Activity[]>({
    queryKey: ["activities", "upcoming", limit],
    queryFn: async () =>
      (await api.get("/activities/upcoming", { params: { limit } })).data,
  });
}

export function useActivity(id?: string) {
  return useQuery({
    queryKey: ["activities", "one", id],
    queryFn: async () => (await api.get(`/activities/${id}`)).data,
    enabled: !!id,
  });
}

export function useStudentActivities(studentId?: string) {
  return useQuery<Activity[]>({
    queryKey: ["activities", "student", studentId],
    queryFn: async () => (await api.get(`/activities/student/${studentId}`)).data,
    enabled: !!studentId,
  });
}

/** Who has agreed, who refused, and who has not answered. */
export function useConsentSummary(activityId?: string) {
  return useQuery({
    queryKey: ["activities", "consent", activityId],
    queryFn: async () => (await api.get(`/activities/${activityId}/consent`)).data,
    enabled: !!activityId,
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      (await api.post("/activities", data)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Added to the calendar");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not add it")),
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      (await api.put(`/activities/${id}`, data)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Saved");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save it")),
  });
}

/**
 * Calling something off, rather than deleting it.
 *
 * A cancelled trip is a thing that happened: families who already gave consent
 * need to see why it is not going ahead.
 */
export function useCancelActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.post(`/activities/${id}/cancel`, { reason })).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Called off. Everyone concerned can see why.");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not cancel it")),
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/activities/${id}`)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Removed");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not remove it")),
  });
}

export function useAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ activityId, studentId }: { activityId: string; studentId: string }) =>
      (await api.post(`/activities/${activityId}/participants`, { studentId })).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Added to the list");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not add them")),
  });
}

export function useAddClassToActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ activityId, classSectionId }: { activityId: string; classSectionId: string }) =>
      (await api.post(`/activities/${activityId}/participants/class`, { classSectionId })).data,
    onSuccess: (res: any) => {
      invalidate(qc);
      toast.success(`${res?.added ?? 0} added to the list`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not add the class")),
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ activityId, studentId }: { activityId: string; studentId: string }) =>
      (await api.delete(`/activities/${activityId}/participants/${studentId}`)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Taken off the list");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not remove them")),
  });
}

export function useRecordConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      activityId,
      ...data
    }: {
      activityId: string;
      studentId: string;
      consent: ConsentState;
      note?: string;
    }) => (await api.post(`/activities/${activityId}/consent`, data)).data,
    onSuccess: (_res, vars) => {
      invalidate(qc);
      toast.success(
        vars.consent === "GIVEN" ? "Permission given" : "Recorded as refused",
      );
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not record that")),
  });
}

export function useActivityAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      activityId,
      records,
    }: {
      activityId: string;
      records: { studentId: string; attended: boolean }[];
    }) => (await api.post(`/activities/${activityId}/attendance`, { records })).data,
    onSuccess: (res: any) => {
      invalidate(qc);
      toast.success(`Register taken for ${res?.marked ?? 0}`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not take the register")),
  });
}
