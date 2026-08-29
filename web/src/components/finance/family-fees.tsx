"use client";

import { useState } from "react";
import { Badge, Card, CardTitle, PageSpinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { FeeBar } from "@/components/finance/fee-bar";
import { useFeeAccount, useFeeHistory } from "@/hooks/use-finance";
import {
  METHOD_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
  WAIVER_LABEL,
  money,
  standingSummary,
  type FeeStatus,
} from "@/lib/fees";
import { Info, Landmark, Lock } from "lucide-react";

/**
 * A family's own fee account.
 *
 * The same screen for a student and for a parent, because they are asking the
 * same question and the answer is the same: what is owed, what has been paid,
 * and what that means for the report card.
 *
 * Deliberately not a copy of the bursar's page. There is nothing to act on
 * here - no counter, no corrections - so the page leads with the one number
 * that matters and then explains it. Where a term is holding results back it
 * says so on that term's own row, because "why can I not see my marks" and
 * "how much do we owe" are the same question asked from two directions.
 */

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function FamilyFees({
  studentId,
  title = "School fees",
  /** Shown above the picker when a parent has more than one child. */
  picker,
  emptyMessage = "There is no fee account on this record yet.",
}: {
  studentId: string;
  title?: string;
  picker?: React.ReactNode;
  emptyMessage?: string;
}) {
  const { data: history, isLoading: loadingHistory } = useFeeHistory(
    studentId || undefined,
  );
  /**
   * Which term is open.
   *
   * Derived during render rather than synced in an effect: the reader's own
   * choice wins, and until they make one it falls to the live term, or to the
   * most recent one billed. A family arriving here wants this term, not the
   * oldest on record - and holding it in an effect meant a render with no
   * term at all, then a second one to correct it.
   */
  const [picked, setPicked] = useState<string | null>(null);
  const termId =
    picked ??
    (history?.find((h) => h.term.isCurrent) ?? history?.[0])?.term.id ??
    "";
  const setTermId = setPicked;

  const { data: account, isLoading } = useFeeAccount(
    studentId || undefined,
    termId || undefined,
  );

  const standing = account?.standing ?? null;
  const status = (account?.status ?? "NOT_INVOICED") as FeeStatus;
  const invoice = account?.invoice;
  const owingTerms = (history ?? []).filter((h) => !h.standing.cleared);

  if (!studentId) {
    return (
      <div>
        <PageHeader title={title} />
        <p className="py-16 text-center text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title={title}
          description="What has been billed, what has been paid, and what is left"
        />
        {picker}
      </div>

      {/*
        Said once, at the top, and only when it is true. A family that owes
        nothing should never be shown a warning about report cards - and one
        that does needs the total for the year rather than for whichever term
        they happen to be looking at.
      */}
      {owingTerms.length > 0 && (
        <Card padding="sm" className="mb-5 border-warning/30 bg-warning-wash">
          <div className="flex gap-3">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-warning">
                {owingTerms.length === 1
                  ? `${owingTerms[0].term.name} results are held until the fees are settled`
                  : `${owingTerms.length} terms of results are held until the fees are settled`}
              </p>
              <p className="mt-0.5 text-sm text-warning">
                {money(
                  owingTerms.reduce((sum, h) => sum + h.standing.balance, 0),
                )}{" "}
                outstanding{owingTerms.length > 1 ? " in total" : ""}. Marks and
                report cards for {owingTerms.length > 1 ? "those terms" : "it"}{" "}
                open as soon as the balance reaches nil. The school office can
                help if something here looks wrong.
              </p>
            </div>
          </div>
        </Card>
      )}

      {loadingHistory ? (
        <PageSpinner />
      ) : !history?.length ? (
        <Card>
          <p className="text-sm text-muted">
            The school has not billed this student for any term yet.
          </p>
        </Card>
      ) : (
        <>
          {/* Every term, so a family can see the shape of the year at once. */}
          <Card padding="sm" className="mb-5">
            <CardTitle className="mb-3">Every term</CardTitle>
            <ul className="space-y-1">
              {history.map((h) => {
                const open = h.term.id === termId;
                return (
                  <li key={h.term.id}>
                    <button
                      type="button"
                      onClick={() => setTermId(h.term.id)}
                      aria-current={open ? "true" : undefined}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        open
                          ? "border-primary/40 bg-accent-light"
                          : "border-transparent hover:bg-surface-muted"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {h.term.name}
                          <span className="ml-2 font-normal text-muted">
                            {h.term.academicYear.name}
                          </span>
                          {h.term.isCurrent && (
                            <span className="ml-2 text-xs text-primary">
                              this term
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-3">
                          <span
                            className={`text-sm tabular-nums ${
                              h.standing.balance > 0
                                ? "font-semibold text-danger"
                                : "text-muted"
                            }`}
                          >
                            {h.standing.balance > 0
                              ? `${money(h.standing.balance)} to pay`
                              : "Settled"}
                          </span>
                          <Badge variant={STATUS_VARIANT[h.status as FeeStatus]}>
                            {STATUS_LABEL[h.status as FeeStatus]}
                          </Badge>
                        </span>
                      </div>
                      <FeeBar
                        standing={h.standing}
                        status={h.status as FeeStatus}
                        className="mt-2"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {isLoading ? (
            <PageSpinner />
          ) : !invoice ? (
            <Card>
              <p className="text-sm text-muted">
                Nothing has been billed for this term.
              </p>
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-muted" /> What is owed
                  </CardTitle>
                  <Badge variant={STATUS_VARIANT[status]}>
                    {STATUS_LABEL[status]}
                  </Badge>
                </div>
                <p
                  className={`text-4xl font-bold tabular-nums ${
                    standing && standing.balance > 0
                      ? "text-danger"
                      : "text-success"
                  }`}
                >
                  {standing ? money(standing.balance) : "-"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {standingSummary(standing, status)}
                </p>
                <FeeBar standing={standing} status={status} className="mt-4" />

                <dl className="mt-5 divide-y divide-border border-t border-border">
                  {invoice.lines.map((line) => (
                    <div
                      key={line.id}
                      className="flex justify-between py-2.5 text-sm"
                    >
                      <dt className="text-muted">{line.name}</dt>
                      <dd className="tabular-nums">{money(line.amount)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 text-sm font-semibold">
                    <dt>Billed for the term</dt>
                    <dd className="tabular-nums">{money(invoice.total)}</dd>
                  </div>
                </dl>
              </Card>

              <div className="space-y-5">
                <Card>
                  <CardTitle className="mb-4">Payments received</CardTitle>
                  {invoice.payments.filter((p) => !p.voidedAt).length === 0 ? (
                    <p className="text-sm text-muted">
                      Nothing has been received for this term yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {invoice.payments
                        .filter((p) => !p.voidedAt)
                        .map((p) => (
                          <li key={p.id} className="py-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-medium tabular-nums">
                                {money(p.amount)}
                              </span>
                              <span className="text-xs text-muted">
                                {dateOf(p.paidAt)}
                              </span>
                            </div>
                            {/*
                              The receipt number and the reference are what a
                              family checks against their own bank message, so
                              both are here rather than only in the office.
                            */}
                            <p className="mt-0.5 text-xs text-muted">
                              Receipt {p.receiptNumber} ·{" "}
                              {METHOD_LABEL[p.method]}
                              {p.reference ? ` · ${p.reference}` : ""}
                            </p>
                          </li>
                        ))}
                    </ul>
                  )}
                </Card>

                {invoice.waivers.filter((w) => !w.revokedAt).length > 0 && (
                  <Card>
                    <CardTitle className="mb-4">
                      Amounts the school is not charging
                    </CardTitle>
                    <ul className="divide-y divide-border">
                      {invoice.waivers
                        .filter((w) => !w.revokedAt)
                        .map((w) => (
                          <li key={w.id} className="py-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-medium tabular-nums">
                                {money(w.amount)}
                              </span>
                              <span className="text-xs text-muted">
                                {WAIVER_LABEL[w.kind]}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted">
                              {w.reason}
                            </p>
                          </li>
                        ))}
                    </ul>
                  </Card>
                )}

                <Card padding="sm">
                  <div className="flex gap-3">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
                    <p className="text-xs text-muted">
                      Payments are recorded by the school office once the money
                      reaches the school, which can take a day or two after a
                      bank deposit. If something you have paid is missing here,
                      the office can find it from your deposit slip or
                      transaction number.
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
