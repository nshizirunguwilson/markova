"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Payload } from "./types";
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
    // No polling - real-time updates come via WebSocket
  });
}

export function useMessages(conversationId?: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => (await api.get(`/messaging/conversations/${conversationId}/messages`)).data,
    enabled: !!conversationId,
    // No polling - real-time updates come via WebSocket
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/messaging/conversations", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); },
    onError: (e: unknown) => toast.error(errorMessage(e, "Failed")),
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => (await api.post("/messaging/messages", data)).data,
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

// ─── BROADCAST ──────────────────────────────────────────────────────────────
// "Everyone in Senior 1's family needs to know by Friday" is the single most
// common thing a school has to say, and the only tool for it today is a
// photocopied letter handed to a child.

export type BroadcastAudience =
  | "ALL_PARENTS"
  | "ALL_TEACHERS"
  | "ALL_STUDENTS"
  | "ALL_STAFF"
  | "PARENTS_OF_LEVELS"
  | "PARENTS_OF_CLASSES"
  | "STUDENTS_OF_LEVELS"
  | "STUDENTS_OF_CLASSES";

export interface AudienceSpec {
  audience: BroadcastAudience;
  classLevelIds?: string[];
  classSectionIds?: string[];
}

/**
 * How many people an announcement would reach, before sending it.
 *
 * Nobody should find out they addressed four hundred families by doing it.
 */
export function usePreviewAudience(spec: AudienceSpec | null) {
  return useQuery<{ count: number }>({
    queryKey: ["broadcast-preview", spec],
    queryFn: async () => (await api.post("/messaging/broadcast/preview", spec)).data,
    enabled: !!spec,
    retry: false,
  });
}

export function useBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) =>
      (await api.post("/messaging/broadcast", data)).data,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(`Sent to ${res?.recipients ?? 0} people`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not send it")),
  });
}

// ─── GROUP MEMBERSHIP ───────────────────────────────────────────────────────

export function useParticipants(conversationId?: string) {
  return useQuery({
    queryKey: ["participants", conversationId],
    queryFn: async () =>
      (await api.get(`/messaging/conversations/${conversationId}/participants`))
        .data,
    enabled: !!conversationId,
  });
}

export function useAddParticipants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      userIds,
    }: {
      conversationId: string;
      userIds: string[];
    }) =>
      (
        await api.post(
          `/messaging/conversations/${conversationId}/participants`,
          { userIds },
        )
      ).data,
    onSuccess: (res: any, vars) => {
      qc.invalidateQueries({ queryKey: ["participants", vars.conversationId] });
      toast.success(`${res?.added ?? 0} added`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not add them")),
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) =>
      (
        await api.delete(
          `/messaging/conversations/${conversationId}/participants/${userId}`,
        )
      ).data,
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["participants", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Removed");
    },
    onError: (e: unknown) =>
      toast.error(errorMessage(e, "Could not remove them")),
  });
}

export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      name,
    }: {
      conversationId: string;
      name: string;
    }) =>
      (await api.put(`/messaging/conversations/${conversationId}/name`, { name }))
        .data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Renamed");
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "Could not rename it")),
  });
}

/**
 * Uploading a file to attach.
 *
 * The API decides what may be sent and stores it under an extension derived
 * from the type, never from the name the file arrived with.
 */
export function useUploadAttachment() {
  return useMutation({
    /*
      `onProgress` matters here in a way it does not for a logo: a video may
      be fifty megabytes, and fifty megabytes up a Rwandan mobile line with no
      indication of how far along it is reads as the app having hung.
    */
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (percent: number) => void;
    }) => {
      const body = new FormData();
      body.append("file", file);
      return (
        await api.post("/messaging/attachments", body, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            // `total` is absent when the size is not known up front, which is
            // rare for a file but has to leave the bar alone rather than
            // dividing by nothing.
            if (onProgress && e.total) {
              onProgress(Math.round((e.loaded / e.total) * 100));
            }
          },
        })
      ).data as {
        fileUrl: string;
        fileName: string;
        size: number;
        kind?: string;
        mimeType?: string;
      };
    },
    onError: (e: unknown) =>
      toast.error(errorMessage(e, "That file could not be sent")),
  });
}
