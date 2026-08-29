import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type {
  FeeAppliesTo,
  FeeStanding,
  FeeStatus,
  PaymentMethod,
  WaiverKind,
} from "@/lib/fees";

/**
 * The school's fee ledger.
 *
 * Every write invalidates the whole of `finance`. The office is looking at
 * the register, the account and the term summary at the same time, and a
 * receipt that lands in one of them but not the others is worse than a slow
 * page: it makes the bursar doubt the book.
 *
 * Report cards are invalidated too. Settling a term releases the results, and
 * a family refreshing after paying must not still be told they are held.
 */

export interface FeeItem {
  id: string;
  termId: string;
  classLevelId: string;
  name: string;
  amount: number;
  appliesTo: FeeAppliesTo;
  position: number;
}

export interface FeeStructureLevel {
  classLevel: { id: string; name: string; order: number };
  items: FeeItem[];
  boarderTotal: number;
  dayTotal: number;
}

export interface FeeRegisterRow {
  student: {
    id: string;
    studentIdNumber: string;
    isBoarder: boolean;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    classSection: { id: string; name: string } | null;
  };
  standing: FeeStanding | null;
  status: FeeStatus;
}

export interface FeeSummary {
  term: { id: string; name: string; academicYear?: { name: string } } | null;
  invoiced: number;
  collected: number;
  waived: number;
  outstanding: number;
  cleared: number;
  owing: number;
  invoiceCount: number;
  notInvoiced: number;
  collectionRate: number;
}

export interface FeePayment {
  id: string;
  receiptNumber: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  recordedBy: { firstName: string; lastName: string } | null;
  voidedBy: { firstName: string; lastName: string } | null;
}

export interface FeeWaiver {
  id: string;
  kind: WaiverKind;
  amount: number;
  reason: string;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  grantedBy: { firstName: string; lastName: string } | null;
  revokedBy: { firstName: string; lastName: string } | null;
}

export interface FeeAccount {
  student: {
    id: string;
    studentIdNumber: string;
    isBoarder: boolean;
    user: { firstName: string; lastName: string; photoUrl: string | null };
    classSection: { id: string; name: string } | null;
  };
  invoice: {
    id: string;
    total: number;
    issuedAt: string;
    lines: { id: string; name: string; amount: number; position: number }[];
    payments: FeePayment[];
    waivers: FeeWaiver[];
  } | null;
  standing: FeeStanding | null;
  status: FeeStatus;
}

export interface FeeHistoryEntry {
  term: {
    id: string;
    name: string;
    isCurrent: boolean;
    startDate: string;
    academicYear: { id: string; name: string };
  };
  invoiceId: string;
  standing: FeeStanding;
  status: FeeStatus;
}

function invalidateFees(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["finance"] });
  // Money decides whether results are released, so anything that shows them
  // has to be asked again.
  qc.invalidateQueries({ queryKey: ["report-card"] });
  qc.invalidateQueries({ queryKey: ["student-term-result"] });
  qc.invalidateQueries({ queryKey: ["student-year-result"] });
}

// ── Reading ───────────────────────────────────────────────────────────────

export function useFeeStructure(termId?: string) {
  return useQuery<FeeStructureLevel[]>({
    queryKey: ["finance", "structure", termId],
    queryFn: async () =>
      (await api.get("/finance/structure", { params: { termId } })).data,
    enabled: !!termId,
  });
}

export function useFeeRegister(filters: {
  termId?: string;
  classSectionId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<{
    data: FeeRegisterRow[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ["finance", "register", filters],
    queryFn: async () =>
      (await api.get("/finance/register", { params: filters })).data,
    enabled: !!filters.termId,
  });
}

export function useFeeSummary(termId?: string) {
  return useQuery<FeeSummary>({
    queryKey: ["finance", "summary", termId],
    queryFn: async () =>
      (await api.get("/finance/summary", { params: { termId } })).data,
    enabled: !!termId,
  });
}

export function useFeeAccount(studentId?: string, termId?: string) {
  return useQuery<FeeAccount>({
    queryKey: ["finance", "account", studentId, termId],
    queryFn: async () =>
      (await api.get(`/finance/account/${studentId}`, { params: { termId } }))
        .data,
    enabled: !!studentId && !!termId,
  });
}

/** Every term a student has been billed for, newest first. */
export function useFeeHistory(studentId?: string) {
  return useQuery<FeeHistoryEntry[]>({
    queryKey: ["finance", "history", studentId],
    queryFn: async () => (await api.get(`/finance/history/${studentId}`)).data,
    enabled: !!studentId,
  });
}

// ── Writing ───────────────────────────────────────────────────────────────

export function useSaveFeeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<FeeItem> & { termId: string; classLevelId: string; name: string; amount: number }) =>
      (await api.put("/finance/structure/item", item)).data,
    onSuccess: () => {
      invalidateFees(qc);
      toast.success("Fee line saved");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save that fee line")),
  });
}

export function useDeleteFeeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/finance/structure/item/${id}`)).data,
    onSuccess: () => {
      invalidateFees(qc);
      toast.success("Fee line removed. Invoices already raised are unchanged.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not remove that line")),
  });
}

export function useCopyFeeStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { fromTermId: string; toTermId: string }) =>
      (await api.post("/finance/structure/copy", body)).data,
    onSuccess: (r: { copied: number; skipped: number }) => {
      invalidateFees(qc);
      toast.success(
        r.skipped > 0
          ? `${r.copied} lines copied. ${r.skipped} were already there and were left alone.`
          : `${r.copied} lines copied.`,
      );
    },
    onError: (e) => toast.error(errorMessage(e, "Could not copy that term")),
  });
}

export function useRaiseInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { termId: string; classSectionId?: string }) =>
      (await api.post("/finance/invoices/raise", body)).data,
    onSuccess: (r: {
      raised: number;
      alreadyInvoiced: number;
      withoutStructure: number;
    }) => {
      invalidateFees(qc);
      if (r.raised === 0) {
        toast.info("Everybody had already been billed for this term.");
        return;
      }
      toast.success(
        r.withoutStructure > 0
          ? `${r.raised} invoices raised. ${r.withoutStructure} students were skipped — their class level has no fee structure yet.`
          : `${r.raised} invoices raised.`,
      );
    },
    onError: (e) => toast.error(errorMessage(e, "Could not raise the invoices")),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      studentId: string;
      termId: string;
      amount: number;
      method: PaymentMethod;
      reference?: string;
      paidAt?: string;
      note?: string;
    }) => (await api.post("/finance/payments", body)).data as FeePayment,
    onSuccess: (payment) => {
      invalidateFees(qc);
      toast.success(`Receipt ${payment.receiptNumber} issued`);
    },
    onError: (e) => toast.error(errorMessage(e, "Could not record that payment")),
  });
}

export function useVoidPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { paymentId: string; reason: string }) =>
      (await api.post("/finance/payments/void", body)).data as FeePayment,
    onSuccess: (payment) => {
      invalidateFees(qc);
      toast.success(`Receipt ${payment.receiptNumber} voided. It stays in the book.`);
    },
    onError: (e) => toast.error(errorMessage(e, "Could not void that receipt")),
  });
}

export function useGrantWaiver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      studentId: string;
      termId: string;
      kind: WaiverKind;
      amount: number;
      reason: string;
    }) => (await api.post("/finance/waivers", body)).data,
    onSuccess: () => {
      invalidateFees(qc);
      toast.success("Waiver granted");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not grant that waiver")),
  });
}

export function useRevokeWaiver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { waiverId: string; reason: string }) =>
      (await api.post("/finance/waivers/revoke", body)).data,
    onSuccess: () => {
      invalidateFees(qc);
      toast.success("Waiver withdrawn. It stays in the book.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not withdraw that waiver")),
  });
}
