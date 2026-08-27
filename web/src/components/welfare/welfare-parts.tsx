"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Repeat2 } from "lucide-react";

/**
 * The smaller pieces the boarding and clinic dashboards are built from.
 */

/**
 * One figure, stated quietly.
 *
 * These sit under the panel that matters, not beside it. A row of four equal
 * cards gives "students resting in the sick bay right now" the same weight as
 * "doses given this month", and only one of those needs acting on today.
 */
export function Figure({
  label,
  value,
  hint,
  icon: Icon,
  tone = "plain",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "plain" | "warning" | "danger";
}) {
  const tones = {
    plain: "text-muted",
    warning: "text-warning",
    danger: "text-danger",
  };
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${tones[tone]}`} />
        <span className="text-[0.7rem] font-medium uppercase tracking-wider text-muted">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export interface RepeatVisitor {
  id: string;
  studentIdNumber?: string | null;
  visits: number;
  user?: { firstName?: string | null; lastName?: string | null } | null;
  classSection?: { name?: string | null } | null;
}

/**
 * Students who keep coming back to the clinic.
 *
 * Three visits in a month is rarely three unrelated illnesses. It is the one
 * thing in the clinic's records that says something a single visit cannot,
 * which is why it is on the dashboard rather than buried in a report.
 */
export function RepeatVisitors({
  students,
  days,
  isLoading,
}: {
  students: RepeatVisitor[] | undefined;
  days: number;
  isLoading?: boolean;
}) {
  const list = students ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-wash text-warning">
          <Repeat2 className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="text-[0.95rem] font-semibold tracking-tight text-foreground">
            Seen more than once
          </h2>
          <p className="text-xs text-muted">In the last {days} days</p>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted">
            Nobody has been to the clinic twice this month.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((student) => (
            <li key={student.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {`${student.user?.firstName ?? ""} ${student.user?.lastName ?? ""}`.trim() ||
                    "A student"}
                </p>
                <p className="truncate text-xs text-muted">
                  {[student.classSection?.name, student.studentIdNumber]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className="flex-shrink-0 rounded-full bg-warning-wash px-2.5 py-0.5 text-xs font-semibold tabular-nums text-warning">
                {student.visits} visits
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A card that is really a doorway: a short label, what is behind it, and an
 * arrow. Used instead of a row of buttons, which say where they go but never
 * why you would.
 */
export function Doorway({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-accent-light"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
