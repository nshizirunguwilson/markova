"use client";

import { useState } from "react";
import { Badge, Card, PageSpinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/stores/auth-store";
import {
  useStudentActivities,
  type Activity,
  type ActivityKind,
} from "@/hooks/use-activities";
import { CalendarDays, MapPin } from "lucide-react";

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
  });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * What is on, for one student.
 *
 * A student's question is never "list the school calendar" - it is "what am I
 * meant to be at, and is there anything I still need a slip for". So the
 * permission line sits on the card and says what to do about it.
 */
export default function StudentActivitiesPage() {
  const { user } = useAuthStore();
  const [kind, setKind] = useState("");
  const { data, isLoading } = useStudentActivities(user?.studentId);

  const all: Activity[] = data ?? [];
  const items = kind ? all.filter((a) => a.kind === kind) : all;

  return (
    <div className="space-y-5">
      <PageHeader
        title="What's on"
        description="Clubs, matches, trips and school events for you"
      />

      <Card padding="sm">
        <select
          className="rounded-lg border border-input px-3 py-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="All kinds"
        >
          <option value="">All kinds</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-muted">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>Nothing coming up right now.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{a.title}</h3>
                    <Badge variant="default">{KIND_LABELS[a.kind]}</Badge>
                    {a.myPlace && <Badge variant="info">You are on the list</Badge>}
                  </div>
                  {a.description && (
                    <p className="mt-1 text-sm text-muted">{a.description}</p>
                  )}
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

                {a.requiresConsent && (
                  <div className="shrink-0 sm:text-right">
                    {a.myPlace?.consent === "GIVEN" ? (
                      <Badge variant="success">Permission given</Badge>
                    ) : a.myPlace?.consent === "REFUSED" ? (
                      <Badge variant="danger">Not allowed to go</Badge>
                    ) : (
                      <div>
                        <Badge variant="warning">Needs permission</Badge>
                        <p className="mt-1 max-w-48 text-xs text-muted">
                          Your parent has not answered yet.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
