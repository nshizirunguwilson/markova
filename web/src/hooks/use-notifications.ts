"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

export interface Notification {
  id: string;
  type?: string;
  title: string;
  message: string;
  /**
   * The column is `isRead` on the server (see the Notification model in
   * backend/prisma/schema.prisma). Declaring it as `read` here meant every
   * notification rendered as unread for ever: bold, tinted and carrying a
   * dot, however many times it had been opened.
   */
  isRead: boolean;
  createdAt: string;
}

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ["notifications-unread"],
    queryFn: async () => (await api.get("/notifications/unread")).data,
    refetchInterval: 30000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.put(`/notifications/${id}/read`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "Something went wrong"));
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.put("/notifications/read-all")).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "Something went wrong"));
    },
  });
}
