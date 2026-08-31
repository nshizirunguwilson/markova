import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  newValue: string | null;
  oldValue: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
    role: string;
    email: string | null;
  } | null;
}

export interface AuditFilters {
  page?: number;
  limit?: number;
  userId?: string;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
}

/**
 * The record of who changed what.
 *
 * Every mutation has been written down since the audit interceptor was added,
 * and until this page there was no way to read any of it without a SQL client.
 */
export function useAuditTrail(filters: AuditFilters) {
  return useQuery({
    queryKey: ["audit", filters],
    queryFn: async () =>
      (await api.get("/audit", { params: filters })).data as {
        data: AuditEntry[];
        meta: { page: number; limit: number; total: number; pages: number };
      },
    /* The trail is append-only and read while something is being
       investigated, so a stale answer is worse than a refetch. */
    staleTime: 0,
  });
}

/** The kinds of record and action actually present, for the filters. */
export function useAuditFilters() {
  return useQuery({
    queryKey: ["audit", "filters"],
    queryFn: async () =>
      (await api.get("/audit/filters")).data as {
        entityTypes: string[];
        actions: string[];
      },
  });
}
