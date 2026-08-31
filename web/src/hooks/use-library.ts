"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type {
  BulkSaveResponse,
  LoanResponse,
  Payload,
  PayloadWithId,
} from "./types";
import { errorMessage } from "@/lib/errors";

/**
 * The rows out of a paginated response.
 *
 * The library endpoints answer `{ data, meta }` - the envelope from
 * PaginatedResponse - and reading `.length` straight off that gives
 * `undefined`, which every "no results" branch in the app treats as empty.
 * The librarian's catalogue said "No books found" over a library of 56 for
 * exactly that reason, while its own header counted them correctly from a
 * different endpoint.
 *
 * Written once here so a page cannot get it wrong, and tolerant of a bare
 * array so it keeps working if an endpoint is ever un-paginated.
 */
export function rowsOf<T = unknown>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  const data = (response as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

export function useBooks(params?: Record<string, string>) {
  const search = params ? new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["books", params],
    queryFn: async () => (await api.get(`/library/books?${search}`)).data,
  });
}

export function useBook(id?: string) {
  return useQuery({
    queryKey: ["book", id],
    queryFn: async () => (await api.get(`/library/books/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/library/books", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success("Book added"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: PayloadWithId) => (await api.put(`/library/books/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success("Book updated"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/library/books/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success("Book deleted"); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/library/checkout", data)).data,
    onSuccess: (data: LoanResponse) => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["active-loans"] });
      // Reads defensively. The success toast is decoration, and it should not
      // be able to turn a completed checkout into a reported failure just
      // because the response was shaped slightly differently.
      const title = data?.book?.title ?? "Book";
      const who = data?.borrower?.firstName ?? "borrower";
      toast.success(`Checked out "${title}" to ${who}`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Checkout failed")),
  });
}

export function useReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/library/return", data)).data,
    onSuccess: (data: LoanResponse) => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["active-loans"] });
      const title = data?.book?.title ?? "Book";
      const who = data?.borrower?.firstName ?? "borrower";
      toast.success(`"${title}" returned by ${who}`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Return failed")),
  });
}

export function useActiveLoans() {
  return useQuery({
    queryKey: ["active-loans"],
    queryFn: async () => (await api.get("/library/loans/active")).data,
  });
}

/**
 * Remind everybody holding an overdue book.
 *
 * The overdue list has been readable since this feature was written and there
 * was no way to act on it: a librarian could see six books were late and had
 * to chase each borrower by hand.
 */
export function useRemindOverdue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post("/library/loans/overdue/remind")).data as {
        overdue: number;
        reminded: number;
        unreachable: number;
        message: string;
      },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["overdue-loans"] });
      toast.success(result.message);
      /* Named separately, because "reminded 4 of 6" is a different fact from
         "two of them have no address or number on file", and only the second
         is something the librarian has to do anything about. */
      if (result.unreachable > 0) {
        toast.warning(
          `${result.unreachable} ${result.unreachable === 1 ? "borrower has" : "borrowers have"} no email or phone on file, so ${result.unreachable === 1 ? "they were" : "they were"} not reminded.`,
        );
      }
    },
    onError: (e) => toast.error(errorMessage(e, "Could not send the reminders")),
  });
}

export function useOverdueLoans() {
  return useQuery({
    queryKey: ["overdue-loans"],
    queryFn: async () => (await api.get("/library/loans/overdue")).data,
  });
}

export function useMyLoans() {
  return useQuery({
    queryKey: ["my-loans"],
    queryFn: async () => (await api.get("/library/loans/my")).data,
  });
}

export function useBulkImportBooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { books: any[] }) => (await api.post("/library/books/bulk", data)).data,
    onSuccess: (data: BulkSaveResponse) => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success(`${data?.count ?? 0} books imported`); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Import failed")),
  });
}

export function useLibraryAnalytics() {
  return useQuery({
    queryKey: ["library-analytics"],
    queryFn: async () => (await api.get("/library/analytics")).data,
  });
}
