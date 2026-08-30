"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardTitle,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  PageSpinner,
} from "@/components/ui";
import {
  useAcademicYears,
  useClassLevels,
  useSections,
  useSchoolConfig,
  usePromotionPreview,
  useCommitPromotion,
} from "@/hooks/use-academic";
import {
  ArrowUpCircle,
  CheckCircle2,
  XCircle,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { sectionLabel } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

type Decision = "PROMOTE" | "RETAIN";

export default function AdminPromotionPage() {
  const { data: years } = useAcademicYears();
  const { data: levels } = useClassLevels();
  const { data: config } = useSchoolConfig();
  const preview = usePromotionPreview();
  const commit = useCommitPromotion();

  const [academicYearId, setAcademicYearId] = useState("");
  const [fromLevelId, setFromLevelId] = useState("");
  const [toLevelChoice, setToLevelId] = useState("");
  const [fromSectionId, setFromSectionId] = useState("");
  const [toSectionId, setToSectionId] = useState("");
  const [passThreshold, setPassThreshold] = useState("");
  const [disciplineThreshold, setDisciplineThreshold] = useState("");

  const [students, setStudents] = useState<any[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [committed, setCommitted] = useState<any | null>(null);

  const { data: fromSections } = useSections(fromLevelId || undefined);

  const defaultThreshold = config?.map?.passThreshold;

  /**
   * The school's six levels in order: Senior 1-3 (O-Level) then Level 3-5
   * (TVET / A-Level), which is ClassLevel.order 1..6. A promotion only ever
   * moves a student up that ladder, so the destination list is every level
   * above the source - "Senior 2 → Senior 1" used to be one click away.
   */
  const ladder = useMemo(
    () =>
      [...(levels || [])].sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
      ),
    [levels],
  );
  const fromLevel = ladder.find((l: any) => l.id === fromLevelId);
  const promotableLevels = fromLevel
    ? ladder.filter((l: any) => (l.order ?? 0) > (fromLevel.order ?? 0))
    : ladder;
  const nextLevel = promotableLevels[0];
  const isFinalLevel = !!fromLevel && promotableLevels.length === 0;

  /**
   * The destination, derived during render rather than synced in an effect
   * (the same shape the marks page uses): the admin's explicit choice wins,
   * otherwise the next level up - which is the answer nine times in ten.
   * They can still pick a further one, Senior 3 to Level 4 say.
   */
  const toLevelId = toLevelChoice || nextLevel?.id || "";
  const { data: toSections } = useSections(toLevelId || undefined);

  const handleLoad = () => {
    if (!fromSectionId || !academicYearId) return;
    setCommitted(null);
    preview.mutate(
      {
        fromClassSectionId: fromSectionId,
        academicYearId,
        ...(passThreshold ? { passThreshold: Number(passThreshold) } : {}),
        ...(disciplineThreshold
          ? { disciplineThreshold: Number(disciplineThreshold) }
          : {}),
      },
      {
        onSuccess: (data) => {
          // Read defensively. This runs inside onSuccess, so a response
          // without the list would throw here and turn a preview that the
          // server answered perfectly well into a page that died.
          const rows = Array.isArray(data?.students) ? data.students : [];
          setStudents(rows);
          const init: Record<string, Decision> = {};
          for (const s of rows) init[s.studentId] = s.recommendation;
          setDecisions(init);
        },
      }
    );
  };

  // Changing the source level can leave a destination behind that is now at or
  // below it. Clearing the choice hands the field back to the derived default,
  // which is always a level above the new source.
  const handleFromLevelChange = (id: string) => {
    setFromLevelId(id);
    setFromSectionId("");
    const from = ladder.find((l: any) => l.id === id);
    const to = ladder.find((l: any) => l.id === toLevelChoice);
    if (!from || !to || (to.order ?? 0) <= (from.order ?? 0)) {
      setToLevelId("");
      setToSectionId("");
    }
  };

  const setDecision = (studentId: string, d: Decision) =>
    setDecisions((prev) => ({ ...prev, [studentId]: d }));

  const tally = useMemo(() => {
    let promote = 0;
    let retain = 0;
    let overrides = 0;
    for (const s of students || []) {
      const d = decisions[s.studentId];
      if (d === "PROMOTE") promote++;
      else retain++;
      if (d && d !== s.recommendation) overrides++;
    }
    return { promote, retain, overrides };
  }, [students, decisions]);

  const handleCommit = () => {
    if (!students || !toSectionId) {
      toast.error("Select the destination class first");
      return;
    }
    commit.mutate(
      {
        academicYearId,
        toClassSectionId: toSectionId,
        decisions: students.map((s) => ({
          studentId: s.studentId,
          decision: decisions[s.studentId] || s.recommendation,
        })),
      },
      {
        onSuccess: (data) => {
          setCommitted(data);
          setStudents(null);
          toast.success(
            `${data.promoted} promoted, ${data.retained} retained`
          );
        },
      }
    );
  };

  const handleReset = () => {
    setStudents(null);
    setDecisions({});
    setCommitted(null);
  };

  return (
    <div>
      <div className="mb-6">
        <PageHeader
          title="Student Promotion"
          description={<>Review each student&apos;s results and discipline, then promote or retain
          them - the system recommends, you decide.</>}
        />
      </div>

      {/* Settings */}
      <Card className="mb-6">
        <CardTitle>Deliberation setup</CardTitle>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="f-academic-year" className="mb-1 block text-sm font-medium">Academic Year</label>
            <select id="f-academic-year"
              className="w-full max-w-md rounded-lg border border-input px-3 py-2 text-sm"
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
             aria-label="Academic Year">
              <option value="">Select academic year</option>
              {years?.map((y: any) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.isCurrent ? "(Current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                From Class
              </h3>
              <div className="space-y-3">
                <select
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm"
                  value={fromLevelId}
                  onChange={(e) => handleFromLevelChange(e.target.value)}
                 aria-label="Select level">
                  <option value="">Select level</option>
                  {ladder.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <select
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm"
                  value={fromSectionId}
                  onChange={(e) => setFromSectionId(e.target.value)}
                  disabled={!fromLevelId}
                 aria-label="Select section">
                  <option value="">Select section</option>
                  {fromSections?.map((s: any) => (
                    <option key={s.id} value={s.id}>{sectionLabel(s)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Promote To
              </h3>
              <div className="space-y-3">
                <select
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
                  value={toLevelId}
                  disabled={isFinalLevel}
                  onChange={(e) => { setToLevelId(e.target.value); setToSectionId(""); }}
                 aria-label="Select level">
                  <option value="">
                    {isFinalLevel ? "No level above this one" : "Select level"}
                  </option>
                  {promotableLevels.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {nextLevel && l.id === nextLevel.id ? " - next level" : ""}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm"
                  value={toSectionId}
                  onChange={(e) => setToSectionId(e.target.value)}
                  disabled={!toLevelId}
                 aria-label="Select section">
                  <option value="">Select section</option>
                  {toSections?.map((s: any) => (
                    <option key={s.id} value={s.id}>{sectionLabel(s)}</option>
                  ))}
                </select>
                {isFinalLevel ? (
                  <p className="text-xs text-warning">
                    {fromLevel?.name} is the last level in the school. These
                    students complete their studies rather than move up - mark
                    the ones who did not finish as Retain.
                  </p>
                ) : fromLevel ? (
                  <p className="text-xs text-muted">
                    {fromLevel.name} → {nextLevel?.name}. Only levels above{" "}
                    {fromLevel.name} can be chosen; keeping a student where they
                    are is a Retain, not a promotion.
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    Pick the class they are coming from first.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:max-w-md">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Pass mark (%)
                {defaultThreshold && (
                  <span className="ml-1 text-xs font-normal text-muted">
                    default {defaultThreshold}
                  </span>
                )}
              </label>
              <input
                type="number" min="0" max="100"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm"
                placeholder={defaultThreshold ? `${defaultThreshold}` : "50"}
                value={passThreshold}
                onChange={(e) => setPassThreshold(e.target.value)}
               aria-label="Pass mark (%) {defaultThreshold && ( default )}"/>
            </div>
            <div>
              <label htmlFor="f-min-discipline-points" className="mb-1 block text-sm font-medium">
                Min discipline points
              </label>
              <input id="f-min-discipline-points"
                type="number" min="0" max="100"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm"
                placeholder="50"
                value={disciplineThreshold}
                onChange={(e) => setDisciplineThreshold(e.target.value)}
               aria-label="Min discipline points"/>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={handleLoad}
              isLoading={preview.isPending}
              disabled={!fromSectionId || !academicYearId}
            >
              <ListChecks className="mr-2 h-4 w-4" />
              Load students for deliberation
            </Button>
            {(students || committed) && (
              <Button variant="outline" onClick={handleReset}>Reset</Button>
            )}
          </div>
        </div>
      </Card>

      {preview.isPending && <PageSpinner />}

      {/* Deliberation table */}
      {students && (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Deliberation ({students.length} students)</CardTitle>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-success font-medium">Promote: {tally.promote}</span>
              <span className="text-danger font-medium">Retain: {tally.retain}</span>
              {tally.overrides > 0 && (
                <span className="flex items-center gap-1 text-warning">
                  <AlertTriangle className="h-4 w-4" /> {tally.overrides} override(s)
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Average</TableHead>
                  <TableHead>Discipline</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => {
                  const d = decisions[s.studentId] || s.recommendation;
                  const isOverride = d !== s.recommendation;
                  return (
                    <TableRow key={s.studentId}>
                      <TableCell>
                        <div className="font-medium">{s.name}</div>
                        <div className="font-mono text-xs text-muted">{s.studentIdNumber}</div>
                      </TableCell>
                      <TableCell>
                        <span className={s.average >= (Number(passThreshold) || defaultThreshold || 50) ? "text-success" : "text-danger"}>
                          {s.average}%
                        </span>
                      </TableCell>
                      <TableCell>{s.disciplinePoints}</TableCell>
                      <TableCell>
                        <Badge variant={s.recommendation === "PROMOTE" ? "success" : "danger"}>
                          {s.recommendation === "PROMOTE" ? "Promote" : "Retain"}
                        </Badge>
                        <div className="mt-0.5 text-xs text-muted max-w-[220px]">{s.reason}</div>
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex overflow-hidden rounded-lg border border-border">
                          <button
                            onClick={() => setDecision(s.studentId, "PROMOTE")}
                            className={`px-3 py-1 text-xs font-medium ${d === "PROMOTE" ? "bg-success text-on-success" : "bg-surface text-muted hover:bg-muted/10"}`}
                          >
                            Promote
                          </button>
                          <button
                            onClick={() => setDecision(s.studentId, "RETAIN")}
                            className={`px-3 py-1 text-xs font-medium ${d === "RETAIN" ? "bg-danger text-on-danger" : "bg-surface text-muted hover:bg-muted/10"}`}
                          >
                            Retain
                          </button>
                        </div>
                        {isOverride && (
                          <span className="ml-2 text-xs text-warning">overridden</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button
              onClick={handleCommit}
              isLoading={commit.isPending}
              disabled={!toSectionId}
            >
              <ArrowUpCircle className="mr-2 h-4 w-4" />
              Commit decisions
            </Button>
            {!toSectionId && (
              <span className="text-xs text-warning">Select a destination class above to commit.</span>
            )}
          </div>
        </Card>
      )}

      {/* Result */}
      {committed && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card padding="sm">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{committed.total}</p>
              <p className="text-sm text-muted">Total deliberated</p>
            </div>
          </Card>
          <Card padding="sm">
            <div className="text-center">
              <p className="flex items-center justify-center gap-1 text-2xl font-bold text-success">
                <CheckCircle2 className="h-5 w-5" /> {committed.promoted}
              </p>
              <p className="text-sm text-muted">Promoted</p>
            </div>
          </Card>
          <Card padding="sm">
            <div className="text-center">
              <p className="flex items-center justify-center gap-1 text-2xl font-bold text-danger">
                <XCircle className="h-5 w-5" /> {committed.retained}
              </p>
              <p className="text-sm text-muted">Retained</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
