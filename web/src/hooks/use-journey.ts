import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/**
 * A student's journey: where they stand, and every step that brought them
 * there. See docs/STUDENT-LIFE-DESIGN.md.
 */
export function useJourney(studentId: string | null | undefined) {
  return useQuery({
    queryKey: ["journey", studentId],
    queryFn: async () => (await api.get(`/students/${studentId}/journey`)).data,
    enabled: !!studentId,
  });
}

export type JourneyAction =
  | "suspend"
  | "away"
  | "back"
  | "leave"
  | "passed-away"
  | "readmit";

const DONE: Record<JourneyAction, string> = {
  suspend: "Suspended",
  away: "Recorded as away",
  back: "Back at school",
  leave: "Taken off the roll",
  "passed-away": "Recorded",
  readmit: "Back on the roll",
};

/** One step on a student's journey. */
export function useJourneyStep(studentId: string, userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      action,
      body,
    }: {
      action: JourneyAction;
      body: Record<string, unknown>;
    }) => (await api.post(`/students/${studentId}/journey/${action}`, body)).data,
    onSuccess: (_res, { action }) => {
      qc.invalidateQueries({ queryKey: ["journey", studentId] });
      if (userId) qc.invalidateQueries({ queryKey: ["user", userId] });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(DONE[action]);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save that")),
  });
}

/** A parent or guardian who passed away. */
export function useParentPassedAway(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { on: string; note?: string }) =>
      (await api.post(`/users/${userId}/passed-away`, body)).data,
    onSuccess: (res: { childrenWithoutGuardian?: string[] }) => {
      qc.invalidateQueries({ queryKey: ["user", userId] });
      qc.invalidateQueries({ queryKey: ["users"] });
      const alone = res?.childrenWithoutGuardian?.length ?? 0;
      toast.success(
        alone > 0
          ? `Recorded. ${alone === 1 ? "One child has" : `${alone} children have`} no parent or guardian left: add who looks after them now.`
          : "Recorded",
      );
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save that")),
  });
}
