import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** Support plans for students with special needs (B7). */
export const NEEDS = [
  ["SEEING", "Seeing"],
  ["HEARING", "Hearing"],
  ["MOVING", "Moving about"],
  ["LEARNING", "Learning"],
  ["SPEECH", "Speech"],
  ["LONG_TERM_ILLNESS", "Long-term illness"],
  ["OTHER", "Other"],
] as const;

export const ARRANGEMENTS = [
  ["EXTRA_TIME", "Extra time"],
  ["READER", "A reader"],
  ["SCRIBE", "A scribe"],
  ["LARGE_PRINT", "Large print"],
  ["BRAILLE", "Braille"],
  ["SIGN_LANGUAGE", "A sign language interpreter"],
  ["SEPARATE_ROOM", "A separate room"],
  ["REST_BREAKS", "Rest breaks"],
  ["NEAR_THE_FRONT", "Sits near the front"],
  ["USE_A_COMPUTER", "Uses a computer"],
] as const;

export interface WholePlan {
  needs: string[];
  needWords: string[];
  needNote: string | null;
  arrangementCodes: string[];
  extraTimePercent: number | null;
  otherArrangement: string | null;
  arrangements: string[];
  reviewOn: string | null;
  agreedWith: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface PlanAnswer {
  plan: (WholePlan | { arrangements: string[]; reviewOn: string | null }) | null;
  teacherView?: boolean;
  mayChange?: boolean;
  recordedAtEnrolment?: string | null;
}

export function useSupportPlan(studentId: string | null | undefined) {
  return useQuery<PlanAnswer>({
    queryKey: ["support-plan", studentId],
    queryFn: async () => (await api.get(`/students/${studentId}/support-plan`)).data,
    enabled: !!studentId,
    retry: false,
  });
}

export function useSaveSupportPlan(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.put(`/students/${studentId}/support-plan`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(["support-plan", studentId], data);
      qc.invalidateQueries({ queryKey: ["support-register"] });
      toast.success("Support plan saved");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save the plan")),
  });
}

export function useRemoveSupportPlan(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.delete(`/students/${studentId}/support-plan`)).data,
    onSuccess: () => {
      qc.setQueryData(["support-plan", studentId], (old: PlanAnswer | undefined) => ({
        ...old,
        plan: null,
      }));
      qc.invalidateQueries({ queryKey: ["support-register"] });
      toast.success("Support plan removed");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not remove the plan")),
  });
}

export interface ClassArrangement {
  studentId: string;
  name: string;
  studentIdNumber: string;
  arrangements: string[];
  extraMinutes?: number | null;
}

/** The students of a class with exam arrangements: names and what to do. */
export function useClassSupport(classSectionId: string | null | undefined) {
  return useQuery<ClassArrangement[]>({
    queryKey: ["class-support", classSectionId],
    queryFn: async () => (await api.get(`/support/class/${classSectionId}`)).data,
    enabled: !!classSectionId,
    retry: false,
  });
}

export function useExamSheet(examId: string | null | undefined) {
  return useQuery({
    queryKey: ["exam-sheet", examId],
    queryFn: async () => (await api.get(`/support/exams/${examId}/sheet`)).data,
    enabled: !!examId,
  });
}

export interface RegisterRow {
  studentId: string;
  userId: string;
  name: string;
  studentIdNumber: string;
  class: string;
  needs: string[];
  arrangements: string[];
  reviewOn: string | null;
}

export function useSupportRegister() {
  return useQuery<RegisterRow[]>({
    queryKey: ["support-register"],
    queryFn: async () => (await api.get("/support/register")).data,
  });
}
