"use client";

import { useState } from "react";
import { Route } from "lucide-react";

import { Badge, Button, Card, CardTitle, Input, Modal } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";
import { useSections } from "@/hooks/use-academic";
import { useJourney, useJourneyStep, type JourneyAction } from "@/hooks/use-journey";
import { classDisplayName } from "@/lib/utils";
import {
  JOURNEY_STEP_LABEL,
  LEAVING,
  STANDING_LABEL,
  dayWords,
  pauseWords,
  schoolToday,
  type StudentStatus,
} from "@/lib/standing";

const TITLE: Record<JourneyAction, string> = {
  suspend: "Suspend",
  away: "Time away from school",
  back: "Back at school",
  leave: "Leaves the school",
  "passed-away": "Passed away",
  readmit: "Readmit",
};

/** What each step does, said before it is taken. */
const WHAT_HAPPENS: Record<JourneyAction, string> = {
  suspend:
    "On those days the student shows as suspended on the register, is never marked absent, and the family gets no absence texts. They can still sign in for homework, and read the class chat without posting. Their card is refused at the gate.",
  away:
    "For illness, a new baby, or other time away the school agreed. The register shows them as away, and the family gets no absence texts.",
  back: "The suspension or time away ends the day before this.",
  leave:
    "The student comes off every register and the class chat, and their card stops working. They can still sign in to see their past report cards. Nothing is deleted.",
  "passed-away":
    "Nothing more is ever sent about this student, to anyone. They come off every register and the class chat, and nobody can sign in as them. Their record and past report cards are kept, and their family can still open them.",
  readmit:
    "The student is back on the roll in the class you choose, with all their history kept.",
};

/**
 * Where a student stands, how they got here, and the next step.
 *
 * Suspending and time away are for the principal and the Director of
 * Studies. Taking a student off the roll, or back onto it, is the
 * principal's alone. See docs/STUDENT-LIFE-DESIGN.md.
 */
export function StudentJourney({
  studentId,
  userId,
  name,
}: {
  studentId: string;
  userId: string;
  name: string;
}) {
  const role = useAuthStore((s) => s.user?.role);
  const { data: journey, isLoading } = useJourney(studentId);
  const step = useJourneyStep(studentId, userId);
  const { data: sections } = useSections();

  const [action, setAction] = useState<JourneyAction | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (isLoading || !journey) return null;

  const status = journey.status as StudentStatus;
  const onRoll = status === "ACTIVE";
  const paused = journey.pause ?? journey.upcoming;
  const mayPause = role === "ADMIN" || role === "HEAD_TEACHER";
  const principal = role === "ADMIN";

  const open = (next: JourneyAction) => {
    const today = schoolToday();
    setForm(
      next === "suspend" || next === "away"
        ? { startsOn: today, endsOn: "", reason: "", note: "" }
        : next === "leave"
          ? { status: "WITHDRAWN", on: today, reason: "", note: "" }
          : next === "readmit"
            ? { on: today, classSectionId: "", reason: "", note: "" }
            : { on: today, note: "" },
    );
    setAction(next);
  };

  const submit = (action: JourneyAction) => {
    const body = Object.fromEntries(
      Object.entries(form).filter(([, v]) => v.trim() !== ""),
    );
    step.mutate(
      { action, body },
      { onSuccess: () => setAction(null) },
    );
  };

  const needsReason = action !== "back" && action !== "passed-away";
  const ready =
    !!action &&
    (!needsReason || (form.reason ?? "").trim().length >= 3) &&
    (action !== "suspend" || !!form.endsOn) &&
    (action !== "readmit" || !!form.classSectionId);

  return (
    <Card>
      <CardTitle>Journey</CardTitle>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2" data-testid="journey-standing">
          <Badge variant={onRoll ? "success" : "default"}>
            {STANDING_LABEL[status]}
          </Badge>
          {journey.pause && (
            <Badge variant="warning">{pauseWords(journey.pause)}</Badge>
          )}
          {!journey.pause && journey.upcoming && (
            <Badge>
              {journey.upcoming.kind === "SUSPENDED" ? "Suspended" : "Away"} from{" "}
              {dayWords(journey.upcoming.startsOn)}
            </Badge>
          )}
        </div>
        {(journey.pause ?? journey.upcoming)?.reason && (
          <p className="text-sm text-muted">{(journey.pause ?? journey.upcoming).reason}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {onRoll && mayPause && !paused && (
            <>
              <Button size="sm" variant="outline" onClick={() => open("suspend")}>
                Suspend
              </Button>
              <Button size="sm" variant="outline" onClick={() => open("away")}>
                Time away
              </Button>
            </>
          )}
          {onRoll && mayPause && paused && (
            <Button size="sm" variant="outline" onClick={() => open("back")}>
              Back at school
            </Button>
          )}
          {onRoll && principal && (
            <Button size="sm" variant="outline" onClick={() => open("leave")}>
              Leaves the school
            </Button>
          )}
          {!onRoll && status !== "PASSED_AWAY" && principal && (
            <Button size="sm" variant="outline" onClick={() => open("readmit")}>
              Readmit
            </Button>
          )}
          {status !== "PASSED_AWAY" && principal && (
            <Button size="sm" variant="ghost" onClick={() => open("passed-away")}>
              Passed away
            </Button>
          )}
        </div>

        {journey.entries.length > 0 ? (
          <ol className="space-y-2 border-t border-border pt-3" aria-label="Journey so far">
            {journey.entries.map((e: any) => (
              <li key={e.id} className="flex gap-2 text-sm">
                <Route aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="text-foreground">
                    <span className="font-medium">{JOURNEY_STEP_LABEL[e.step] ?? e.step}</span>{" "}
                    <span className="text-muted">
                      {dayWords(e.happenedOn)}
                      {e.until ? ` to ${dayWords(e.until)}` : ""}
                    </span>
                  </p>
                  {e.reason && <p className="text-muted">{e.reason}</p>}
                  {e.classSection && (
                    <p className="text-muted">Into {classDisplayName(e.classSection)}</p>
                  )}
                  {e.recordedBy && (
                    <p className="text-xs text-muted">
                      By {e.recordedBy.firstName} {e.recordedBy.lastName}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">Nothing has changed since {name} joined.</p>
        )}
      </div>

      <Modal
        isOpen={!!action}
        onClose={() => setAction(null)}
        title={action ? `${TITLE[action]}: ${name}` : ""}
      >
        {action && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{WHAT_HAPPENS[action]}</p>

            {action === "leave" && (
              <div>
                <label htmlFor="j-status" className="mb-1 block text-sm font-medium text-foreground">
                  How they leave
                </label>
                <select
                  id="j-status"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  {LEAVING.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(action === "suspend" || action === "away") && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="First day out"
                  type="date"
                  value={form.startsOn}
                  onChange={(e) => set("startsOn", e.target.value)}
                />
                <Input
                  label={action === "suspend" ? "Last day out" : "Last day out (if known)"}
                  type="date"
                  value={form.endsOn}
                  onChange={(e) => set("endsOn", e.target.value)}
                />
              </div>
            )}

            {action !== "suspend" && action !== "away" && (
              <Input
                label={action === "back" ? "First day back" : "Date"}
                type="date"
                value={form.on}
                onChange={(e) => set("on", e.target.value)}
              />
            )}

            {action === "readmit" && (
              <div>
                <label htmlFor="j-class" className="mb-1 block text-sm font-medium text-foreground">
                  Into which class
                </label>
                <select
                  id="j-class"
                  value={form.classSectionId}
                  onChange={(e) => set("classSectionId", e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="">Choose a class</option>
                  {(sections ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {classDisplayName(s)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {needsReason && (
              <Input
                label="Reason"
                value={form.reason}
                onChange={(e) => set("reason", e.target.value)}
                placeholder={
                  action === "away"
                    ? "Recovering from an operation"
                    : action === "readmit"
                      ? "Back to repeat the year"
                      : "What happened"
                }
              />
            )}

            <Input
              label="Note (optional)"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                variant={action === "passed-away" || action === "leave" ? "danger" : "primary"}
                disabled={!ready}
                isLoading={step.isPending}
                onClick={() => submit(action)}
              >
                {TITLE[action]}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
