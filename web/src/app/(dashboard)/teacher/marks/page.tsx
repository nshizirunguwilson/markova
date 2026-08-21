"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { classDisplayName } from "@/lib/utils";
import { Card, CardTitle, Button, Badge, Spinner } from "@/components/ui";
import {
  useAcademicYears,
  useTerms,
  useAssessmentTypes,
} from "@/hooks/use-academic";
import { useMarksCompletion, useBatchMarks } from "@/hooks/use-marks";
import { ClipboardList, Save, CheckCircle, AlertCircle, Wifi, WifiOff, Database } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { savePendingMarks, getPendingMarks, clearPendingMarks, getPendingCount } from "@/lib/offline-db";
import { PageHeader } from "@/components/layout/page-header";

interface Assignment {
  id: string;
  // Flat ids are always present on the API response; the nested `subject`
  // object only carries name/category (no id), so derive ids from these.
  subjectId: string;
  classSectionId: string;
  subject: { name: string };
  classSection: { name: string; classLevel: { name: string } };
}

interface ScoreEntry {
  studentId: string;
  name: string;
  studentIdNumber: string;
  score: string;
  dirty: boolean;
}

export default function TeacherMarksPage() {
  const { user } = useAuthStore();
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const { data: assessmentTypes } = useAssessmentTypes();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<string>("");
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [selectedAT, setSelectedAT] = useState<string>("");
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const batchMarks = useBatchMarks();
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Derive subject/class from selected assignment
  const assignment = assignments.find((a) => a.id === selectedAssignment);
  const subjectId = assignment?.subjectId;
  const classSectionId = assignment?.classSectionId;

  const { data: completion, isLoading: loadingCompletion } = useMarksCompletion(
    classSectionId,
    selectedTerm,
    subjectId,
    selectedAT
  );

  // Set defaults for term
  useEffect(() => {
    const current = terms?.find((t: any) => t.isCurrent);
    if (current) setSelectedTerm(current.id);
  }, [terms]);

  // Fetch teacher assignments
  useEffect(() => {
    if (!user?.id) return;
    api
      .get("/academic/assignments", { params: { teacherUserId: user.id } })
      .then((res) => setAssignments(res.data || []))
      .catch(() => {});
  }, [user?.id]);

  // Load students when all selectors are set
  useEffect(() => {
    if (!completion?.students) return;
    setScores(
      completion.students.map((s: any) => ({
        studentId: s.id,
        name: s.name,
        studentIdNumber: s.studentIdNumber,
        score: s.mark?.score?.toString() || "",
        dirty: false,
      }))
    );
  }, [completion]);

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Load pending count from IndexedDB on mount
  useEffect(() => {
    getPendingCount().then(setPendingCount).catch(() => {});
  }, []);

  // Sync IndexedDB queue when back online
  useEffect(() => {
    if (!isOnline || syncing) return;
    syncOfflineMarks();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncOfflineMarks = async () => {
    try {
      const pending = await getPendingMarks();
      if (pending.length === 0) return;

      setSyncing(true);
      toast.info(`Syncing ${pending.length} offline entries...`);

      let successCount = 0;
      for (const entry of pending) {
        const { id: _id, savedAt: _savedAt, ...payload } = entry;
        try {
          await api.post("/marks/batch", payload);
          successCount++;
        } catch {
          // Keep failed entries — they'll retry next time
        }
      }

      if (successCount === pending.length) {
        await clearPendingMarks();
        setPendingCount(0);
        toast.success(`All ${successCount} offline entries synced`);
      } else {
        toast.warning(`Synced ${successCount}/${pending.length} — retrying failed ones later`);
      }
    } catch {
      // IndexedDB access failed
    } finally {
      setSyncing(false);
    }
  };

  const handleScoreChange = useCallback(
    (index: number, value: string) => {
      setScores((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], score: value, dirty: true };
        return next;
      });

      // Auto-save after 3 seconds of inactivity
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        handleSave();
      }, 3000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subjectId, classSectionId, selectedTerm, selectedAT]
  );

  const handleSave = useCallback(() => {
    if (!subjectId || !classSectionId || !selectedTerm || !selectedAT) return;

    const dirtyScores = scores.filter((s) => s.dirty && s.score !== "");
    if (dirtyScores.length === 0) return;

    const payload = {
      subjectId,
      classSectionId,
      termId: selectedTerm,
      assessmentTypeId: selectedAT,
      marks: dirtyScores.map((s) => ({
        studentId: s.studentId,
        score: Number(s.score),
      })),
    };

    if (!isOnline) {
      savePendingMarks(payload)
        .then(() => getPendingCount())
        .then((count) => {
          setPendingCount(count);
          setScores((prev) => prev.map((s) => ({ ...s, dirty: false })));
          toast.info("Saved to device — will sync when connected");
        })
        .catch(() => toast.error("Failed to save offline"));
      return;
    }

    batchMarks.mutate(payload, {
      onSuccess: () => {
        setScores((prev) => prev.map((s) => ({ ...s, dirty: false })));
      },
    });
  }, [scores, subjectId, classSectionId, selectedTerm, selectedAT, isOnline, batchMarks]);

  const dirtyCount = scores.filter((s) => s.dirty).length;
  const gradedCount = scores.filter((s) => s.score !== "").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Marks Entry"
        description="Enter and manage student marks"
        actions={
          <>
            <div className="flex flex-wrap items-center gap-2">
          {isOnline ? (
            <Badge variant="success"><Wifi className="mr-1 h-3 w-3" /> Online</Badge>
          ) : (
            <Badge variant="danger"><WifiOff className="mr-1 h-3 w-3" /> Offline</Badge>
          )}
          {pendingCount > 0 && (
            <Badge variant="warning">
              <Database className="mr-1 h-3 w-3" /> {pendingCount} pending sync
            </Badge>
          )}
          {syncing && <Spinner className="h-4 w-4" />}
        </div>
          </>
        }
      />

      {/* Selectors */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Class & Subject</label>
            <select
              value={selectedAssignment}
              onChange={(e) => setSelectedAssignment(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Class & Subject">
              <option value="">Select assignment...</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {classDisplayName(a.classSection)} — {a.subject.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Term">
              <option value="">Select term...</option>
              {terms?.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.isCurrent ? "(Current)" : ""} {t.isClosed ? "🔒" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Assessment Type</label>
            <select
              value={selectedAT}
              onChange={(e) => setSelectedAT(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Assessment Type">
              <option value="">Select type...</option>
              {assessmentTypes?.map((at: any) => (
                <option key={at.id} value={at.id}>{at.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Progress Bar */}
      {completion && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-foreground">
              Progress: {gradedCount}/{completion.total} students graded
            </p>
            <span className="text-sm text-muted">{completion.percentage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/20">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((gradedCount / Math.max(completion.total, 1)) * 100)}%` }}
            />
          </div>
        </Card>
      )}

      {/* Marks Entry Table */}
      {loadingCompletion && selectedAssignment && selectedTerm && selectedAT ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : scores.length > 0 ? (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>
              <ClipboardList className="mr-2 inline h-5 w-5" />
              Enter Marks
            </CardTitle>
            <Button
              onClick={handleSave}
              isLoading={batchMarks.isPending}
              disabled={dirtyCount === 0}
            >
              <Save className="mr-1 h-4 w-4" />
              Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm text-muted">
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Student ID</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4 w-32">Score</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((entry, i) => (
                  <tr key={entry.studentId} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-sm text-muted">{i + 1}</td>
                    <td className="py-2 pr-4 text-sm font-mono">{entry.studentIdNumber}</td>
                    <td className="py-2 pr-4 text-sm font-medium">{entry.name}</td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={entry.score}
                        onChange={(e) => handleScoreChange(i, e.target.value)}
                        placeholder="—"
                        className={`w-24 rounded-lg border px-3 py-1.5 text-sm focus:outline-none ${
                          entry.dirty
                            ? "border-warning bg-warning/5"
                            : "border-border bg-surface"
                        } focus:border-primary`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Tab") {
                            // Move to next row
                            const nextInput = document.querySelector(
                              `tr:nth-child(${i + 2}) input[type="number"]`
                            ) as HTMLInputElement;
                            if (nextInput) {
                              e.preventDefault();
                              nextInput.focus();
                            }
                          }
                        }}
                       aria-label="—"/>
                    </td>
                    <td className="py-2">
                      {entry.score !== "" ? (
                        entry.dirty ? (
                          <AlertCircle className="h-4 w-4 text-warning" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-success" />
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : selectedAssignment && selectedTerm && selectedAT ? (
        <Card>
          <p className="text-center text-muted py-8">No students found in this class section.</p>
        </Card>
      ) : (
        <Card>
          <p className="text-center text-muted py-8">
            Select a class & subject, term, and assessment type to begin entering marks.
          </p>
        </Card>
      )}
    </div>
  );
}
