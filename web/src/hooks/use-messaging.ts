"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => (await api.get("/messaging/conversations")).data,
    refetchInterval: 10000, // Poll every 10s
  });
}

export function useMessages(conversationId?: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => (await api.get(`/messaging/conversations/${conversationId}/messages`)).data,
    enabled: !!conversationId,
    refetchInterval: 5000, // Poll every 5s
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => (await api.post("/messaging/conversations", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
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
    onError: (e: any) => toast.error(e.response?.data?.message || "Failed"),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => (await api.post("/messaging/read", { conversationId })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); },
  });
}

export function useUnreadMessageCount() {
  return useQuery({
    queryKey: ["unread-messages"],
    queryFn: async () => (await api.get("/messaging/unread")).data,
    refetchInterval: 15000,
  });
}
