"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  HeartPulse,
  Snowflake,
  Stethoscope,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SickBay } from "@/components/welfare/sick-bay";
import {
  Doorway,
  Figure,
  RepeatVisitors,
} from "@/components/welfare/welfare-parts";
import { useUpcomingActivities, type Activity } from "@/hooks/use-activities";
import { useClinicSummary, useClinicVisits } from "@/hooks/use-clinic";
import { usePocketMoneyOverview } from "@/hooks/use-pocket-money";
import { useAuthStore } from "@/stores/auth-store";

/** Rwandan francs, written the way they are said. */
export function frw(amount: number | undefined | null): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "RWF 0";
  return `RWF ${amount.toLocaleString()}`;
}

/** The day and time of something coming up, without the year. */
export function whenIs(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(date) - midnight(now)) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days > 1 && days < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: "long" })}, ${time}`;
  }
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * The boarding master's and mistress's dashboard.
 *
 * A patron or matron opens this at the start of a shift, and the question
 * they are answering is "what changed while I was off". Not a wall of
 * statistics: who is not in the dormitory tonight, how much of the students'
 * money is in the safe, and what is happening this week that changes the
 * routine.
 *
 * Deliberately narrow. Nothing academic appears here — a matron has no
 * business reading marks, and the API refuses her anyway.
 */
export default function BoardingDashboard() {
  const user = useAuthStore((s) => s.user);
  const side = user?.role === "MATRON" ? "the girls' side" : "the boys' side";

  const { data: sickBay, isLoading: sickBayLoading } = useClinicVisits({
    inSickBay: "true",
    limit: 20,
  });
  const { data: summary, isLoading: summaryLoading } = useClinicSummary(30);
  const { data: money, isLoading: moneyLoading } = usePocketMoneyOverview({
    limit: 100,
  });
  const { data: activities, isLoading: activitiesLoading } =
    useUpcomingActivities(4);

  const resting = sickBay?.data ?? [];
  const accounts = money?.items ?? [];
  const frozen = accounts.filter((a: { isFrozen?: boolean }) => a.isFrozen).length;
  const empty = accounts.filter(
    (a: { hasAccount?: boolean; balance?: number }) =>
      a.hasAccount && (a.balance ?? 0) === 0,
  ).length;

  // One sentence that says how the school is, before any number does.
  const standing = sickBayLoading
    ? "Checking on everyone…"
    : resting.length === 0
      ? `All quiet on ${side}. Nobody is in the sick bay.`
      : `${resting.length} ${resting.length === 1 ? "student is" : "students are"} resting in the sick bay.`;

  return (
    <div>
      <PageHeader
        title={<>Good day, {user?.firstName}</>}
        description={standing}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* The lead: who is not in the dormitory. */}
        <div className="lg:col-span-2">
          <SickBay visits={resting} isLoading={sickBayLoading} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Figure
              icon={Wallet}
              label="Money held"
              value={moneyLoading ? "…" : frw(money?.totalHeld)}
              hint={`Across ${money?.meta?.total ?? 0} students`}
            />
            <Figure
              icon={Snowflake}
              label="Frozen accounts"
              value={moneyLoading ? "…" : frozen}
              tone={frozen > 0 ? "warning" : "plain"}
              hint={empty > 0 ? `${empty} with nothing left` : "None on hold"}
            />
          </div>
          <Figure
            icon={Stethoscope}
            label="Clinic, 30 days"
            value={summaryLoading ? "…" : (summary?.visits ?? 0)}
            hint={
              summary?.referred
                ? `${summary.referred} referred to hospital`
                : "None referred out"
            }
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Coming up */}
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
                <CalendarDays className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[0.95rem] font-semibold tracking-tight text-foreground">
                  Coming up
                </h2>
                <p className="text-xs text-muted">
                  Trips, visiting days and assemblies
                </p>
              </div>
            </div>
            <Link
              href="/admin/activities"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-accent-light"
            >
              All activities
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </header>

          {activitiesLoading ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-muted" />
              ))}
            </div>
          ) : (activities ?? []).length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-muted">Nothing is scheduled yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(activities ?? []).map((activity: Activity) => (
                <li key={activity.id} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-foreground">
                      {activity.title || "Untitled"}
                    </span>
                    <span className="flex-shrink-0 text-xs tabular-nums text-muted">
                      {whenIs(activity.startsAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[
                      activity.location,
                      activity.requiresConsent ? "Consent needed" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No location set"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <RepeatVisitors
          students={summary?.repeatVisitors}
          days={summary?.days ?? 30}
          isLoading={summaryLoading}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Doorway
          href="/admin/pocket-money"
          label="Pocket money"
          description="Hand out cash, top up, freeze an account"
          icon={Wallet}
        />
        <Doorway
          href="/admin/health"
          label="The clinic"
          description="Record a visit, discharge, give medicine"
          icon={HeartPulse}
        />
        <Doorway
          href="/admin/activities"
          label="Activities"
          description="Registers, consent and who is coming"
          icon={CalendarDays}
        />
      </div>
    </div>
  );
}
