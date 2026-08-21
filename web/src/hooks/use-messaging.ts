"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

export function useContacts(search?: string) {
  return useQuery({
    queryKey: ["contacts", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      return (await api.get(`/messaging/contacts${params}`)).data;
    },
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => (await api.get("/messaging/conversations")).data,
    // No polling — real-time updates come via WebSocket
  });
}

export function useMessages(conversationId?: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => (await api.get(`/messaging/conversations/${conversationId}/messages`)).data,
    enabled: !!conversationId,
    // No polling — real-time updates come via WebSocket
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/messaging/conversations", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/messaging/messages", data)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => (await api.post("/messaging/read", { conversationId })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); },
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "Something went wrong"));
    },
  });
}

export function useUnreadMessageCount() {
  return useQuery({
    queryKey: ["unread-messages"],
    queryFn: async () => (await api.get("/messaging/unread")).data,
    // Light fallback polling every 60s in case socket disconnects
    refetchInterval: 60000,
  });
}
