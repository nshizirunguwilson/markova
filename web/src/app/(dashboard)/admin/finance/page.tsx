"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Avatar,
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
import { classDisplayName } from "@/lib/utils";
import { TermPicker } from "@/components/finance/term-picker";
import { FeeBar } from "@/components/finance/fee-bar";
import { useClassLevels, useSections } from "@/hooks/use-academic";
import {
  useFeeRegister,
  useFeeSummary,
  useRaiseInvoices,
} from "@/hooks/use-finance";
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  money,
  shortMoney,
  type FeeStatus,
} from "@/lib/fees";
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Landmark,
  Search,
} from "lucide-react";

/**
 * The fee register.
 *
 * The bursar's whole morning is on this page: who has paid, who has not, and
 * how far off the ones who have not are. So it is a roll of students rather
 * than a page of class totals — a class total answers a question the school
 * asks once a term, and this answers the one it is asked forty times a day.
 *
 * The summary strip above it is deliberately four figures and no chart. What
 * the office needs at a glance is what came in, what is still out, and how
 * many families that is; a doughnut of the same three numbers takes more room
 * and says less.
 */

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "UNPAID", label: "Nothing paid" },
  { value: "PART_PAID", label: "Part paid" },
  { value: "CLEARED", label: "Cleared" },
  { value: "NOT_INVOICED", label: "Not billed" },
];

export default function FeeRegisterPage() {
  const [termId, setTermId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId || undefined);
  const { data: summary } = useFeeSummary(termId || undefined);
  const { data, isLoading } = useFeeRegister({
    termId: termId || undefined,
    classSectionId: sectionId || undefined,
    status: status || undefined,
    search: search || undefined,
    page,
    limit,
  });
  const raise = useRaiseInvoices();

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Page one whenever the roll narrows: landing on page three of a shorter
  // list is an empty table and looks like a fault.
  const narrow = (change: () => void) => {
    change();
    setPage(1);
  };

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <PageHeader
        title="School fees"
        description="What each family has been billed for this term, and what has come in"
        actions={<TermPicker value={termId} onChange={setTermId} />}
      />

      {/*
        Four figures, in the order the office reads them: what we asked for,
        what arrived, what we let go, and what is left to find. The last one
        is the number the whole page exists for, so it carries the colour.
      */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card padding="sm">
          <p className="text-xs text-muted">Billed this term</p>
          <p className="mt-1 text-2xl font-bold" title={money(summary?.invoiced ?? 0)}>
            {shortMoney(summary?.invoiced ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {summary?.invoiceCount ?? 0} invoices
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-muted">Collected</p>
          <p className="mt-1 text-2xl font-bold text-success" title={money(summary?.collected ?? 0)}>
            {shortMoney(summary?.collected ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {Math.round((summary?.collectionRate ?? 0) * 100)}% of the term settled
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-muted">Waived</p>
          <p className="mt-1 text-2xl font-bold" title={money(summary?.waived ?? 0)}>
            {shortMoney(summary?.waived ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted">Bursaries and sponsorships</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-muted">Still outstanding</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              (summary?.outstanding ?? 0) > 0 ? "text-danger" : "text-success"
            }`}
            title={money(summary?.outstanding ?? 0)}
          >
            {shortMoney(summary?.outstanding ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            across {summary?.owing ?? 0} students
          </p>
        </Card>
      </div>

      {/*
        Shown only when there is something to do about it. A school that has
        finished billing should not be looking at a button that would do
        nothing, and one that has not needs telling rather than asking.
      */}
      {termId && (summary?.notInvoiced ?? 0) > 0 && (
        <Card padding="sm" className="mb-5 border-warning/30 bg-warning-wash">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-warning">
                {summary?.notInvoiced} students have not been billed for this term
              </p>
              <p className="mt-0.5 text-xs text-warning/90">
                Raising invoices copies the current fee structure onto a bill
                for each of them. Anyone already billed is left alone.
              </p>
            </div>
            <Button
              onClick={() => raise.mutate({ termId })}
              isLoading={raise.isPending}
              className="flex-shrink-0"
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              Raise invoices
            </Button>
          </div>
        </Card>
      )}

      <Card padding="sm" className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or student number..."
              aria-label="Search students"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
          <select
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            value={status}
            onChange={(e) => narrow(() => setStatus(e.target.value))}
            aria-label="Fee status"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            value={levelId}
            onChange={(e) =>
              narrow(() => {
                setLevelId(e.target.value);
                setSectionId("");
              })
            }
            aria-label="Class level"
          >
            <option value="">All levels</option>
            {levels?.map((l: { id: string; name: string }) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            value={sectionId}
            onChange={(e) => narrow(() => setSectionId(e.target.value))}
            disabled={!levelId}
            aria-label="Class"
          >
            <option value="">All classes</option>
            {sections?.map(
              (s: { id: string; name: string; trade?: { code: string } }) => (
                <option key={s.id} value={s.id}>
                  {[s.trade?.code, s.name].filter(Boolean).join(" ")}
                </option>
              ),
            )}
          </select>
        </div>
      </Card>

      <Card padding="sm">
        {isLoading ? (
          <PageSpinner />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Standing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted">
                      <Landmark className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      {search || status || sectionId
                        ? "No students match that"
                        : "Nobody has been billed for this term yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const s = row.standing;
                    return (
                      <TableRow key={row.student.id}>
                        <TableCell>
                          {/*
                            The whole row is a link rather than a trailing
                            "open" button: a bursar reading a name has already
                            decided, and making them travel to the far edge of
                            the table to act on it is a tax on every lookup.
                          */}
                          <Link
                            href={`/admin/finance/${row.student.id}?termId=${termId}`}
                            className="flex items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            <Avatar
                              src={row.student.photoUrl}
                              alt=""
                              fallback={`${row.student.firstName[0]}${row.student.lastName[0]}`}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {row.student.firstName} {row.student.lastName}
                              </p>
                              <p className="truncate text-xs text-muted">
                                {row.student.studentIdNumber}
                                {" · "}
                                {row.student.isBoarder ? "Boarder" : "Day"}
                              </p>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted">
                          {classDisplayName(row.student.classSection) || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s ? money(s.total) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s ? money(s.paid) : "—"}
                          {s && s.waived > 0 && (
                            <span className="block text-xs text-muted">
                              + {money(s.waived)} waived
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${
                            s && s.balance > 0 ? "text-danger" : ""
                          }`}
                        >
                          {s ? money(s.balance) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[8rem]">
                            <Badge variant={STATUS_VARIANT[row.status as FeeStatus]}>
                              {STATUS_LABEL[row.status as FeeStatus]}
                            </Badge>
                            <FeeBar
                              standing={s}
                              status={row.status as FeeStatus}
                              className="mt-2"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted">
              {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
