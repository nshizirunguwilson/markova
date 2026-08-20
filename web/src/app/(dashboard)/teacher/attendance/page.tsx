"use client";

import { useState, useMemo, useRef } from "react";
import { Card, CardTitle, Button, Badge, Spinner } from "@/components/ui";
import { useSections, useClassLevels } from "@/hooks/use-academic";
import { useClassAttendance, useBulkAttendance, useQrScan } from "@/hooks/use-attendance";
import { Camera, Check, X, Clock, Save, QrCode } from "lucide-react";
import { toLocalDateString } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

type Status = "PRESENT" | "ABSENT" | "LATE" | null;

export default function TeacherAttendancePage() {
  const { data: classLevels } = useClassLevels();
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedSectionChoice, setSelectedSection] = useState("");
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [showScanner, setShowScanner] = useState(false);
  const [qrInput, setQrInput] = useState("");
  // Only the teacher's unsaved edits live in state. The effective statuses are
  // derived by layering those over what the server returned, so there is no
  // effect syncing server data into state (and no frame where the two disagree).
  // Edits are stamped with the class+date they belong to, so switching either
  // discards them without needing an effect to clear.
  const [edits, setEdits] = useState<{
    key: string;
    values: Record<string, Status>;
  }>({ key: "", values: {} });

  const { data: sections } = useSections(selectedLevel);
  // Derived during render rather than synced in an effect: the user's
  // explicit choice wins, otherwise fall back to the server default.
  const selectedSection = selectedSectionChoice || sections?.[0]?.id || "";
  const { data: classData, isLoading } = useClassAttendance(selectedSection, date);
  const bulkAttendance = useBulkAttendance();
  const qrScan = useQrScan();
  const qrInputRef = useRef<HTMLInputElement>(null);

  const editKey = `${selectedSection}:${date}`;

  const localStatuses = useMemo<Record<string, Status>>(() => {
    const fromServer: Record<string, Status> = {};
    for (const s of classData?.students ?? []) {
      fromServer[s.studentId] = s.status;
    }
    return edits.key === editKey
      ? { ...fromServer, ...edits.values }
      : fromServer;
  }, [classData, edits, editKey]);

  const setLocalStatuses = (
    update:
      | Record<string, Status>
      | ((prev: Record<string, Status>) => Record<string, Status>),
  ) =>
    setEdits((prev) => ({
      key: editKey,
      values:
        typeof update === "function"
          ? update(prev.key === editKey ? { ...localStatuses } : localStatuses)
          : update,
    }));

  const toggleStatus = (studentId: string) => {
    setLocalStatuses((prev) => {
      const current = prev[studentId];
      const next: Status =
        current === null ? "PRESENT" : current === "PRESENT" ? "LATE" : current === "LATE" ? "ABSENT" : "PRESENT";
      return { ...prev, [studentId]: next };
    });
  };

  const handleSave = () => {
    if (!selectedSection || !date) return;
    const records = Object.entries(localStatuses)
      .filter(([, status]) => status !== null)
      .map(([studentId, status]) => ({ studentId, status: status as string }));
    if (records.length === 0) return;
    bulkAttendance.mutate({
      classSectionId: selectedSection,
      date,
      type: "daily",
      records,
    });
  };

  const handleQrSubmit = () => {
    if (!qrInput.trim() || !selectedSection) return;
    qrScan.mutate({ qrData: qrInput.trim(), classSectionId: selectedSection });
    setQrInput("");
    qrInputRef.current?.focus();
  };

  const markAllPresent = () => {
    if (!classData?.students) return;
    const map: Record<string, Status> = {};
    for (const s of classData.students) {
      map[s.studentId] = "PRESENT";
    }
    setLocalStatuses(map);
  };

  const present = Object.values(localStatuses).filter((s) => s === "PRESENT").length;
  const late = Object.values(localStatuses).filter((s) => s === "LATE").length;
  const absent = Object.values(localStatuses).filter((s) => s === "ABSENT").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Mark student attendance"
        actions={
          <>
            <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowScanner(!showScanner)}>
            <QrCode className="mr-1 h-4 w-4" /> {showScanner ? "Hide Scanner" : "QR Scanner"}
          </Button>
          <Button onClick={handleSave} isLoading={bulkAttendance.isPending}>
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
        </div>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Class Level</label>
            <select
              value={selectedLevel}
              onChange={(e) => { setSelectedLevel(e.target.value); setSelectedSection(""); }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Class Level">
              <option value="">Select level...</option>
              {classLevels?.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Section">
              <option value="">Select section...</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Date"/>
          </div>
        </div>
      </Card>

      {/* QR Scanner */}
      {showScanner && (
        <Card>
          <CardTitle><Camera className="mr-2 inline h-5 w-5" /> QR Scanner</CardTitle>
          <p className="mt-1 text-xs text-muted">Scan or type student ID number</p>
          <div className="mt-3 flex gap-2">
            <input
              ref={qrInputRef}
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="Scan QR or type student ID..."
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleQrSubmit()}
              autoFocus
             aria-label="Scan QR or type student ID..."/>
            <Button onClick={handleQrSubmit} isLoading={qrScan.isPending}>Scan</Button>
          </div>
        </Card>
      )}

      {/* Summary Stats */}
      {classData && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <p className="text-xs text-muted">Total</p>
            <p className="text-2xl font-bold text-foreground">{classData.total}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Present</p>
            <p className="text-2xl font-bold text-success">{present}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Late</p>
            <p className="text-2xl font-bold text-warning">{late}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">Absent</p>
            <p className="text-2xl font-bold text-danger">{absent}</p>
          </Card>
        </div>
      )}

      {/* Student List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : classData?.students?.length > 0 ? (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Students ({classData.students.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={markAllPresent}>
              <Check className="mr-1 h-3 w-3" /> Mark All Present
            </Button>
          </div>
          <div className="space-y-2">
            {classData.students.map((s: any, i: number) => {
              const status = localStatuses[s.studentId];
              return (
                <div
                  key={s.studentId}
                  className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted w-6">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted font-mono">{s.studentIdNumber}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleStatus(s.studentId)}
                    className="flex items-center gap-1"
                  >
                    {status === "PRESENT" ? (
                      <Badge variant="success"><Check className="mr-1 h-3 w-3" /> Present</Badge>
                    ) : status === "LATE" ? (
                      <Badge variant="warning"><Clock className="mr-1 h-3 w-3" /> Late</Badge>
                    ) : status === "ABSENT" ? (
                      <Badge variant="danger"><X className="mr-1 h-3 w-3" /> Absent</Badge>
                    ) : (
                      <Badge>Tap to mark</Badge>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      ) : selectedSection ? (
        <Card>
          <p className="text-center text-muted py-8">No students found in this class.</p>
        </Card>
      ) : null}
    </div>
  );
}
