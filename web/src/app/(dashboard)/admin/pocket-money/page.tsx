"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Input,
  Modal,
  PageSpinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useClassLevels, useSections } from "@/hooks/use-academic";
import {
  useDeposit,
  useLookupAccount,
  usePocketMoneyAccount,
  usePocketMoneyOverview,
  usePocketMoneyStatement,
  useRefund,
  useReverseEntry,
  useUpdateMoneyLimits,
  useWithdraw,
  type PocketMoneyAccount,
  type PocketMoneyEntry,
} from "@/hooks/use-pocket-money";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Wallet,
  Snowflake,
  Undo2,
} from "lucide-react";

/** Rwandan francs, written the way a counter writes them. */
function rwf(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-RW")} RWF`;
}

const KIND_LABELS: Record<PocketMoneyEntry["kind"], string> = {
  DEPOSIT: "Taken in",
  WITHDRAWAL: "Paid out",
  REFUND: "Returned",
  REVERSAL: "Reversed",
  ADJUSTMENT: "Adjusted",
};

/**
 * The counter.
 *
 * A patron or matron stands here with a queue of students in front of them, so
 * the flow is: scan the card, see the face and the balance, hand the money
 * over. Everything else on the page is secondary to that.
 */
export default function PocketMoneyPage() {
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [scan, setScan] = useState("");

  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId || undefined);
  const { data, isLoading } = usePocketMoneyOverview({
    classSectionId: sectionId || undefined,
    search: search || undefined,
    page,
    limit: 25,
  });

  const lookup = useLookupAccount();

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [sectionId, search]);

  const items: any[] = data?.items ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 25, totalPages: 1 };

  /** A scan resolves the student and opens their counter view straight away. */
  const handleScan = async () => {
    const code = scan.trim();
    if (!code) return;
    const account = await lookup.mutateAsync(code).catch(() => null);
    setScan("");
    if (account) setOpenStudentId(account.studentId);
  };

  return (
    <div>
      <PageHeader
        title="Pocket money"
        description="Money the school is holding for its students"
      />

      <Card padding="sm" className="mb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="pm-scan" className="mb-1 block text-xs font-medium text-muted">
              Scan a card, or type a student number
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="pm-scan"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                placeholder="Scan the card or type STD-…"
                aria-label="Scan a card"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <Button onClick={handleScan} isLoading={lookup.isPending}>
            <Wallet className="mr-2 h-4 w-4" /> Open account
          </Button>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card padding="sm">
          <p className="text-xs text-muted">Held for students</p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {rwf(data?.totalHeld ?? 0)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-muted">Accounts on this page</p>
          <p className="mt-1 text-2xl font-bold">{items.length}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-muted">Students</p>
          <p className="mt-1 text-2xl font-bold">{meta.total}</p>
        </Card>
      </div>

      <Card padding="sm" className="mb-5">
        <div className="flex flex-wrap items-end gap-4">
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
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={levelId}
            onChange={(e) => {
              setLevelId(e.target.value);
              setSectionId("");
            }}
            aria-label="Class level"
          >
            <option value="">All levels</option>
            {levels?.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={!levelId}
            aria-label="Class section"
          >
            <option value="">All classes</option>
            {sections?.map((s: any) => (
              <option key={s.id} value={s.id}>
                {[s.trade?.code, s.name].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <PageSpinner />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Student number</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted">
                    <Wallet className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No students found
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow key={it.studentId}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {it.name}
                        {it.isFrozen && (
                          <Badge variant="warning">
                            <Snowflake className="mr-1 h-3 w-3" /> Frozen
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted">{it.class ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {it.studentIdNumber}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {rwf(it.balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenStudentId(it.studentId)}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {!isLoading && meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {(meta.page - 1) * meta.limit + 1}–
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <Button
                aria-label="Previous page"
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex items-center px-3 text-sm text-muted">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                aria-label="Next page"
                variant="outline"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <CounterModal
        studentId={openStudentId}
        onClose={() => setOpenStudentId(null)}
      />
    </div>
  );
}

/**
 * One student's counter view.
 *
 * The balance is the biggest thing on it, because it is the number the person
 * at the counter has to read at a glance with somebody waiting.
 */
function CounterModal({
  studentId,
  onClose,
}: {
  studentId: string | null;
  onClose: () => void;
}) {
  const { data: account } = usePocketMoneyAccount(studentId ?? undefined);
  const { data: statement } = usePocketMoneyStatement(studentId ?? undefined, 1, 20);

  const deposit = useDeposit();
  const withdraw = useWithdraw();
  const refund = useRefund();
  const reverse = useReverseEntry();
  const limits = useUpdateMoneyLimits();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");

  useEffect(() => {
    setAmount("");
    setNote("");
    setDailyLimit(
      account?.dailyLimit === null || account?.dailyLimit === undefined
        ? ""
        : String(account.dailyLimit),
    );
  }, [studentId, account?.dailyLimit]);

  if (!studentId) return null;

  const value = Number(amount);
  const canMove = Number.isFinite(value) && value > 0;

  const move = async (fn: typeof deposit) => {
    if (!canMove) return;
    await fn
      .mutateAsync({ studentId, amount: value, note: note || undefined })
      .catch(() => null);
    setAmount("");
    setNote("");
  };

  const entries: PocketMoneyEntry[] = statement?.data ?? [];

  return (
    <Modal
      isOpen={!!studentId}
      onClose={onClose}
      title={account?.student?.name ?? "Pocket money"}
      size="lg"
    >
      {!account ? (
        <PageSpinner />
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-accent-light/50 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-muted">Balance</p>
            <p className="mt-1 text-3xl font-bold text-primary">
              {rwf(account.balance)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {account.student?.studentIdNumber}
              {account.remainingToday !== null && (
                <> · {rwf(account.remainingToday)} left of today&apos;s limit</>
              )}
            </p>
            {account.isFrozen && (
              <Badge variant="warning" className="mt-2">
                Frozen. Nothing can be paid out until the office unfreezes it.
              </Badge>
            )}
            {account.isLow && !account.isFrozen && (
              <Badge variant="warning" className="mt-2">
                Running low
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              id="pm-amount"
              label="Amount (RWF)"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 2000"
            />
            <Input
              id="pm-note"
              label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Canteen"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => move(deposit)} disabled={!canMove} isLoading={deposit.isPending}>
              Take in
            </Button>
            <Button
              variant="outline"
              onClick={() => move(withdraw)}
              disabled={!canMove}
              isLoading={withdraw.isPending}
            >
              Pay out
            </Button>
            <Button
              variant="outline"
              onClick={() => move(refund)}
              disabled={!canMove}
              isLoading={refund.isPending}
            >
              Return to family
            </Button>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                id="pm-limit"
                label="Daily limit (RWF)"
                type="number"
                min="0"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="No limit"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  limits.mutate({
                    studentId,
                    dailyLimit: dailyLimit === "" ? null : Number(dailyLimit),
                  })
                }
              >
                Save limit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => limits.mutate({ studentId, isFrozen: !account.isFrozen })}
              >
                <Snowflake className="mr-1 h-3.5 w-3.5" />
                {account.isFrozen ? "Unfreeze" : "Freeze"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              A daily limit is what makes a term&apos;s money last a term. Leave it
              empty for no limit.
            </p>
          </div>

          <div>
            <CardTitle>Statement</CardTitle>
            <div className="mt-2 max-h-64 overflow-y-auto">
              {entries.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  Nothing has moved on this account yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>What</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted">
                          {new Date(e.createdAt).toLocaleDateString("en-GB")}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {KIND_LABELS[e.kind]}
                            {e.isReversed && <Badge variant="warning">Reversed</Badge>}
                          </div>
                          {e.note && (
                            <div className="text-xs text-muted">{e.note}</div>
                          )}
                          {e.recordedBy && (
                            <div className="text-xs text-muted">by {e.recordedBy}</div>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            e.signedAmount < 0 ? "text-danger" : "text-success"
                          }`}
                        >
                          {e.signedAmount < 0 ? "−" : "+"}
                          {rwf(Math.abs(e.signedAmount))}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Reversing writes a second entry; the original stays. */}
                          {!e.isReversed && e.kind !== "REVERSAL" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Reverse ${KIND_LABELS[e.kind]}`}
                              onClick={() => {
                                const reason = prompt(
                                  "Why is this being reversed? The original entry stays on the statement.",
                                );
                                if (reason?.trim()) {
                                  reverse.mutate({
                                    transactionId: e.id,
                                    reason: reason.trim(),
                                  });
                                }
                              }}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
