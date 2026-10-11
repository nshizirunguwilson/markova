import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** What a student of 18 lets their parents see (A8). */
export interface Sharing {
  adult: boolean;
  knowsBirthday: boolean;
  results: boolean;
  conduct: boolean;
  health: boolean;
  changedAt: string | null;
}

export function useMySharing(enabled = true) {
  return useQuery<Sharing>({
    queryKey: ["my-sharing"],
    queryFn: async () => (await api.get("/students/me/sharing")).data,
    enabled,
  });
}

export function useChangeSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: Partial<Pick<Sharing, "results" | "conduct" | "health">>) =>
      (await api.put("/students/me/sharing", change)).data as Sharing,
    onSuccess: (data) => {
      qc.setQueryData(["my-sharing"], data);
      toast.success("Saved. Your parents see this from now on.");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not save that")),
  });
}
