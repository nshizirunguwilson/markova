"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useUsers } from "@/hooks/use-users";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useClinicSummary,
  useClinicVisits,
  useCreateVisit,
  useDischarge,
  useEmergencyCard,
  useGiveMedicine,
  useMarkParentNotified,
  useSaveHealthRecord,
  useUpdateVisit,
  type ClinicOutcome,
  type ClinicSeverity,
  type ClinicVisit,
} from "@/hooks/use-clinic";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Pill,
  Plus,
  Stethoscope,
} from "lucide-react";

const OUTCOMES: Record<ClinicOutcome, string> = {
  RETURNED_TO_CLASS: "Back to class",
  RESTING_IN_SICK_BAY: "Resting in the sick bay",
  REFERRED_OUT: "Referred out",
  SENT_HOME: "Collected by a parent",
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
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nameOf(v: ClinicVisit): string {
  return `${v.student.user.firstName} ${v.student.user.lastName}`;
}

/**
 * The sick bay.
 *
 * Ordered the way a nurse's day runs: who is lying in there right now at the
 * top, then the book. The counts above it exist for one question a head
 * teacher cannot answer today, which is whether the same children keep coming
 * back.
 */
export default function HealthPage() {
  const [tab, setTab] = useState<"sick-bay" | "book">("sick-bay");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [cardFor, setCardFor] = useState<string | null>(null);

  const { data: summary } = useClinicSummary(30);
  const { data, isLoading } = useClinicVisits(
    tab === "sick-bay"
      ? { inSickBay: "true", limit: 50 }
      : { severity: severity || undefined, page, limit: 20 },
  );

  useEffect(() => {
    setPage(1);
  }, [severity, tab]);

  const visits: ClinicVisit[] = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 };

  return (
    <div>
      <PageHeader
        title="Health"
        description="The sick bay, the doses given, and every student's emergency card"
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="mr-2 h-4 w-4" /> New visit
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<BedDouble className="h-5 w-5" />}
          label="In the sick bay now"
          value={summary?.inSickBay ?? 0}
        />
        <Stat
          icon={<Stethoscope className="h-5 w-5" />}
          label="Visits, last 30 days"
          value={summary?.visits ?? 0}
        />
        <Stat
          icon={<Pill className="h-5 w-5" />}
          label="Doses given"
          value={summary?.dosesGiven ?? 0}
        />
        <Stat
          icon={<Activity className="h-5 w-5" />}
          label="Sent to a health centre"
          value={summary?.referred ?? 0}
        />
      </div>

      {(summary?.repeatVisitors?.length ?? 0) > 0 && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <CardTitle>Keeps coming back</CardTitle>
              <p className="mt-0.5 text-sm text-muted">
                Three visits or more in a month is a pattern, not bad luck.
                Somebody should ask why.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {summary.repeatVisitors.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setCardFor(s.id)}
                    className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:bg-accent-light"
                  >
                    {s.user.firstName} {s.user.lastName}
                    <span className="ml-2 text-muted">{s.visits} visits</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card padding="sm" className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={tab === "sick-bay" ? "primary" : "outline"}
              onClick={() => setTab("sick-bay")}
            >
              In the sick bay
            </Button>
            <Button
              size="sm"
              variant={tab === "book" ? "primary" : "outline"}
              onClick={() => setTab("book")}
            >
              The clinic book
            </Button>
          </div>

          {tab === "book" && (
            <select
              className="rounded-lg border border-input px-3 py-2 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              aria-label="Any severity"
            >
              <option value="">Any severity</option>
              {Object.entries(SEVERITIES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <PageSpinner />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>What was wrong</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Family told</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted">
                    <HeartPulse className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {tab === "sick-bay"
                      ? "Nobody is in the sick bay."
                      : "Nothing in the book yet."}
                  </TableCell>
                </TableRow>
              ) : (
                visits.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => setCardFor(v.student.id)}
                        className="text-left hover:underline"
                      >
                        {nameOf(v)}
                      </button>
                      <div className="font-mono text-xs text-muted">
                        {v.student.studentIdNumber}
                      </div>
                      {v.student.allergies && (
                        <Badge variant="danger" className="mt-1">
                          Allergy: {v.student.allergies}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {v.complaint}
                      <div className="mt-1">
                        <Badge variant={SEVERITY_STYLE[v.severity]}>
                          {SEVERITIES[v.severity]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted">
                      {when(v.visitedAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {OUTCOMES[v.outcome]}
                      {v.referredTo && (
                        <div className="text-xs text-muted">{v.referredTo}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.parentNotifiedAt ? (
                        <Badge variant="success">Told</Badge>
                      ) : (
                        <Badge variant="warning">Not yet</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenId(v.id)}
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

        {!isLoading && tab === "book" && meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {(meta.page - 1) * meta.limit + 1}–
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

      <NewVisitModal isOpen={showNew} onClose={() => setShowNew(false)} />
      <VisitDetail
        visit={visits.find((v) => v.id === openId) ?? null}
        onClose={() => setOpenId(null)}
      />
      <EmergencyCardModal
        studentId={cardFor}
        onClose={() => setCardFor(null)}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-accent-light p-2 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  );
}

/** Finding the student, by name or by number, without leaving the page. */
function StudentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string, label: string) => void;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const { data } = useUsers({
    role: "STUDENT",
    search: debounced || undefined,
    limit: 10,
  });

  const students = useMemo(
    () => (data?.data ?? []).filter((u: any) => u.student?.id),
    [data],
  );

  return (
    <div>
      <Input
        id="h-student"
        label="Student"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Type a name or a student number"
      />
      {search && !value && (
        <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-border">
          {students.length === 0 ? (
            <p className="p-3 text-sm text-muted">Nobody by that name.</p>
          ) : (
            students.map((u: any) => (
              <button
                key={u.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-light"
                onClick={() => {
                  const label = `${u.firstName} ${u.lastName}`;
                  onChange(u.student.id, label);
                  setSearch(label);
                }}
              >
                {u.firstName} {u.lastName}
                <span className="ml-2 font-mono text-xs text-muted">
                  {u.student.studentIdNumber}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NewVisitModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const create = useCreateVisit();
  const [studentId, setStudentId] = useState("");
  const [form, setForm] = useState({
    complaint: "",
    findings: "",
    treatment: "",
    severity: "MINOR" as ClinicSeverity,
    outcome: "RETURNED_TO_CLASS" as ClinicOutcome,
    temperature: "",
    referredTo: "",
  });

  useEffect(() => {
    if (isOpen) {
      setStudentId("");
      setForm({
        complaint: "",
        findings: "",
        treatment: "",
        severity: "MINOR",
        outcome: "RETURNED_TO_CLASS",
        temperature: "",
        referredTo: "",
      });
    }
  }, [isOpen]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const referring = form.outcome === "REFERRED_OUT";
  const ready =
    !!studentId && !!form.complaint.trim() && (!referring || !!form.referredTo.trim());

  const submit = async () => {
    if (!ready) return;
    await create
      .mutateAsync({
        studentId,
        complaint: form.complaint.trim(),
        findings: form.findings || undefined,
        treatment: form.treatment || undefined,
        severity: form.severity,
        outcome: form.outcome,
        temperature: form.temperature ? Number(form.temperature) : undefined,
        referredTo: referring ? form.referredTo.trim() : undefined,
      })
      .then(onClose)
      .catch(() => null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New visit" size="lg">
      <div className="space-y-4">
        <StudentPicker value={studentId} onChange={(id) => setStudentId(id)} />

        <Input
          id="h-complaint"
          label="What the student says is wrong"
          value={form.complaint}
          onChange={(e) => set("complaint", e.target.value)}
          placeholder="e.g. Headache since morning assembly"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="h-findings"
            label="What you found"
            value={form.findings}
            onChange={(e) => set("findings", e.target.value)}
          />
          <Input
            id="h-treatment"
            label="What you did"
            value={form.treatment}
            onChange={(e) => set("treatment", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            id="h-temp"
            label="Temperature (°C)"
            type="number"
            step="0.1"
            min="25"
            max="45"
            value={form.temperature}
            onChange={(e) => set("temperature", e.target.value)}
          />
          <div>
            <label htmlFor="h-severity" className="mb-1 block text-sm font-medium">
              How bad
            </label>
            <select
              id="h-severity"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={form.severity}
              onChange={(e) => set("severity", e.target.value as ClinicSeverity)}
              aria-label="How bad"
            >
              {Object.entries(SEVERITIES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="h-outcome" className="mb-1 block text-sm font-medium">
              What happened next
            </label>
            <select
              id="h-outcome"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={form.outcome}
              onChange={(e) => set("outcome", e.target.value as ClinicOutcome)}
              aria-label="What happened next"
            >
              {Object.entries(OUTCOMES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {referring && (
          <Input
            id="h-referred"
            label="Sent where"
            value={form.referredTo}
            onChange={(e) => set("referredTo", e.target.value)}
            placeholder="e.g. Kacyiru Health Centre"
          />
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready} isLoading={create.isPending}>
            Record the visit
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * One visit: what happened, what was given, and the two things that close it
 * out. Discharging and telling the family sit together because on a bad day
 * they are the two things left undone.
 */
function VisitDetail({
  visit,
  onClose,
}: {
  visit: ClinicVisit | null;
  onClose: () => void;
}) {
  const discharge = useDischarge();
  const notify = useMarkParentNotified();
  const give = useGiveMedicine();
  const update = useUpdateVisit();

  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [findings, setFindings] = useState("");

  useEffect(() => {
    setMedicine("");
    setDose("");
    setFindings(visit?.findings ?? "");
  }, [visit?.id, visit?.findings]);

  if (!visit) return null;

  return (
    <Modal isOpen={!!visit} onClose={onClose} title={nameOf(visit)} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge variant={SEVERITY_STYLE[visit.severity]}>
            {SEVERITIES[visit.severity]}
          </Badge>
          <span>{when(visit.visitedAt)}</span>
          <span>
            · seen by {visit.seenBy.firstName} {visit.seenBy.lastName}
          </span>
        </div>

        <div className="rounded-lg border border-border p-3 text-sm">
          <p>
            <span className="text-muted">Said: </span>
            {visit.complaint}
          </p>
          {visit.treatment && (
            <p className="mt-1">
              <span className="text-muted">Given: </span>
              {visit.treatment}
            </p>
          )}
          {visit.temperature !== null && (
            <p className="mt-1">
              <span className="text-muted">Temperature: </span>
              {visit.temperature}°C
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Input
            id="h-edit-findings"
            label="What you found"
            className="sm:w-96"
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
          />
          <Button
            variant="outline"
            isLoading={update.isPending}
            onClick={() => update.mutate({ id: visit.id, findings })}
          >
            Save
          </Button>
        </div>

        <div className="rounded-lg border border-border p-3">
          <CardTitle>Doses given</CardTitle>
          {(visit.medications?.length ?? 0) === 0 ? (
            <p className="mt-1 text-sm text-muted">Nothing given yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {visit.medications!.map((m) => (
                <li key={m.id}>
                  {m.medicine} · {m.dose}
                  <span className="ml-2 text-muted">{when(m.givenAt)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Input
              id="h-medicine"
              label="Medicine"
              className="sm:w-56"
              value={medicine}
              onChange={(e) => setMedicine(e.target.value)}
              placeholder="e.g. Paracetamol"
            />
            <Input
              id="h-dose"
              label="Dose"
              className="sm:w-36"
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="e.g. 500mg"
            />
            <Button
              disabled={!medicine.trim() || !dose.trim()}
              isLoading={give.isPending}
              onClick={() =>
                give.mutate(
                  {
                    studentId: visit.student.id,
                    visitId: visit.id,
                    medicine: medicine.trim(),
                    dose: dose.trim(),
                  },
                  {
                    onSuccess: () => {
                      setMedicine("");
                      setDose("");
                    },
                  },
                )
              }
            >
              <Pill className="mr-2 h-4 w-4" /> Record the dose
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            The system refuses the same medicine twice within four hours, and
            says how long ago the last one was.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {!visit.parentNotifiedAt && (
            <Button variant="outline" onClick={() => notify.mutate(visit.id)}>
              The family has been told
            </Button>
          )}
          {visit.outcome === "RESTING_IN_SICK_BAY" && !visit.dischargedAt && (
            <Button
              isLoading={discharge.isPending}
              onClick={() => discharge.mutate(visit.id)}
            >
              Send back to class
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * The one page somebody needs at three in the morning.
 *
 * Allergies and blood type come first, before anything administrative, and the
 * emergency contact is a phone number big enough to read off a screen in a
 * corridor.
 */
function EmergencyCardModal({
  studentId,
  onClose,
}: {
  studentId: string | null;
  onClose: () => void;
}) {
  const { data } = useEmergencyCard(studentId ?? undefined);
  const save = useSaveHealthRecord();
  const [form, setForm] = useState<Record<string, string>>({});

  const record = data?.student?.healthRecord;

  useEffect(() => {
    setForm({
      chronicConditions: record?.chronicConditions ?? "",
      regularMedication: record?.regularMedication ?? "",
      allergyNotes: record?.allergyNotes ?? "",
      emergencyPlan: record?.emergencyPlan ?? "",
      emergencyContactName: record?.emergencyContactName ?? "",
      emergencyContactPhone: record?.emergencyContactPhone ?? "",
      emergencyRelationship: record?.emergencyRelationship ?? "",
      insuranceProvider: record?.insuranceProvider ?? "",
      insuranceNumber: record?.insuranceNumber ?? "",
      preferredClinic: record?.preferredClinic ?? "",
    });
  }, [studentId, record]);

  if (!studentId) return null;

  const student = data?.student;
  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal isOpen={!!studentId} onClose={onClose} title="Emergency card" size="lg">
      {!student ? (
        <PageSpinner />
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold">
              {student.user.firstName} {student.user.lastName}
            </h3>
            <p className="font-mono text-sm text-muted">
              {student.studentIdNumber}
              {student.classSection && ` · ${student.classSection.classLevel?.name} ${student.classSection.name}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card padding="sm" className="border-danger/40 bg-danger/5">
              <p className="text-xs text-muted">Allergic to</p>
              <p className="mt-1 font-semibold">
                {student.allergies || form.allergyNotes || "Nothing on record"}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs text-muted">Blood type</p>
              <p className="mt-1 font-semibold">{student.bloodType || "Unknown"}</p>
            </Card>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted">Ring first</p>
            <p className="mt-1 text-lg font-semibold">
              {form.emergencyContactName ||
                (student.parentStudents?.[0]
                  ? `${student.parentStudents[0].parent.firstName} ${student.parentStudents[0].parent.lastName}`
                  : "Nobody on record")}
            </p>
            <p className="font-mono text-lg">
              {form.emergencyContactPhone ||
                student.parentStudents?.[0]?.parent?.phone ||
                "—"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="c-conditions"
              label="Long-term conditions"
              value={form.chronicConditions ?? ""}
              onChange={(e) => set("chronicConditions", e.target.value)}
              placeholder="e.g. Asthma"
            />
            <Input
              id="c-medication"
              label="Medication taken regularly"
              value={form.regularMedication ?? ""}
              onChange={(e) => set("regularMedication", e.target.value)}
            />
            <Input
              id="c-allergies"
              label="Allergy notes"
              value={form.allergyNotes ?? ""}
              onChange={(e) => set("allergyNotes", e.target.value)}
            />
            <Input
              id="c-plan"
              label="What to do in an emergency"
              value={form.emergencyPlan ?? ""}
              onChange={(e) => set("emergencyPlan", e.target.value)}
              placeholder="e.g. Blue inhaler is in her locker"
            />
            <Input
              id="c-contact"
              label="Who to ring"
              value={form.emergencyContactName ?? ""}
              onChange={(e) => set("emergencyContactName", e.target.value)}
            />
            <Input
              id="c-phone"
              label="Their phone"
              value={form.emergencyContactPhone ?? ""}
              onChange={(e) => set("emergencyContactPhone", e.target.value)}
              placeholder="+250…"
            />
            <Input
              id="c-relationship"
              label="Relationship"
              value={form.emergencyRelationship ?? ""}
              onChange={(e) => set("emergencyRelationship", e.target.value)}
              placeholder="e.g. Aunt"
            />
            <Input
              id="c-clinic"
              label="Health centre we use"
              value={form.preferredClinic ?? ""}
              onChange={(e) => set("preferredClinic", e.target.value)}
            />
            <Input
              id="c-insurer"
              label="Insurance"
              value={form.insuranceProvider ?? ""}
              onChange={(e) => set("insuranceProvider", e.target.value)}
              placeholder="e.g. Mutuelle de Sante"
            />
            <Input
              id="c-insurance-no"
              label="Insurance number"
              value={form.insuranceNumber ?? ""}
              onChange={(e) => set("insuranceNumber", e.target.value)}
            />
          </div>

          {(data?.recentVisits?.length ?? 0) > 0 && (
            <div>
              <CardTitle>Recent visits</CardTitle>
              <ul className="mt-2 space-y-1 text-sm">
                {data.recentVisits.map((v: any) => (
                  <li key={v.id}>
                    <span className="text-muted">{when(v.visitedAt)}</span> ·{" "}
                    {v.complaint}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              isLoading={save.isPending}
              onClick={() => save.mutate({ studentId, ...form })}
            >
              Save the card
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
