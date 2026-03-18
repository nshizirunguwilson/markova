"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

export interface UserFilters {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  isActive?: boolean;
  classSectionId?: string;
}

export function useUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: ["users", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set("page", String(filters.page));
      if (filters.limit) params.set("limit", String(filters.limit));
      if (filters.role) params.set("role", filters.role);
      if (filters.search) params.set("search", filters.search);
      if (filters.isActive !== undefined)
        params.set("isActive", String(filters.isActive));
      if (filters.classSectionId)
        params.set("classSectionId", filters.classSectionId);
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
    mutationFn: async (data: any) => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated successfully");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to update user");
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
