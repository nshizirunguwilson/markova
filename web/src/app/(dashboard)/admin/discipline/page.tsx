"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Button,
  Badge,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
  Input,
} from "@/components/ui";
import {
  useIncidents,
  useCreateIncident,
  useDeleteIncident,
  usePendingAppeals,
  useReviewAppeal,
  useDisciplineDashboard,
  useMerits,
  useAwardMerit,
  useWatchList,
  useMeritSummary,
  type MeritCategory,
} from "@/hooks/use-discipline";
import { useTerms, useAcademicYears } from "@/hooks/use-academic";
import { StudentPicker } from "@/components/student-picker";
import {
  AlertTriangle,
  Award,
  Eye,
  Plus,
  Trash2,
  Shield,
  Gavel,
} from "lucide-react";
import { toLocalDateString, classDisplayName } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  VERBAL_WARNING: "Verbal Warning",
  WRITTEN_WARNING: "Written Warning",
  DETENTION: "Detention",
  SUSPENSION: "Suspension",
  EXPULSION: "Expulsion",
};

/**
 * What a merit can be given for.
 *
 * Named for the things a Rwandan secondary school already praises at assembly,
 * so staff recognise the list rather than translating into it.
 */
const MERIT_LABELS: Record<MeritCategory, string> = {
  ACADEMIC_EFFORT: "Real effort in class",
  HELPING_OTHERS: "Helping others",
  LEADERSHIP: "Leadership",
  SPORT: "Sport",
  ARTS: "Arts",
  SERVICE: "Service to the school",
  HONESTY: "Honesty",
  IMPROVEMENT: "Turning it around",
};

export default function AdminDisciplinePage() {
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const currentTerm = terms?.find((t: any) => t.isCurrent);

  const [tab, setTab] = useState<
    "incidents" | "merits" | "watch" | "appeals" | "dashboard"
  >("incidents");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMeritModal, setShowMeritModal] = useState(false);

  const { data: incidents, isLoading } = useIncidents(currentTerm ? { termId: currentTerm.id } : undefined);
  const { data: appeals } = usePendingAppeals();
  const { data: dashboard } = useDisciplineDashboard(currentTerm?.id);
  const createIncident = useCreateIncident();
  const deleteIncident = useDeleteIncident();
  const reviewAppeal = useReviewAppeal();
  const { data: merits } = useMerits(
    currentTerm ? { termId: currentTerm.id } : undefined,
  );
  const { data: watch } = useWatchList(30);
  const { data: meritSummary } = useMeritSummary(currentTerm?.id);
  const awardMerit = useAwardMerit();

  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");

  const [form, setForm] = useState({
    studentId: "",
    date: toLocalDateString(new Date()),
    time: "",
    location: "",
    description: "",
    pointsDeducted: 5,
    actionTaken: "VERBAL_WARNING",
  });

  const [meritForm, setMeritForm] = useState({
    studentId: "",
    category: "HELPING_OTHERS" as MeritCategory,
    description: "",
    points: 5,
    date: toLocalDateString(new Date()),
  });

  const handleAwardMerit = () => {
    if (!currentTerm) return;
    awardMerit.mutate(
      { ...meritForm, termId: currentTerm.id },
      {
        onSuccess: () => {
          setShowMeritModal(false);
          setMeritForm({ ...meritForm, description: "", studentId: "" });
        },
      },
    );
  };

  const handleCreate = () => {
    if (!currentTerm) return;
    createIncident.mutate(
      { ...form, termId: currentTerm.id },
      { onSuccess: () => { setShowAddModal(false); setForm({ ...form, description: "", studentId: "" }); } }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Discipline</h1>
          <p className="text-sm text-muted">Manage incidents and appeals</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowMeritModal(true)}>
            <Award className="mr-1 h-4 w-4" /> Recognise a student
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-1 h-4 w-4" /> Record Incident
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {[
          { key: "incidents", label: "Incidents", icon: AlertTriangle },
          { key: "merits", label: "Merits", icon: Award },
          {
            key: "watch",
            label: "Watch list",
            icon: Eye,
            count: watch?.students?.length,
          },
          { key: "appeals", label: "Appeals", icon: Gavel, count: appeals?.length },
          { key: "dashboard", label: "Dashboard", icon: Shield },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
            {t.count ? <Badge variant="danger" className="ml-1">{t.count}</Badge> : null}
          </button>
        ))}
      </div>

      {/* Incidents Tab */}
      {tab === "incidents" && (
        isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : incidents?.length > 0 ? (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((inc: any) => (
                  <TableRow key={inc.id}>
                    <TableCell className="text-sm">{new Date(inc.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">
                      {inc.student?.user?.firstName ?? "Unknown"} {inc.student?.user?.lastName ?? ""}
                    </TableCell>
                    <TableCell className="text-sm text-muted">
                      {classDisplayName(inc.student?.classSection)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{inc.description}</TableCell>
                    <TableCell><Badge variant="danger">-{inc.pointsDeducted}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={inc.actionTaken === "VERBAL_WARNING" ? "default" : "warning"}>
                        {ACTION_LABELS[inc.actionTaken] || inc.actionTaken}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inc.parentAcknowledged ? (
                        <Badge variant="success">Ack</Badge>
                      ) : (
                        <Badge>Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button aria-label="Delete" size="sm" variant="ghost" onClick={() => { setConfirmMessage("Are you sure you want to delete this incident?"); setConfirmAction(() => () => deleteIncident.mutate(inc.id)); }}>
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <Card><p className="text-center text-muted py-8">No incidents recorded this term.</p></Card>
        )
      )}

      {/* Merits Tab */}
      {tab === "merits" && (
        <>
          {meritSummary && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-xs text-muted">Recognised this term</p>
                <p className="text-2xl font-bold text-success">
                  {meritSummary.awarded}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Incidents this term</p>
                <p className="text-2xl font-bold text-danger">
                  {meritSummary.incidents}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Praise per incident</p>
                <p className="text-2xl font-bold text-foreground">
                  {meritSummary.ratio ?? "—"}
                </p>
                {/* Below 1 means the school writes down more of what goes
                    wrong than what goes right. Most schools never see this. */}
                {meritSummary.ratio !== null && meritSummary.ratio < 1 && (
                  <p className="mt-1 text-xs text-warning">
                    More gets written down against students than for them.
                  </p>
                )}
              </Card>
            </div>
          )}

          {meritSummary?.byCategory && (
            <Card>
              <CardTitle>What the school recognises</CardTitle>
              <div className="mt-3 space-y-2">
                {Object.entries(MERIT_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{label}</span>
                    <Badge
                      variant={
                        meritSummary.byCategory[key] === 0 ? "default" : "success"
                      }
                    >
                      {meritSummary.byCategory[key] ?? 0}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {merits?.data?.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>For what</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Given by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merits.data.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">
                        {new Date(m.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.student?.user?.firstName} {m.student?.user?.lastName}
                      </TableCell>
                      <TableCell className="text-sm text-muted">
                        {classDisplayName(m.student?.classSection)}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm">
                        {m.description}
                        <div className="mt-1">
                          <Badge variant="success">
                            {MERIT_LABELS[m.category as MeritCategory] ?? m.category}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="success">+{m.points}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted">
                        {m.awardedBy?.firstName} {m.awardedBy?.lastName}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card>
              <p className="py-8 text-center text-muted">
                Nothing has been recognised this term yet.
              </p>
            </Card>
          )}
        </>
      )}

      {/* Watch List Tab */}
      {tab === "watch" && (
        <>
          <Card>
            <CardTitle>Who to look at this week</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Not who has the fewest points, which is the same names all year.
              These are students picking up incidents right now, and whether
              anything at all has gone the other way.
            </p>
          </Card>

          {watch?.students?.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Incidents</TableHead>
                    <TableHead>Points lost</TableHead>
                    <TableHead>Recognised</TableHead>
                    <TableHead>Standing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watch.students.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.user.firstName} {s.user.lastName}
                        <div className="font-mono text-xs text-muted">
                          {s.studentIdNumber}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted">
                        {classDisplayName(s.classSection)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="danger">{s.incidents}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">-{s.pointsLost}</TableCell>
                      <TableCell>
                        {s.nothingPositive ? (
                          <Badge variant="warning">Nothing yet</Badge>
                        ) : (
                          <Badge variant="success">{s.merits}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.disciplinePoints}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card>
              <p className="py-8 text-center text-muted">
                Nobody needs a second look this month.
              </p>
            </Card>
          )}
        </>
      )}

      {/* Appeals Tab */}
      {tab === "appeals" && (
        appeals?.length > 0 ? (
          <div className="space-y-4">
            {appeals.map((a: any) => (
              <Card key={a.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {a.incident?.student?.user?.firstName ?? "Unknown"} {a.incident?.student?.user?.lastName ?? ""}
                      <span className="ml-2 text-xs text-muted">
                        {classDisplayName(a.incident?.student?.classSection)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted">Incident: {a.incident.description}</p>
                    <p className="mt-1 text-sm text-muted">Points: -{a.incident.pointsDeducted}</p>
                    <p className="mt-2 text-sm text-foreground">
                      <span className="font-medium">Appeal:</span> {a.statement}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      By {a.submittedBy?.firstName ?? "someone"} {a.submittedBy?.lastName ?? ""} on{" "}
                      {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => reviewAppeal.mutate({ id: a.id, status: "APPROVED" })}
                      isLoading={reviewAppeal.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => reviewAppeal.mutate({ id: a.id, status: "REJECTED" })}
                      isLoading={reviewAppeal.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card><p className="text-center text-muted py-8">No pending appeals.</p></Card>
        )
      )}

      {/* Dashboard Tab */}
      {tab === "dashboard" && dashboard && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <p className="text-xs text-muted">Total Incidents</p>
              <p className="text-2xl font-bold text-foreground">{dashboard.totalIncidents}</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Points Deducted</p>
              <p className="text-2xl font-bold text-danger">{dashboard.totalPointsDeducted}</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Pending Appeals</p>
              <p className="text-2xl font-bold text-warning">{dashboard.pendingAppeals}</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Actions</p>
              <p className="text-2xl font-bold text-foreground">
                {Object.keys(dashboard.byAction ?? {}).length} types
              </p>
            </Card>
          </div>

          {/* Action breakdown */}
          <Card>
            <CardTitle>Actions Breakdown</CardTitle>
            <div className="mt-4 space-y-2">
              {Object.entries(dashboard.byAction ?? {}).map(([action, count]) => (
                <div key={action} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{ACTION_LABELS[action] || action}</span>
                  <Badge>{String(count)}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Confirm Action Modal */}
      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title="Confirm Action">
        <p className="text-sm text-muted mb-4">{confirmMessage}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { confirmAction?.(); setConfirmAction(null); }}>Confirm</Button>
        </div>
      </Modal>

      {/* Add Incident Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Record Incident">
        <div className="space-y-4">
          <StudentPicker
            value={form.studentId}
            onChange={(studentId) => setForm({ ...form, studentId })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <Input
              label="Time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              placeholder="e.g. 10:30 AM"
            />
          </div>
          <Input
            label="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="e.g. Classroom 3B"
          />
          <div>
            <label htmlFor="f-description" className="mb-1 block text-sm font-medium text-foreground">Description</label>
            <textarea id="f-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Describe the incident..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Points to Deduct"
              type="number"
              value={String(form.pointsDeducted)}
              onChange={(e) => setForm({ ...form, pointsDeducted: Number(e.target.value) })}
            />
            <div>
              <label htmlFor="f-action-taken" className="mb-1 block text-sm font-medium text-foreground">Action Taken</label>
              <select id="f-action-taken"
                value={form.actionTaken}
                onChange={(e) => setForm({ ...form, actionTaken: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={createIncident.isPending}>Record</Button>
          </div>
        </div>
      </Modal>
      {/* Award Merit Modal */}
      <Modal
        isOpen={showMeritModal}
        onClose={() => setShowMeritModal(false)}
        title="Recognise a student"
      >
        <div className="space-y-4">
          <StudentPicker
            value={meritForm.studentId}
            onChange={(studentId) => setMeritForm({ ...meritForm, studentId })}
          />
          <div>
            <label
              htmlFor="m-category"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              What for
            </label>
            <select
              id="m-category"
              value={meritForm.category}
              onChange={(e) =>
                setMeritForm({
                  ...meritForm,
                  category: e.target.value as MeritCategory,
                })
              }
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {Object.entries(MERIT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="m-description"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              What they did
            </label>
            <textarea
              id="m-description"
              value={meritForm.description}
              onChange={(e) =>
                setMeritForm({ ...meritForm, description: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="e.g. Stayed behind to help clear the science lab"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Points"
              type="number"
              min="1"
              max="20"
              value={String(meritForm.points)}
              onChange={(e) =>
                setMeritForm({ ...meritForm, points: Number(e.target.value) })
              }
            />
            <Input
              label="Date"
              type="date"
              value={meritForm.date}
              onChange={(e) => setMeritForm({ ...meritForm, date: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted">
            Points restore a conduct score up to a clean sheet, never past it.
            The recognition stands on the record either way.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowMeritModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAwardMerit}
              disabled={!meritForm.studentId || !meritForm.description.trim()}
              isLoading={awardMerit.isPending}
            >
              Recognise
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
