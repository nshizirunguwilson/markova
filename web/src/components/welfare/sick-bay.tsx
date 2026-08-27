"use client";

import Link from "next/link";
import { BedDouble, ChevronRight, Thermometer } from "lucide-react";

import { classDisplayName } from "@/lib/utils";

/**
 * Who is lying down in the sick bay, right now.
 *
 * This is the first thing both a matron and the nurse need at the start of a
 * shift, and it is a list of people rather than a number: a count of five
 * tells a matron that five beds are empty in the dormitory but not which
 * ones. Names, class, what is wrong and how long they have been there is what
 * makes it actionable.
 */

export interface SickBayVisit {
  id: string;
  complaint?: string | null;
  severity?: string | null;
  temperature?: number | null;
  visitedAt: string;
  parentNotifiedAt?: string | null;
  student?: {
    id?: string;
    studentIdNumber?: string | null;
    isBoarder?: boolean | null;
    user?: { firstName?: string | null; lastName?: string | null } | null;
    classSection?: {
      name?: string | null;
      classLevel?: { name?: string | null } | null;
      trade?: { code?: string | null } | null;
    } | null;
  } | null;
}

/** How long someone has been resting, in the words a person would use. */
export function restingFor(since: string, now: Date = new Date()): string {
  const start = new Date(since);
  if (Number.isNaN(start.getTime())) return "";
  const minutes = Math.max(0, Math.round((now.getTime() - start.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** A temperature worth acting on, in the colour that says so. */
export function feverTone(temperature: number | null | undefined): string {
  if (typeof temperature !== "number") return "text-muted";
  if (temperature >= 38.5) return "text-danger";
  if (temperature >= 37.8) return "text-warning";
  return "text-muted";
}

const SEVERITY: Record<string, { label: string; className: string }> = {
  SERIOUS: { label: "Serious", className: "bg-danger-wash text-danger" },
  MODERATE: { label: "Moderate", className: "bg-warning-wash text-warning" },
  MINOR: { label: "Minor", className: "bg-surface-muted text-muted" },
};

function studentName(visit: SickBayVisit): string {
  const u = visit.student?.user;
  return `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim() || "A student";
}

export function SickBay({
  visits,
  isLoading,
  href = "/admin/health",
}: {
  visits: SickBayVisit[] | undefined;
  isLoading?: boolean;
  href?: string;
}) {
  const resting = visits ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
            <BedDouble className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h2 className="text-[0.95rem] font-semibold tracking-tight text-foreground">
              In the sick bay
            </h2>
            <p className="text-xs text-muted">
              {isLoading
                ? "Checking…"
                : resting.length === 0
                  ? "Nobody is resting"
                  : `${resting.length} ${resting.length === 1 ? "student" : "students"} resting now`}
            </p>
          </div>
        </div>
        <Link
          href={href}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-accent-light"
        >
          The clinic
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {isLoading ? (
        <div className="space-y-2 p-5">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : resting.length === 0 ? (
        // An empty sick bay is good news, and should read as good news rather
        // than as a page that failed to load.
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Every bed is free</p>
          <p className="mt-1 text-xs text-muted">
            Nobody is resting in the sick bay at the moment.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {resting.map((visit) => {
            const severity = SEVERITY[visit.severity ?? ""] ?? SEVERITY.MINOR;
            return (
              <li key={visit.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[0.8rem] font-semibold text-primary">
                  {studentName(visit).charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-foreground">
                      {studentName(visit)}
                    </span>
                    <span className="text-xs text-muted">
                      {classDisplayName(visit.student?.classSection)}
                    </span>
                    {visit.student?.isBoarder && (
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted">
                        Boarder
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
                    {visit.complaint || "No complaint recorded"}
                  </p>
                </div>

                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${severity.className}`}
                  >
                    {severity.label}
                  </span>
                  <span className="flex items-center gap-1.5 text-[0.7rem] tabular-nums text-muted">
                    {typeof visit.temperature === "number" && (
                      <span className={`flex items-center gap-0.5 ${feverTone(visit.temperature)}`}>
                        <Thermometer className="h-3 w-3" />
                        {visit.temperature.toFixed(1)}°
                      </span>
                    )}
                    {restingFor(visit.visitedAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
