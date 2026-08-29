"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  PageSpinner,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import {
  useApplicationQueue,
  useExpireOffers,
  useIntakes,
} from "@/hooks/use-admissions";
import {
  BUCKETS,
  STATUS_LABEL,
  STATUS_VARIANT,
  ageOf,
  completenessLine,
  completenessTone,
  examLine,
  expiresIn,
  waitingFor,
  type ApplicationStatus,
} from "@/lib/admissions";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Search,
  Settings2,
  TimerReset,
} from "lucide-react";

/**
 * The admissions desk.
 *
 * A reviewer's job here is triage, not data entry, so the page is built around
 * the one question they are actually asking: which of these can I decide right
 * now, and which are waiting on somebody else.
 *
 * Four decisions run through it:
 *
 *   **The tabs are questions, not states.** "Needs a decision" holds both
 *   SUBMITTED and UNDER_REVIEW, because somebody opening the page wants their
 *   pile rather than a taxonomy. The state is still on every row, in the badge.
 *
 *   **Completeness is a column, not a detail.** "5 of 7, missing 2" decides
 *   whether an application can be acted on at all, so it sits beside the name.
 *
 *   **The badge carries the clock.** "Asked 9 days ago" and "expires in 4
 *   days" are what a reviewer needs; the state alone says nothing about
 *   whether to chase.
 *
 *   **Oldest first, never alphabetical.** The family who has waited longest is
 *   the one the school owes an answer to.
 */
export default function AdmissionsDeskPage() {
  const [intakeId, setIntakeId] = useState("");
  const [bucket, setBucket] = useState("TO_DECIDE");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data: intakes } = useIntakes();
  const { data, isLoading } = useApplicationQueue({
    intakeId: intakeId || undefined,
    bucket,
    search: search || undefined,
    page,
    limit,
  });
  const expire = useExpireOffers();

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Page one whenever the pile narrows: landing on page three of a shorter
  // list is an empty table and reads as a fault.
  const narrow = (change: () => void) => {
    change();
    setPage(1);
  };

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const counts = data?.buckets ?? {};

  /* Only the rounds still taking applications carry a places figure worth
     showing; a closed round's is history. */
  const openRounds = (intakes ?? []).filter((i) => i.isOpen);

  return (
    <div>
      <PageHeader
        title="Admissions"
        description="Applications from the school's admissions site, oldest waiting first"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Intake"
              value={intakeId}
              onChange={(e) => narrow(() => setIntakeId(e.target.value))}
              className="rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="">Every intake</option>
              {intakes?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <Link href="/admin/admissions/intakes">
              <Button variant="secondary">
                <Settings2 className="mr-2 h-4 w-4" /> Intakes
              </Button>
            </Link>
          </div>
        }
      />

      {/*
        Places left, per open round. An outstanding offer is a place spent, so
        this is the number that decides whether the school can offer at all,
        and it belongs where somebody is about to offer.
      */}
      {openRounds.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {openRounds.map((round) => (
            <Card key={round.id} padding="sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {round.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {round.total} application{round.total === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p
                    className={`text-2xl font-bold tabular-nums ${
                      round.placesLeft === 0 ? "text-danger" : "text-primary"
                    }`}
                  >
                    {round.placesLeft}
                  </p>
                  <p className="text-xs text-muted">
                    of {round.places} left
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card padding="sm" className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => narrow(() => setBucket(b.value))}
              aria-pressed={bucket === b.value}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                bucket === b.value
                  ? "bg-primary text-on-primary"
                  : "border border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {b.label}
              {/* No opacity on the count: dimming the token that is already
                  the muted one puts it under 4.5:1 on the tab it sits in. */}
              {counts[b.value] != null && (
                <span className="ml-2 font-medium tabular-nums">
                  {counts[b.value]}
                </span>
              )}
            </button>
          ))}
          <span className="flex-1" />
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, reference or phone..."
              aria-label="Search applications"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
          {/* Offered a place and never answered. Only worth offering when
              there is something to release. */}
          {bucket === "OFFERED" && (
            <Button
              variant="secondary"
              onClick={() => expire.mutate()}
              isLoading={expire.isPending}
            >
              <TimerReset className="mr-2 h-4 w-4" /> Release expired
            </Button>
          )}
        </div>
      </Card>

      <Card padding="sm">
        {isLoading ? (
          <PageSpinner />
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-muted">
            <Inbox className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">
              {search
                ? "No application matches that"
                : bucket === "TO_DECIDE"
                  ? "Nothing is waiting on a decision. The desk is clear."
                  : "Nothing in this pile"}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const age = ageOf(row.dateOfBirth);
              const mark = examLine(row.examMark, row.examTotal);
              return (
                <li key={row.id}>
                  {/*
                    The whole row is the link. A reviewer reading a name has
                    already decided, and making them travel to a button at the
                    far edge is a tax on every one of a few hundred lookups.
                  */}
                  <Link
                    href={`/admin/admissions/${row.id}`}
                    className="grid grid-cols-1 gap-3 rounded-lg px-2 py-3.5 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_150px_minmax(0,150px)] md:items-center md:gap-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {row.firstName} {row.lastName}
                      </p>
                      <p className="truncate font-mono text-xs text-muted">
                        {row.reference}
                        {age != null && ` · ${age} yrs`}
                        {row.district && ` · ${row.district}`}
                      </p>
                    </div>

                    <div className="min-w-0 text-sm text-foreground-muted">
                      <p className="truncate">
                        {row.intake.classLevel.name}
                        {row.trade && ` ${row.trade.code}`}
                        {" · "}
                        {row.isBoarder ? "Boarder" : "Day"}
                      </p>
                      {mark && (
                        <p className="truncate font-mono text-xs text-muted">
                          {row.intake.entryPoint === "TRANSFER"
                            ? row.previousSchool
                            : `Exam: ${mark}`}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted">
                        {completenessLine(row.completeness)}
                      </p>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={`h-full rounded-full ${completenessTone(
                            row.completeness,
                            row.status,
                          )}`}
                          style={{
                            width: `${Math.round(
                              (row.completeness?.fraction ?? 0) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <Badge variant={STATUS_VARIANT[row.status as ApplicationStatus]}>
                        {STATUS_LABEL[row.status as ApplicationStatus]}
                      </Badge>
                      {/*
                        The clock, not just the state. "Asked 9 days ago" is
                        what tells a reviewer whether to pick up the phone.
                      */}
                      <p className="mt-1.5 text-xs text-muted">
                        {row.status === "OFFERED" && row.offerExpiresAt
                          ? expiresIn(row.offerExpiresAt)
                          : row.status === "INFO_REQUESTED"
                            ? `asked ${waitingFor(row.sinceAt)}`
                            : `waiting ${waitingFor(row.submittedAt)}`}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted">
              {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}
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
