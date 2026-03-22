"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

// ── FAQ ─────────────────────────────────────────────────────────────────────────

export function useFaqs(search?: string) {
  return useQuery({
    queryKey: ["help", "faqs", search],
    queryFn: async () => (await api.get("/help/faqs", { params: { search } })).data,
  });
}

export function useFaqsAdmin() {
  return useQuery({
    queryKey: ["help", "faqs", "admin"],
    queryFn: async () => (await api.get("/help/faqs/admin")).data,
  });
}

export function useCreateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; content: string; category?: string; displayOrder?: number; isPublished?: boolean }) =>
      (await api.post("/help/faqs", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help", "faqs"] }),
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Something went wrong');
    },
  });
}

export function useUpdateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; content?: string; category?: string; displayOrder?: number; isPublished?: boolean }) =>
      (await api.patch(`/help/faqs/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help", "faqs"] }),
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Something went wrong');
    },
  });
}

export function useDeleteFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/help/faqs/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help", "faqs"] }),
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Something went wrong');
    },
  });
}

// ── Tickets ─────────────────────────────────────────────────────────────────────

export function useTickets(status?: string) {
  return useQuery({
    queryKey: ["help", "tickets", status],
    queryFn: async () => (await api.get("/help/tickets", { params: { status } })).data,
  });
}

export function useMyTickets() {
  return useQuery({
    queryKey: ["help", "tickets", "mine"],
    queryFn: async () => (await api.get("/help/tickets/mine")).data,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; description: string; screenshotUrl?: string; category?: string }) =>
      (await api.post("/help/tickets", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help", "tickets"] }),
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Something went wrong');
    },
  });
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.patch(`/help/tickets/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help", "tickets"] }),
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Something went wrong');
    },
  });
}
