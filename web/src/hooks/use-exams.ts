import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export interface ExamEntry {
  id: string;
  classSectionId: string;
  subjectId: string;
  termId: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room: string | null;
  syllabus: string | null;
  subject?: { name: string; code?: string };
  classSection?: { name: string; classLevel?: { name: string } };
}

/**
 * The exam timetable for one class in one term.
 *
 * The endpoints have existed since the academic module was written and nothing
 * in the app called them, so a school could store an exam timetable and no
 * student could ever see it.
 */
export function useExams(classSectionId?: string, termId?: string) {
  return useQuery({
    queryKey: ["exams", classSectionId, termId],
    queryFn: async () =>
      (
        await api.get("/academic/exams", {
          params: { classSectionId, termId },
        })
      ).data as ExamEntry[],
    /* Both are needed: "every exam in the school" is not a question anybody
       asks, and it is a large answer to fetch by accident. */
    enabled: Boolean(classSectionId && termId),
  });
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post("/academic/exams", body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Exam added to the timetable");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not add that exam")),
  });
}

export function useUpdateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      (await api.put(`/academic/exams/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Exam updated");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not update that exam")),
  });
}

export function useDeleteExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/academic/exams/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Exam removed from the timetable");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not remove that exam")),
  });
}
