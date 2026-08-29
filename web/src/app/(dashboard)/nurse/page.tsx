"use client";

import {
  Ambulance,
  HeartPulse,
  MessageSquare,
  Pill,
  Stethoscope,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SickBay } from "@/components/welfare/sick-bay";
import {
  Doorway,
  Figure,
  RepeatVisitors,
} from "@/components/welfare/welfare-parts";
import { useClinicSummary, useClinicVisits } from "@/hooks/use-clinic";
import { useAuthStore } from "@/stores/auth-store";

/**
 * The school nurse's dashboard.
 *
 * The same sick bay the boarding staff see, framed differently: to a matron
 * it is a list of empty beds, to the nurse it is her ward. What she has that
 * they do not is the clinical picture - how many visits this month, who was
 * sent to hospital, and which students keep coming back, which is the only
 * thing in these records that a single visit cannot tell you.
 *
 * She sees nothing academic. A nurse has no business reading marks, and the
 * API refuses her regardless of what this page asks for.
 */
export default function NurseDashboard() {
  const user = useAuthStore((s) => s.user);

  const { data: sickBay, isLoading: sickBayLoading } = useClinicVisits({
    inSickBay: "true",
    limit: 20,
  });
  const { data: summary, isLoading: summaryLoading } = useClinicSummary(30);

  const resting = sickBay?.data ?? [];
  const serious = resting.filter(
    (v: { severity?: string | null }) => v.severity === "SERIOUS",
  ).length;
  const unnotified = resting.filter(
    (v: { parentNotifiedAt?: string | null }) => !v.parentNotifiedAt,
  ).length;

  // The state of the ward, in a sentence, before any number.
  const standing = sickBayLoading
    ? "Checking the ward…"
    : resting.length === 0
      ? "The sick bay is empty."
      : serious > 0
        ? `${resting.length} resting, ${serious} of them serious.`
        : `${resting.length} ${resting.length === 1 ? "student" : "students"} resting in the sick bay.`;

  return (
    <div>
      <PageHeader
        title={<>Good day, {user?.firstName}</>}
        description={standing}
      />

      {/*
        A parent who has not been told their child is in the sick bay is the
        one thing on this page that is somebody's fault if it stays true, so
        it sits above the ward rather than inside it.
      */}
      {!sickBayLoading && unnotified > 0 && (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-wash px-4 py-3"
        >
          <Ambulance className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
          <p className="text-sm text-warning">
            <span className="font-semibold">
              {unnotified} {unnotified === 1 ? "parent has" : "parents have"} not been
              told
            </span>{" "}
            that their child is in the sick bay.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SickBay visits={resting} isLoading={sickBayLoading} />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Figure
            icon={Stethoscope}
            label="Seen, 30 days"
            value={summaryLoading ? "…" : (summary?.visits ?? 0)}
            hint="Visits recorded"
          />
          <Figure
            icon={Ambulance}
            label="Referred out"
            value={summaryLoading ? "…" : (summary?.referred ?? 0)}
            tone={(summary?.referred ?? 0) > 0 ? "warning" : "plain"}
            hint="Sent to hospital"
          />
          <Figure
            icon={Pill}
            label="Doses given"
            value={summaryLoading ? "…" : (summary?.dosesGiven ?? 0)}
            hint="Medicine administered"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RepeatVisitors
          students={summary?.repeatVisitors}
          days={summary?.days ?? 30}
          isLoading={summaryLoading}
        />

        <div className="grid content-start gap-3">
          <Doorway
            href="/admin/health"
            label="The clinic"
            description="Record a visit, discharge, give medicine"
            icon={HeartPulse}
          />
          <Doorway
            href="/messages"
            label="Messages"
            description="Reach a parent, a matron or the office"
            icon={MessageSquare}
          />
        </div>
      </div>
    </div>
  );
}
