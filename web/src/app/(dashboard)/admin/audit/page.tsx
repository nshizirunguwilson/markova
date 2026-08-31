"use client";

import { useState } from "react";
import { History, Search, X } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  PageSpinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import {
  useAuditFilters,
  useAuditTrail,
  type AuditEntry,
  type AuditFilters,
} from "@/hooks/use-audit";
import { labelForRole } from "@/types";
import type { Role } from "@/types";

/**
 * Who changed what.
 *
 * Every mutation has been recorded since the audit interceptor was written,
 * and until this page there was no way to read any of it without opening a SQL
 * client. That is the shape of an audit trail nobody audits: it satisfies the
 * letter of "we keep a record" and answers no question anybody actually has.
 *
 * The questions it is built around are specific, which is what the filters
 * are: who changed this child's marks, what did this member of staff do on
 * Tuesday, and what has been deleted this term.
 */

/** What each verb means to somebody who does not think in HTTP. */
const ACTION_LABEL: Record<string, string> = {
  POST: "Created",
  PUT: "Replaced",
  PATCH: "Changed",
  DELETE: "Deleted",
};

/*
  Deletion is the one that matters at a glance. Somebody reading this page
  after something went missing is looking for exactly one colour, and making
  every row shout would bury it.
*/
const ACTION_TONE: Record<string, "danger" | "warning" | "info" | "default"> = {
  POST: "info",
  PUT: "warning",
  PATCH: "warning",
  DELETE: "danger",
};

/** The record type, in the words the school uses rather than a table name. */
const readableEntity = (entity: string | null) =>
  !entity
    ? "Something"
    : entity.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function When({ iso }: { iso: string }) {
  const at = new Date(iso);
  return (
    <span className="whitespace-nowrap tabular-nums">
      {at.toLocaleDateString()}{" "}
      <span className="text-muted">
        {at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </span>
  );
}

/**
 * What was sent, when there is anything readable to show.
 *
 * Collapsed by default. The value is the request body, which is useful when
 * you are chasing one change and noise on every other row.
 */
function WhatChanged({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  if (!entry.newValue) return <span className="text-muted">-</span>;

  if (entry.newValue === "[unreadable]") {
    return (
      <span className="text-xs text-muted" title="Recorded before this page could redact it safely">
        Withheld
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-primary hover:underline"
      >
        {open ? "Hide" : "Show"}
      </button>
      {open && (
        <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-surface-muted p-2 text-[11px] leading-relaxed text-foreground-muted">
          {entry.newValue}
        </pre>
      )}
    </>
  );
}

export default function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, limit: 25 });
  const { data, isLoading } = useAuditTrail(filters);
  const { data: options } = useAuditFilters();

  const set = (patch: AuditFilters) =>
    /* Any change to a filter goes back to the first page. Staying on page four
       of a different query shows an empty table and looks like a fault. */
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const narrowed =
    filters.entityType || filters.action || filters.from || filters.to;

  return (
    <div className="space-y-6">
      <PageHeader
        title="What has changed"
        description="Every change anybody has made, most recent first"
      />

      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="audit-entity"
              className="mb-1 block text-xs font-medium text-muted"
            >
              Kind of record
            </label>
            <select
              id="audit-entity"
              value={filters.entityType ?? ""}
              onChange={(e) => set({ entityType: e.target.value || undefined })}
              className="rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            >
              <option value="">Anything</option>
              {options?.entityTypes.map((t) => (
                <option key={t} value={t}>
                  {readableEntity(t)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="audit-action"
              className="mb-1 block text-xs font-medium text-muted"
            >
              What happened
            </label>
            <select
              id="audit-action"
              value={filters.action ?? ""}
              onChange={(e) => set({ action: e.target.value || undefined })}
              className="rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            >
              <option value="">Anything</option>
              {options?.actions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a] ?? a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="audit-from"
              className="mb-1 block text-xs font-medium text-muted"
            >
              From
            </label>
            <input
              id="audit-from"
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => set({ from: e.target.value || undefined })}
              className="rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label
              htmlFor="audit-to"
              className="mb-1 block text-xs font-medium text-muted"
            >
              To
            </label>
            <input
              id="audit-to"
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => set({ to: e.target.value || undefined })}
              className="rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            />
          </div>

          {narrowed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters({ page: 1, limit: 25 })}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : !data || data.data.length === 0 ? (
        <Card>
          <div className="py-14 text-center">
            <Search className="mx-auto mb-3 h-8 w-8 text-muted opacity-40" />
            <p className="text-sm text-muted">
              {narrowed
                ? "Nothing matches those filters."
                : "Nothing has been changed yet."}
            </p>
          </div>
        </Card>
      ) : (
        <Card padding="sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted">
              <History className="mr-1.5 inline h-4 w-4" />
              {data.meta.total.toLocaleString()}{" "}
              {data.meta.total === 1 ? "change" : "changes"}
            </p>
            {data.meta.pages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.meta.page <= 1}
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))
                  }
                >
                  Previous
                </Button>
                <span className="text-xs tabular-nums text-muted">
                  {data.meta.page} of {data.meta.pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.meta.page >= data.meta.pages}
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))
                  }
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Audit trail, scrolls horizontally"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead>To what</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <When iso={entry.createdAt} />
                    </TableCell>
                    <TableCell>
                      {entry.user ? (
                        <>
                          <span className="font-medium text-foreground">
                            {entry.user.firstName} {entry.user.lastName}
                          </span>
                          <span className="block text-xs text-muted">
                            {labelForRole(entry.user.role as Role)}
                          </span>
                        </>
                      ) : (
                        /* The account was deleted after the change. The record
                           of what they did outlives them, which is the point. */
                        <span className="text-muted">A deleted account</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_TONE[entry.action] ?? "default"}>
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground-muted">
                      {readableEntity(entry.entityType)}
                    </TableCell>
                    <TableCell>
                      <WhatChanged entry={entry} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
