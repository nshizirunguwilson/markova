"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { Membership } from "@/lib/schools";

/**
 * Every school the signed-in person can open, with the unread messages
 * waiting in each. What the switcher in the top bar lists.
 */
export function useMySchools(enabled = true) {
  return useQuery<Membership[]>({
    queryKey: ["my-schools"],
    queryFn: async () => (await api.get("/auth/schools")).data,
    enabled,
    staleTime: 60_000,
  });
}

/** Every school on the platform. Only the owner's login passes the guard. */
export interface PlatformSchool {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  people: number;
  students: number;
}

export function usePlatformSchools(enabled = true) {
  return useQuery<PlatformSchool[]>({
    queryKey: ["platform-schools"],
    queryFn: async () => (await api.get("/schools")).data,
    enabled,
  });
}

export interface NewSchool {
  name: string;
  slug: string;
  admin: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
}

export interface SchoolTakenOn {
  school: { id: string; name: string; slug: string };
  principal: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  /* Shown once and never again: null when the principal already signs in
     to another school with a password of their own. */
  tempPassword: string | null;
}

export function useCreateSchool() {
  const qc = useQueryClient();
  return useMutation<SchoolTakenOn, unknown, NewSchool>({
    mutationFn: async (data) => (await api.post("/schools", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-schools"] }),
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "Something went wrong"));
    },
  });
}
