"use client";

import { useState } from "react";
import { Badge, Card, CardTitle, PageSpinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useMyChildren } from "@/hooks/use-children";
import {
  useEmergencyCard,
  useStudentMedication,
  useStudentVisits,
  type ClinicOutcome,
  type ClinicSeverity,
  type ClinicVisit,
  type Dose,
} from "@/hooks/use-clinic";
import { HeartPulse, Phone, Pill } from "lucide-react";
import { KeptPrivateNotice } from "@/components/parent/kept-private-notice";
import { keptPrivate } from "@/lib/kept-private";

const OUTCOMES: Record<ClinicOutcome, string> = {
  RETURNED_TO_CLASS: "Went back to class",
  RESTING_IN_SICK_BAY: "Rested in the sick bay",
  REFERRED_OUT: "Sent to a health centre",
  SENT_HOME: "Collected from school",
};

const SEVERITIES: Record<ClinicSeverity, string> = {
  MINOR: "Minor",
  MODERATE: "Moderate",
  SERIOUS: "Serious",
};

const SEVERITY_STYLE: Record<ClinicSeverity, "default" | "warning" | "danger"> = {
  MINOR: "default",
  MODERATE: "warning",
  SERIOUS: "danger",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A parent's view of the sick bay.
 *
 * Read-only on purpose: the record is the school's clinical note, and a parent
 * editing it would make it worthless as evidence. What they get instead is the
 * thing they were never given before, which is knowing at all.
 */
export default function ParentHealthPage() {
  const { data: children } = useMyChildren();
  /**
   * Null until the parent picks. Most parents here have one child, so falling
   * back to the first means the page is useful the moment it loads without a
   * copy of the choice to keep in step with the list arriving.
   */
  const [picked, setPicked] = useState<string | null>(null);
  const childId = picked ?? children?.[0]?.id ?? "";
  const setChildId = (id: string) => setPicked(id);

  const { data: card, isLoading, error } = useEmergencyCard(childId || undefined);
  // An adult child may keep their health visits from their parents (A8).
  const kept = keptPrivate(error);
  const { data: visitPage } = useStudentVisits(childId || undefined);
  const { data: doses } = useStudentMedication(childId || undefined);

  const visits: ClinicVisit[] = visitPage?.data ?? [];
  const record = card?.student?.healthRecord;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Health"
          description="Every time the school has looked after your child"
        />
        {(children?.length ?? 0) > 1 && (
          <select
            aria-label="Child"
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
          >
            {children?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : kept ? (
        <KeptPrivateNotice message={kept} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card padding="sm" className="border-danger/40 bg-danger/5">
              {/* `text-muted` on this tint is 4.49:1 - one hundredth under AA.
                  The darker of the two secondary greys clears it at 6.56:1,
                  and this is the card that tells a nurse what a child cannot
                  be given. */}
              <p className="text-xs text-foreground-muted">Allergic to</p>
              <p className="mt-1 font-semibold">
                {card?.student?.allergies ||
                  record?.allergyNotes ||
                  "Nothing on record"}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-muted">Blood type</p>
              <p className="mt-1 font-semibold">
                {card?.student?.bloodType || "Not recorded"}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-muted">Long-term conditions</p>
              <p className="mt-1 font-semibold">
                {record?.chronicConditions || "None recorded"}
              </p>
            </Card>
          </div>

          {record?.emergencyContactPhone && (
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted">
                    Who the school rings first
                  </p>
                  <p className="font-semibold">
                    {record.emergencyContactName}
                    {record.emergencyRelationship &&
                      ` (${record.emergencyRelationship})`}
                    <span className="ml-2 font-mono font-normal">
                      {record.emergencyContactPhone}
                    </span>
                  </p>
                </div>
              </div>
            </Card>
          )}

          <section>
            <CardTitle>Visits to the sick bay</CardTitle>
            {visits.length === 0 ? (
              <Card className="mt-2">
                <div className="py-10 text-center text-muted">
                  <HeartPulse className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p>Your child has not been to the sick bay.</p>
                </div>
              </Card>
            ) : (
              <div className="mt-2 space-y-3">
                {visits.map((v) => (
                  <Card key={v.id}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{v.complaint}</h3>
                          <Badge variant={SEVERITY_STYLE[v.severity]}>
                            {SEVERITIES[v.severity]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {when(v.visitedAt)} · seen by {v.seenBy.firstName}{" "}
                          {v.seenBy.lastName}
                        </p>
                        {v.treatment && (
                          <p className="mt-1 text-sm">
                            <span className="text-muted">Given: </span>
                            {v.treatment}
                          </p>
                        )}
                        {v.referredTo && (
                          <p className="mt-1 text-sm">
                            <span className="text-muted">Sent to: </span>
                            {v.referredTo}
                          </p>
                        )}
                      </div>
                      <Badge variant="info">{OUTCOMES[v.outcome]}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <CardTitle>Medicine given at school</CardTitle>
            {(doses?.length ?? 0) === 0 ? (
              <Card className="mt-2">
                <div className="py-8 text-center text-muted">
                  <Pill className="mx-auto mb-3 h-8 w-8 opacity-40" />
                  <p>Nothing has been given.</p>
                </div>
              </Card>
            ) : (
              <Card className="mt-2">
                <ul className="space-y-2 text-sm">
                  {doses!.map((d: Dose) => (
                    <li key={d.id} className="flex flex-wrap justify-between gap-2">
                      <span>
                        <span className="font-medium">{d.medicine}</span> · {d.dose}
                        {d.reason && (
                          <span className="text-muted"> · {d.reason}</span>
                        )}
                      </span>
                      <span className="text-muted">
                        {when(d.givenAt)} · {d.givenBy.firstName}{" "}
                        {d.givenBy.lastName}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
