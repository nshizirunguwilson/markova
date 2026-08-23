import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/**
 * Pocket money the school holds for its students.
 *
 * Every write invalidates both the account and the statement, because the
 * counter is looking at one and the parent at the other, and a balance that
 * disagrees with its own statement is worse than no balance at all.
 */

export interface PocketMoneyAccount {
  studentId: string;
  student: {
    name: string;
    studentIdNumber: string;
    level: string | null;
    photoUrl: string | null;
  } | null;
  balance: number;
  spentToday: number;
  dailyLimit: number | null;
  remainingToday: number | null;
  lowBalanceAlert: number | null;
  isFrozen: boolean;
  isLow: boolean;
}

export interface PocketMoneyEntry {
  id: string;
  kind: "DEPOSIT" | "WITHDRAWAL" | "REFUND" | "REVERSAL" | "ADJUSTMENT";
  amount: number;
  signedAmount: number;
  note: string | null;
  createdAt: string;
  recordedBy: string | null;
  reversesId: string | null;
  isReversed: boolean;
}

function invalidateMoney(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["pocket-money"] });
}

export function usePocketMoneyOverview(filters: {
  classSectionId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["pocket-money", "overview", filters],
    queryFn: async () =>
      (await api.get("/pocket-money/overview", { params: filters })).data,
  });
}

export function usePocketMoneyAccount(studentId?: string) {
  return useQuery<PocketMoneyAccount>({
    queryKey: ["pocket-money", "account", studentId],
    queryFn: async () =>
      (await api.get(`/pocket-money/student/${studentId}`)).data,
    enabled: !!studentId,
  });
}

export function usePocketMoneyStatement(
  studentId?: string,
  page = 1,
  limit = 50,
) {
  return useQuery({
    queryKey: ["pocket-money", "statement", studentId, page, limit],
    queryFn: async () =>
      (
        await api.get(`/pocket-money/student/${studentId}/statement`, {
          params: { page, limit },
        })
      ).data,
    enabled: !!studentId,
  });
}

/** Find a student from a scanned card or a typed student number. */
export function useLookupAccount() {
  return useMutation({
    mutationFn: async (identifier: string) =>
      (await api.post("/pocket-money/lookup", { identifier })).data as PocketMoneyAccount,
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "No student found for that code"));
    },
  });
}

function moneyMutation(
  path: string,
  success: (amount: number) => string,
  failure: string,
) {
  return function useMoneyMutation() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (data: {
        studentId: string;
        amount: number;
        note?: string;
      }) => (await api.post(`/pocket-money/${path}`, data)).data,
      onSuccess: (_res, vars) => {
        invalidateMoney(qc);
        toast.success(success(vars.amount));
      },
      // The server's own refusal is the useful message here: it names the
      // balance or the remaining daily allowance, which a generic failure
      // cannot.
      onError: (e: unknown) => {
        toast.error(errorMessage(e, failure));
      },
    });
  };
}

export const useDeposit = moneyMutation(
  "deposit",
  (a) => `${a.toLocaleString()} RWF taken in`,
  "Could not take the money in",
);

export const useWithdraw = moneyMutation(
  "withdraw",
  (a) => `${a.toLocaleString()} RWF paid out`,
  "Could not pay the money out",
);

export const useRefund = moneyMutation(
  "refund",
  (a) => `${a.toLocaleString()} RWF returned to the family`,
  "Could not return the money",
);

/** Undo an entry with a second entry. The original is never touched. */
export function useReverseEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { transactionId: string; reason: string }) =>
      (await api.post("/pocket-money/reverse", data)).data,
    onSuccess: () => {
      invalidateMoney(qc);
      toast.success("Entry reversed. The original stays on the statement.");
    },
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "Could not reverse that entry"));
    },
  });
}

export function useUpdateMoneyLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      studentId: string;
      dailyLimit?: number | null;
      lowBalanceAlert?: number | null;
      isFrozen?: boolean;
    }) => (await api.put("/pocket-money/limits", data)).data,
    onSuccess: () => {
      invalidateMoney(qc);
      toast.success("Saved");
    },
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "Could not save those limits"));
    },
  });
}
