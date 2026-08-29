"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Input,
  Modal,
  PageSpinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useClassLevels, useSections } from "@/hooks/use-academic";
import {
  useActivities,
  useActivity,
  useActivityAttendance,
  useAddClassToActivity,
  useCancelActivity,
  useConsentSummary,
  useCreateActivity,
  useRemoveParticipant,
  type Activity,
  type ActivityKind,
} from "@/hooks/use-activities";
import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
} from "lucide-react";

const KIND_LABELS: Record<ActivityKind, string> = {
  CLUB: "Club",
  SPORT: "Sport",
  ASSEMBLY: "Assembly",
  TRIP: "Trip",
  VISITING_DAY: "Visiting day",
  SCHOOL_EVENT: "School event",
};

/** Reads the way a school reads a date: "Thu 10 Sep, 07:00". */
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function audienceOf(a: Activity): string {
  if (a.audience === "WHOLE_SCHOOL") return "Whole school";
  if (a.audience === "LEVELS") {
    return a.classLevels?.map((l) => l.classLevel.name).join(", ") || "Levels";
  }
  return a.sections?.map((s) => s.classSection.name).join(", ") || "Classes";
}

/**
 * The school calendar.
 *
 * What a head teacher cannot answer today: what is on this term, who is it
 * for, who is going, and did the parents agree. The list answers the first
 * two; opening one answers the rest.
 */
export default function ActivitiesPage() {
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [showPast, setShowPast] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useActivities({
    kind: kind || undefined,
    // A calendar is about what is coming, so the past is opt-in.
    from: showPast ? undefined : today,
    page,
    limit: 25,
  });

  // Page one on every filter change, set where the filter changes rather than
  // in an effect. Landing on page three of a smaller result is an empty table.
  const narrow = (change: () => void) => {
    change();
    setPage(1);
  };

  const items: Activity[] = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 25, totalPages: 1 };

  return (
    <div>
      <PageHeader
        title="Activities"
        description="Clubs, matches, assemblies, visiting day and trips"
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="mr-2 h-4 w-4" /> New activity
          </Button>
        }
      />

      <Card padding="sm" className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <select
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={kind}
            onChange={(e) => narrow(() => setKind(e.target.value))}
            aria-label="All kinds"
          >
            <option value="">All kinds</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => narrow(() => setShowPast(e.target.checked))}
            />
            Include what has already happened
          </label>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <PageSpinner />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>What</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Who for</TableHead>
                <TableHead>On the list</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted">
                    <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    Nothing on the calendar
                  </TableCell>
                </TableRow>
              ) : (
                items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.title}
                        <Badge variant="default">{KIND_LABELS[a.kind]}</Badge>
                        {a.requiresConsent && (
                          <Badge variant="warning">Consent needed</Badge>
                        )}
                        {a.isCancelled && <Badge variant="danger">Cancelled</Badge>}
                      </div>
                      {a.isCancelled && a.cancelledReason && (
                        <div className="mt-1 text-xs text-muted">
                          {a.cancelledReason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{when(a.startsAt)}</TableCell>
                    <TableCell className="text-sm text-muted">
                      {a.location ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted">
                      {audienceOf(a)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a._count?.participants ?? 0}
                      {a.capacity !== null && ` / ${a.capacity}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenId(a.id)}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {!isLoading && meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {(meta.page - 1) * meta.limit + 1}-
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <Button
                aria-label="Previous page"
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex items-center px-3 text-sm text-muted">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                aria-label="Next page"
                variant="outline"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Keyed on each opening so the form starts empty, rather than being
          wiped by an effect after it has already rendered with the last
          activity's text still in it. */}
      <NewActivityModal
        key={showNew ? "new-open" : "new-closed"}
        isOpen={showNew}
        onClose={() => setShowNew(false)}
      />
      <ActivityDetail key={openId ?? "none"} id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function NewActivityModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const create = useCreateActivity();
  const { data: levels } = useClassLevels();

  const [form, setForm] = useState({
    kind: "CLUB" as ActivityKind,
    title: "",
    description: "",
    location: "",
    startsAt: "",
    endsAt: "",
    audience: "WHOLE_SCHOOL" as Activity["audience"],
    requiresConsent: false,
    tracksAttendance: false,
    capacity: "",
    classLevelIds: [] as string[],
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.title.trim() || !form.startsAt) return;
    await create
      .mutateAsync({
        kind: form.kind,
        title: form.title.trim(),
        description: form.description || undefined,
        location: form.location || undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        audience: form.audience,
        requiresConsent: form.requiresConsent,
        tracksAttendance: form.tracksAttendance,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        classLevelIds:
          form.audience === "LEVELS" ? form.classLevelIds : undefined,
      })
      .then(onClose)
      .catch(() => null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New activity" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="a-kind" className="mb-1 block text-sm font-medium">
              Kind
            </label>
            <select
              id="a-kind"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as ActivityKind)}
              aria-label="Kind"
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <Input
            id="a-title"
            label="Title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Nyungwe forest trip"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="a-starts"
            label="Starts"
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
          />
          <Input
            id="a-ends"
            label="Ends"
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
          />
        </div>

        <Input
          id="a-location"
          label="Where"
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="e.g. School field"
        />

        <div>
          <label htmlFor="a-audience" className="mb-1 block text-sm font-medium">
            Who is it for
          </label>
          <select
            id="a-audience"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={form.audience}
            onChange={(e) => set("audience", e.target.value as Activity["audience"])}
            aria-label="Who is it for"
          >
            <option value="WHOLE_SCHOOL">The whole school</option>
            <option value="LEVELS">Certain year levels</option>
          </select>
        </div>

        {form.audience === "LEVELS" && (
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium">Year levels</p>
            <div className="flex flex-wrap gap-3">
              {levels?.map((l: any) => (
                <label key={l.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.classLevelIds.includes(l.id)}
                    onChange={(e) =>
                      set(
                        "classLevelIds",
                        e.target.checked
                          ? [...form.classLevelIds, l.id]
                          : form.classLevelIds.filter((id) => id !== l.id),
                      )
                    }
                  />
                  {l.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.requiresConsent}
              onChange={(e) => set("requiresConsent", e.target.checked)}
            />
            <span>
              Needs a parent&apos;s permission
              <span className="block text-xs text-muted">
                For anything off the premises.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.tracksAttendance}
              onChange={(e) => set("tracksAttendance", e.target.checked)}
            />
            <span>
              Takes a register
              <span className="block text-xs text-muted">
                A club that never checks quietly stops existing.
              </span>
            </span>
          </label>
        </div>

        <Input
          id="a-capacity"
          label="Places (optional)"
          type="number"
          min="1"
          value={form.capacity}
          onChange={(e) => set("capacity", e.target.value)}
          placeholder="No limit"
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!form.title.trim() || !form.startsAt}
            isLoading={create.isPending}
          >
            Add to calendar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * One activity: who is on the list, who has answered, and the register.
 *
 * The consent counts sit at the top because the day before a trip, "who has
 * not answered" is the only question that matters.
 */
function ActivityDetail({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data: activity } = useActivity(id ?? undefined);
  const { data: consent } = useConsentSummary(
    activity?.requiresConsent ? (id ?? undefined) : undefined,
  );
  const { data: levels } = useClassLevels();
  const [levelId, setLevelId] = useState("");
  const [reason, setReason] = useState("");
  const { data: sections } = useSections(levelId || undefined);

  const addClass = useAddClassToActivity();
  const removeOne = useRemoveParticipant();
  const cancel = useCancelActivity();
  const attendance = useActivityAttendance();

  if (!id) return null;

  const participants: any[] = activity?.participants ?? [];

  return (
    <Modal
      isOpen={!!id}
      onClose={onClose}
      title={activity?.title ?? "Activity"}
      size="lg"
    >
      {!activity ? (
        <PageSpinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge variant="default">{KIND_LABELS[activity.kind as ActivityKind]}</Badge>
            <span>{when(activity.startsAt)}</span>
            {activity.location && <span>· {activity.location}</span>}
            {activity.isCancelled && <Badge variant="danger">Cancelled</Badge>}
          </div>

          {activity.description && (
            <p className="text-sm">{activity.description}</p>
          )}

          {activity.requiresConsent && consent && (
            <div className="grid grid-cols-3 gap-3">
              <Card padding="sm">
                <p className="text-xs text-muted">Agreed</p>
                <p className="mt-1 text-2xl font-bold text-success">
                  {consent.given.length}
                </p>
              </Card>
              <Card padding="sm">
                <p className="text-xs text-muted">Refused</p>
                <p className="mt-1 text-2xl font-bold text-danger">
                  {consent.refused.length}
                </p>
              </Card>
              <Card padding="sm">
                <p className="text-xs text-muted">Not answered</p>
                <p className="mt-1 text-2xl font-bold text-warning">
                  {consent.pending.length}
                </p>
              </Card>
            </div>
          )}

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium">Add a whole class</p>
            <div className="flex flex-wrap items-end gap-2">
              <select
                className="rounded-lg border border-input px-3 py-2 text-sm"
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
                aria-label="Level"
              >
                <option value="">Level…</option>
                {levels?.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <select
                className="rounded-lg border border-input px-3 py-2 text-sm"
                disabled={!levelId}
                aria-label="Class"
                onChange={(e) => {
                  if (e.target.value) {
                    addClass.mutate({
                      activityId: id,
                      classSectionId: e.target.value,
                    });
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Class…</option>
                {sections?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {[s.trade?.code, s.name].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <CardTitle>
              On the list ({participants.length}
              {activity.capacity ? ` of ${activity.capacity}` : ""})
            </CardTitle>
            <div className="mt-2 max-h-72 overflow-y-auto">
              {participants.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  <Users className="mx-auto mb-2 h-7 w-7 opacity-40" />
                  Nobody signed up yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      {activity.requiresConsent && <TableHead>Permission</TableHead>}
                      {activity.tracksAttendance && <TableHead>Came</TableHead>}
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">
                          {p.student?.user?.firstName} {p.student?.user?.lastName}
                          <div className="font-mono text-xs text-muted">
                            {p.student.studentIdNumber}
                          </div>
                        </TableCell>
                        {activity.requiresConsent && (
                          <TableCell>
                            <Badge
                              variant={
                                p.consent === "GIVEN"
                                  ? "success"
                                  : p.consent === "REFUSED"
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {p.consent === "GIVEN"
                                ? "Agreed"
                                : p.consent === "REFUSED"
                                  ? "Refused"
                                  : "Waiting"}
                            </Badge>
                          </TableCell>
                        )}
                        {activity.tracksAttendance && (
                          <TableCell>
                            <input
                              type="checkbox"
                              aria-label={`${p.student?.user?.firstName} came`}
                              checked={p.attended === true}
                              onChange={(e) =>
                                attendance.mutate({
                                  activityId: id,
                                  records: [
                                    {
                                      studentId: p.student.id,
                                      attended: e.target.checked,
                                    },
                                  ],
                                })
                              }
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove ${p.student?.user?.firstName}`}
                            onClick={() =>
                              removeOne.mutate({
                                activityId: id,
                                studentId: p.student.id,
                              })
                            }
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {!activity.isCancelled && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
              <p className="text-sm font-medium">Call it off</p>
              <p className="mt-0.5 text-xs text-muted">
                Nothing is deleted. Families who already answered will see the
                reason.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Input
                  id="a-cancel-reason"
                  label="Reason"
                  className="sm:w-80"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. The bus is not available"
                />
                <Button
                  variant="danger"
                  disabled={!reason.trim()}
                  isLoading={cancel.isPending}
                  onClick={() =>
                    cancel.mutate(
                      { id, reason: reason.trim() },
                      { onSuccess: () => setReason("") },
                    )
                  }
                >
                  <Ban className="mr-2 h-4 w-4" /> Call it off
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
