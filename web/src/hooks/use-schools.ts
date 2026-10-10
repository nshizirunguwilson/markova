"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
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
