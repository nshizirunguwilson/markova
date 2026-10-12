import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** What a family agreed to for a student's photo (B6). */
export type PhotoAnswer = "YES" | "NO" | "NOT_ASKED";
export type PhotoUse = "forId" | "inApp" | "publicity";

export const PHOTO_USES: { key: PhotoUse; label: string; hint: string }[] = [
  {
    key: "forId",
    label: "On the ID card and report card",
    hint: "So the gate and the exam room can tell it is them",
  },
  {
    key: "inApp",
    label: "In the app, for classmates and other parents",
    hint: "Beside the name in chats. The staff always see it",
  },
  {
    key: "publicity",
    label: "In the school's publicity",
    hint: "The website, posters and social media",
  },
];

export const ANSWER_WORDS: Record<PhotoAnswer, string> = {
  YES: "Yes",
  NO: "No",
  NOT_ASKED: "Not asked yet",
};

export const HOW_WORDS: Record<string, string> = {
  IN_THE_APP: "in the app",
  PAPER_FORM: "on a paper form",
  ADMISSION_FORM: "on the admission form",
};

export interface PhotoConsent {
  forId: PhotoAnswer;
  inApp: PhotoAnswer;
  publicity: PhotoAnswer;
  answeredBy: "FAMILY" | "STUDENT";
  mayAnswer: boolean;
  history: {
    id: string;
    forId: PhotoAnswer;
    inApp: PhotoAnswer;
    publicity: PhotoAnswer;
    how: string;
    answeredBy: string;
    createdAt: string;
  }[];
}

export function usePhotoConsent(studentId: string | null | undefined) {
  return useQuery<PhotoConsent>({
    queryKey: ["photo-consent", studentId],
    queryFn: async () => (await api.get(`/students/${studentId}/photo-consent`)).data,
    enabled: !!studentId,
    retry: false,
  });
}

export function useAnswerPhotoConsent(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, string>) =>
      (await api.put(`/students/${studentId}/photo-consent`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(["photo-consent", studentId], data);
      qc.invalidateQueries({ queryKey: ["photo-consent-register"] });
      toast.success("Answers saved");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save the answers")),
  });
}

export interface ConsentRow {
  studentId: string;
  userId: string;
  name: string;
  studentIdNumber: string;
  class: string;
  hasPhoto: boolean;
  forId: PhotoAnswer;
  inApp: PhotoAnswer;
  publicity: PhotoAnswer;
}

export interface ConsentRegister {
  counts: {
    students: number;
    notAsked: number;
    mayPublish: number;
    notInApp: number;
    notOnCard: number;
  };
  students: ConsentRow[];
}

export function usePhotoConsentRegister() {
  return useQuery<ConsentRegister>({
    queryKey: ["photo-consent-register"],
    queryFn: async () => (await api.get("/photo-consent/register")).data,
  });
}
