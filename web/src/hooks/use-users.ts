"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Payload } from "./types";

export interface UserFilters {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  isActive?: boolean;
  classSectionId?: string;
  studentStatus?: string;
  searchIn?: string;
}

export function useUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: ["users", filters],
    queryFn: async () => {
      // Send every set filter — hand-picking keys here is how filters get
      // silently dropped when a new one is added.
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") {
          params.set(key, String(value));
        }
      }
      const res = await api.get(`/users?${params.toString()}`);
      return res.data;
    },
  });
}

export function useUser(id: string | null) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: async () => {
      const res = await api.get(`/users/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Payload) => {
      const res = await api.post("/users", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User created successfully");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to create user");
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/users/${id}`, data);
      return res.data;
    },
    // The detail page reads ["user", id], not the ["users"] list. Refreshing
    // only the list left the profile you had just edited showing the values
    // you replaced until the page was reloaded, which reads as a save that
    // did not happen.
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success("User updated successfully");
    },
    // class-validator answers with an array of messages, which rendered as
    // "field must be a string,field should not be empty" run together.
    onError: (err: any) => {
      const message = err.response?.data?.message;
      toast.error(
        (Array.isArray(message) ? message[0] : message) ||
          "Failed to update user",
      );
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/users/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deactivated successfully");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to deactivate user");
    },
  });
}

export function useBulkImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { role: string; rows: any[] }) => {
      const res = await api.post("/users/bulk-import", data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`Import complete: ${data.created} users created`);
      if (data.errors?.length) {
        toast.warning(`${data.errors.length} rows had errors`);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Bulk import failed");
    },
  });
}
