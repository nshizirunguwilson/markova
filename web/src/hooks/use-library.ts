"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

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
    mutationFn: async (data: any) => (await api.post("/library/books", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success("Book added"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => (await api.put(`/library/books/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success("Book updated"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/library/books/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success("Book deleted"); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/library/checkout", data)).data,
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["active-loans"] });
      // Reads defensively. The success toast is decoration, and it should not
      // be able to turn a completed checkout into a reported failure just
      // because the response was shaped slightly differently.
      const title = data?.book?.title ?? "Book";
      const who = data?.borrower?.firstName ?? "borrower";
      toast.success(`Checked out "${title}" to ${who}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Checkout failed"),
  });
}

export function useReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/library/return", data)).data,
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["books"] });
      qc.invalidateQueries({ queryKey: ["active-loans"] });
      const title = data?.book?.title ?? "Book";
      const who = data?.borrower?.firstName ?? "borrower";
      toast.success(`"${title}" returned by ${who}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Return failed"),
  });
}

export function useActiveLoans() {
  return useQuery({
    queryKey: ["active-loans"],
    queryFn: async () => (await api.get("/library/loans/active")).data,
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
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ["books"] }); toast.success(`${data.count} books imported`); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Import failed"),
  });
}

export function useLibraryAnalytics() {
  return useQuery({
    queryKey: ["library-analytics"],
    queryFn: async () => (await api.get("/library/analytics")).data,
  });
}
