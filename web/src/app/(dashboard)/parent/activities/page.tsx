"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, PageSpinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useMyChildren } from "@/hooks/use-children";
import {
  useRecordConsent,
  useStudentActivities,
  type Activity,
  type ActivityKind,
} from "@/hooks/use-activities";
import { CalendarDays, Check, MapPin, X } from "lucide-react";

const KIND_LABELS: Record<ActivityKind, string> = {
  CLUB: "Club",
  SPORT: "Sport",
  ASSEMBLY: "Assembly",
  TRIP: "Trip",
  VISITING_DAY: "Visiting day",
  SCHOOL_EVENT: "School event",
};

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The permission slip, without the paper.
 *
 * A slip in a schoolbag is the reason offices chase parents by phone the night
 * before a trip. The things that still need an answer are pulled to the top,
 * because that is the whole job of this page.
 */
export default function ParentActivitiesPage() {
  const { data: children } = useMyChildren();
  /**
   * Null until the parent picks. Most parents here have one child, so falling
   * back to the first means the page is useful the moment it loads without a
   * copy of the choice to keep in step with the list arriving.
   */
  const [picked, setPicked] = useState<string | null>(null);
  const childId = picked ?? children?.[0]?.id ?? "";
  const setChildId = (id: string) => setPicked(id);

  const { data, isLoading } = useStudentActivities(childId || undefined);
  const consent = useRecordConsent();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const all: Activity[] = data ?? [];
  const needsAnswer = all.filter(
    (a) => a.requiresConsent && (!a.myPlace || a.myPlace.consent === "PENDING"),
  );
  const rest = all.filter((a) => !needsAnswer.includes(a));

  const answer = (activityId: string, value: "GIVEN" | "REFUSED") =>
    consent.mutate({
      activityId,
      studentId: childId,
      consent: value,
      note: notes[activityId]?.trim() || undefined,
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Activities"
          description="What the school has planned, and what needs your permission"
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
      ) : (
        <>
          {needsAnswer.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                Waiting for your answer ({needsAnswer.length})
              </h2>
              <div className="space-y-3">
                {needsAnswer.map((a) => (
                  <Card key={a.id} className="border-warning/40 bg-warning/5">
                    <ActivityFacts activity={a} />
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <Input
                        id={`note-${a.id}`}
                        label="Anything the school should know (optional)"
                        className="sm:w-96"
                        value={notes[a.id] ?? ""}
                        onChange={(e) =>
                          setNotes((n) => ({ ...n, [a.id]: e.target.value }))
                        }
                        placeholder="e.g. gets travel sick, please seat at the front"
                      />
                      <Button
                        onClick={() => answer(a.id, "GIVEN")}
                        isLoading={consent.isPending}
                      >
                        <Check className="mr-2 h-4 w-4" /> I agree
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => answer(a.id, "REFUSED")}
                      >
                        <X className="mr-2 h-4 w-4" /> Not going
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Everything else
            </h2>
            {rest.length === 0 ? (
              <Card>
                <div className="py-10 text-center text-muted">
                  <CalendarDays className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p>Nothing else on the calendar.</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {rest.map((a) => (
                  <Card key={a.id}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <ActivityFacts activity={a} />
                      {a.requiresConsent && (
                        <Badge
                          variant={
                            a.myPlace?.consent === "GIVEN" ? "success" : "danger"
                          }
                        >
                          {a.myPlace?.consent === "GIVEN"
                            ? "You agreed"
                            : "You said no"}
                        </Badge>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ActivityFacts({ activity: a }: { activity: Activity }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-foreground">{a.title}</h3>
        <Badge variant="default">{KIND_LABELS[a.kind]}</Badge>
      </div>
      {a.description && <p className="mt-1 text-sm text-muted">{a.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-4 w-4" />
          {dayOf(a.startsAt)} at {timeOf(a.startsAt)}
        </span>
        {a.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {a.location}
          </span>
        )}
      </div>
    </div>
  );
}
