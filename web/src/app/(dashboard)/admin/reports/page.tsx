"use client";

import { useRef, useState } from "react";
import JSZip from "jszip";
import {
  Card,
  CardTitle,
  Button,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Modal,
} from "@/components/ui";
import {
  useAcademicYears,
  useTerms,
  useClassLevels,
  useSections,
} from "@/hooks/use-academic";
import {
  useGenerateClassReports,
  useGenerateDocument,
} from "@/hooks/use-reports";
import { StudentPicker } from "@/components/student-picker";
import api from "@/lib/api";
import { FileText, Printer, Download, Users, Eye } from "lucide-react";
import { toast } from "sonner";

// One student's slot in the bulk register grid.
type CellStatus = "pending" | "active" | "done" | "failed";

type BulkState = {
  phase: "confirm" | "working" | "zipping" | "done" | "cancelled";
  statuses: CellStatus[];
  ok: number;
  failed: number;
  current?: string;
};

// Which row button is busy. Kept per action so a download never spins the eye.
type RowAction = { id: string; kind: "view" | "download" | "print" } | null;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminReportsPage() {
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [tab, setTab] = useState<"report-cards" | "documents">("report-cards");
  const [generatedReports, setGeneratedReports] = useState<any[]>([]);
  const [viewing, setViewing] = useState<{ html: string; name: string } | null>(null);
  const [pending, setPending] = useState<RowAction>(null);
  const [bulk, setBulk] = useState<BulkState | null>(null);
  const bulkCancelled = useRef(false);

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId);
  const generateClass = useGenerateClassReports();
  const generateDoc = useGenerateDocument();

  const [docStudentId, setDocStudentId] = useState("");
  const [docType, setDocType] = useState("TRANSFER_LETTER");

  const handleGenerateClassReports = () => {
    if (!sectionId || !termId) return toast.error("Select class and term");
    generateClass.mutate(
      { classSectionId: sectionId, termId },
      {
        onSuccess: (data: any) => {
          toast.success(`Generated ${data.count} report cards`);
          setGeneratedReports(data.reports || []);
          setViewing(null);
          setBulk(null);
        },
        onError: () => toast.error("Failed to generate"),
      }
    );
  };

  const handleViewReport = async (studentId: string, studentName: string) => {
    setPending({ id: studentId, kind: "view" });
    try {
      const res = await api.get(`/reports/term/${studentId}/html`, {
        params: { termId },
      });
      setViewing({ html: res.data, name: studentName });
    } catch {
      toast.error("Failed to load report");
    } finally {
      setPending(null);
    }
  };

  const handlePrintReport = (html: string) => {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  const handlePrintRow = async (studentId: string) => {
    setPending({ id: studentId, kind: "print" });
    try {
      const res = await api.get(`/reports/term/${studentId}/html`, {
        params: { termId },
      });
      handlePrintReport(res.data);
    } catch {
      toast.error("Failed to load report");
    } finally {
      setPending(null);
    }
  };

  const fetchPdfBlob = async (studentId: string): Promise<Blob> => {
    const res = await api.get(`/reports/term/${studentId}/pdf`, {
      params: { termId },
      responseType: "blob",
    });
    return new Blob([res.data], { type: "application/pdf" });
  };

  const handleDownloadReport = async (studentId: string, studentName: string) => {
    setPending({ id: studentId, kind: "download" });
    try {
      const blob = await fetchPdfBlob(studentId);
      saveBlob(blob, `Report-Card-${studentName.replace(/\s+/g, "-")}.pdf`);
      toast.success(`Downloaded PDF for ${studentName}`);
    } catch {
      toast.error("Failed to download report");
    } finally {
      setPending(null);
    }
  };

  // ── Bulk download: confirm, fetch every report with live progress, zip ──

  const openBulkConfirm = () => {
    bulkCancelled.current = false;
    setBulk({
      phase: "confirm",
      statuses: generatedReports.map(() => "pending" as CellStatus),
      ok: 0,
      failed: 0,
    });
  };

  const runBulkDownload = async () => {
    const statuses = generatedReports.map(() => "pending" as CellStatus);
    let ok = 0;
    let failed = 0;
    const zip = new JSZip();

    for (let i = 0; i < generatedReports.length; i++) {
      if (bulkCancelled.current) {
        setBulk({ phase: "cancelled", statuses: [...statuses], ok, failed });
        return;
      }
      const r = generatedReports[i];
      const name: string = r.data?.student?.name || `Student ${i + 1}`;
      statuses[i] = "active";
      setBulk({ phase: "working", statuses: [...statuses], ok, failed, current: name });
      try {
        const blob = await fetchPdfBlob(r.studentId);
        zip.file(
          `${String(i + 1).padStart(2, "0")} - ${name.replace(/[\\/:*?"<>|]/g, "")}.pdf`,
          blob,
        );
        statuses[i] = "done";
        ok++;
      } catch {
        statuses[i] = "failed";
        failed++;
      }
      setBulk({ phase: "working", statuses: [...statuses], ok, failed, current: name });
    }

    if (ok === 0) {
      setBulk({ phase: "done", statuses: [...statuses], ok, failed });
      return;
    }

    setBulk({ phase: "zipping", statuses: [...statuses], ok, failed });
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const cls = (generatedReports[0]?.data?.student?.class || "Class").replace(/\s+/g, "-");
    const termName = (generatedReports[0]?.data?.term?.name || "Term").replace(/\s+/g, "-");
    saveBlob(zipBlob, `Report-Cards-${cls}-${termName}.zip`);
    setBulk({ phase: "done", statuses: [...statuses], ok, failed });
  };

  const closeBulk = () => {
    if (!bulk) return;
    if (bulk.phase === "working") {
      bulkCancelled.current = true;
      return; // the loop lands on the cancelled state itself
    }
    if (bulk.phase === "zipping") return; // seconds from done, let it finish
    setBulk(null);
  };

  const handleGenerateDocument = () => {
    if (!docStudentId || !docType) return toast.error("Fill all fields");
    generateDoc.mutate(
      { studentId: docStudentId, type: docType },
      {
        onSuccess: () => toast.success("Document generated"),
        onError: () => toast.error("Failed to generate"),
      }
    );
  };

  const bulkTotal = bulk?.statuses.length ?? 0;
  const bulkReached = (bulk?.ok ?? 0) + (bulk?.failed ?? 0);
  const bulkTitle =
    bulk?.phase === "confirm"
      ? "Download all report cards"
      : bulk?.phase === "working"
        ? "Packing report cards"
        : bulk?.phase === "zipping"
          ? "Packing report cards"
          : bulk?.phase === "cancelled"
            ? "Stopped"
            : "Ready";

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-[#1B4F72]">Reports & Documents</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {(["report-cards", "documents"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab === t
                ? "border-[#1B4F72] text-[#1B4F72]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "report-cards" ? "Report Cards" : "Documents"}
          </button>
        ))}
      </div>

      {tab === "report-cards" && (
        <>
          <Card className="p-6 space-y-4">
            <CardTitle>Generate Class Report Cards</CardTitle>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={yearId}
                onChange={(e) => {
                  setYearId(e.target.value);
                  setTermId("");
                }}
              >
                <option value="">Academic Year</option>
                {years?.map((y: any) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>

              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">Term</option>
                {terms?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={levelId}
                onChange={(e) => {
                  setLevelId(e.target.value);
                  setSectionId("");
                }}
              >
                <option value="">Class Level</option>
                {levels?.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>

              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">Section</option>
                {sections?.map((s: any) => (
                  <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
                ))}
              </select>
            </div>

            <Button
              onClick={handleGenerateClassReports}
              disabled={generateClass.isPending}
            >
              {generateClass.isPending ? (
                <Spinner className="w-4 h-4" />
              ) : (
                <Users className="w-4 h-4 mr-2" />
              )}
              Generate Report Cards
            </Button>
          </Card>

          {generatedReports.length > 0 && (
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle>Generated Report Cards ({generatedReports.length})</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={openBulkConfirm}>
                    <Download className="w-4 h-4 mr-1" />
                    Download All
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Average</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generatedReports.map((r: any, i: number) => {
                    const name = r.data?.student?.name || `Student ${i + 1}`;
                    const isPending = (kind: "view" | "download" | "print") =>
                      pending?.id === r.studentId && pending?.kind === kind;
                    return (
                      <TableRow key={r.studentId}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>{r.data?.student?.class}</TableCell>
                        <TableCell>
                          {r.data?.result?.average != null
                            ? `${r.data.result.average.toFixed(1)}%`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            r.data?.result?.letterGrade === "A" || r.data?.result?.letterGrade === "B"
                              ? "success"
                              : r.data?.result?.letterGrade === "C"
                              ? "info"
                              : "warning"
                          }>
                            {r.data?.result?.letterGrade || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.data?.result?.rank || "—"} / {r.data?.classStats?.totalStudents || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`View report for ${name}`}
                              onClick={() => handleViewReport(r.studentId, name)}
                              disabled={pending?.id === r.studentId}
                            >
                              {isPending("view") ? (
                                <Spinner className="w-3 h-3" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Download report for ${name}`}
                              onClick={() => handleDownloadReport(r.studentId, name)}
                              disabled={pending?.id === r.studentId}
                            >
                              {isPending("download") ? (
                                <Spinner className="w-3 h-3" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Print report for ${name}`}
                              onClick={() => handlePrintRow(r.studentId)}
                              disabled={pending?.id === r.studentId}
                            >
                              {isPending("print") ? (
                                <Spinner className="w-3 h-3" />
                              ) : (
                                <Printer className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* ── Report preview, in a scrollable modal ── */}
          <Modal
            isOpen={!!viewing}
            onClose={() => setViewing(null)}
            title={viewing ? `Report card · ${viewing.name}` : "Report card"}
            size="3xl"
          >
            <div className="mb-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => viewing && handlePrintReport(viewing.html)}
              >
                <Printer className="w-4 h-4 mr-1" />
                Print
              </Button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto rounded-lg border border-border bg-accent-light/40 p-3">
              {/* Isolated in an iframe: the sheet carries its own global styles. */}
              <iframe
                srcDoc={viewing?.html}
                title="Report card preview"
                className="w-full rounded bg-white shadow-card"
                style={{ aspectRatio: "210 / 297" }}
              />
            </div>
          </Modal>

          {/* ── Bulk download: confirm, register-grid progress, zip ── */}
          <Modal isOpen={!!bulk} onClose={closeBulk} title={bulkTitle} size="lg">
            {bulk?.phase === "confirm" && (
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  All {generatedReports.length} report cards of{" "}
                  <span className="font-medium text-foreground">
                    {generatedReports[0]?.data?.student?.class}
                  </span>{" "}
                  ({generatedReports[0]?.data?.term?.name}) will be fetched one
                  by one and packed into a single .zip file, about{" "}
                  {(generatedReports.length * 0.17).toFixed(1)} MB. You can
                  watch each student get ticked off as their report is added.
                </p>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setBulk(null)}>
                    Cancel
                  </Button>
                  <Button onClick={runBulkDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Pack {generatedReports.length} reports
                  </Button>
                </div>
              </div>
            )}

            {bulk && bulk.phase !== "confirm" && (
              <div className="space-y-4">
                {/* Count + progress track */}
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-muted" aria-live="polite">
                    {bulk.phase === "working" && bulk.current && (
                      <>Fetching <span className="font-medium text-foreground">{bulk.current}</span>&rsquo;s report</>
                    )}
                    {bulk.phase === "zipping" && "Packing everything into one file"}
                    {bulk.phase === "done" &&
                      (bulk.ok > 0
                        ? `Packed ${bulk.ok} report${bulk.ok === 1 ? "" : "s"} into one zip file.`
                        : "No report could be fetched. Check the API and try again.")}
                    {bulk.phase === "cancelled" &&
                      `Stopped after ${bulkReached} of ${bulkTotal}. Nothing was downloaded.`}
                    {bulk.phase === "done" && bulk.failed > 0 && (
                      <span className="text-danger"> {bulk.failed} failed (marked in red).</span>
                    )}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-primary">
                    {bulkReached}
                    <span className="text-sm font-normal text-muted"> / {bulkTotal}</span>
                  </p>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-accent-light">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${bulkTotal ? (bulkReached / bulkTotal) * 100 : 0}%` }}
                  />
                </div>

                {/* The class register: one cell per student, ticked as packed */}
                <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                  {bulk.statuses.map((st, i) => {
                    const name = generatedReports[i]?.data?.student?.name || `Student ${i + 1}`;
                    return (
                      <div
                        key={generatedReports[i]?.studentId ?? i}
                        title={name}
                        className={`flex h-9 items-center justify-center rounded-md border text-[10px] font-semibold transition-colors duration-300 ${
                          st === "done"
                            ? "border-primary bg-primary text-white"
                            : st === "active"
                              ? "animate-pulse border-primary bg-accent-light text-primary"
                              : st === "failed"
                                ? "border-danger/40 bg-danger/10 text-danger"
                                : "border-border bg-white text-muted"
                        }`}
                      >
                        {initialsOf(name)}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-3">
                  {bulk.phase === "working" && (
                    <Button variant="outline" onClick={() => (bulkCancelled.current = true)}>
                      Stop
                    </Button>
                  )}
                  {bulk.phase === "zipping" && (
                    <Button variant="outline" disabled>
                      <Spinner className="mr-2 h-4 w-4" />
                      Zipping
                    </Button>
                  )}
                  {(bulk.phase === "done" || bulk.phase === "cancelled") && (
                    <Button variant="outline" onClick={() => setBulk(null)}>
                      Close
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Modal>
        </>
      )}

      {tab === "documents" && (
        <Card className="p-6 space-y-4">
          <CardTitle>Generate Document</CardTitle>

          <StudentPicker value={docStudentId} onChange={setDocStudentId} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="TRANSFER_LETTER">Transfer Letter</option>
              <option value="ENROLLMENT_CONFIRMATION">Enrollment Confirmation</option>
              <option value="DISCIPLINE_REPORT">Discipline Report</option>
              <option value="TRANSCRIPT">Transcript</option>
            </select>

            <Button
              onClick={handleGenerateDocument}
              disabled={generateDoc.isPending || !docStudentId}
            >
              <FileText className="w-4 h-4 mr-2" />
              Generate
            </Button>
          </div>

          {generateDoc.data && (
            <div className="mt-4 border rounded-lg p-4">
              <div className="flex justify-end mb-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const html = (generateDoc.data as any).html || generateDoc.data;
                    const blob = new Blob([html as string], { type: "text/html" });
                    saveBlob(blob, `${(generateDoc.data as any).title || "Document"}.html`);
                  }}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const html = (generateDoc.data as any).html || generateDoc.data;
                    handlePrintReport(html as string);
                  }}
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </Button>
              </div>
              <iframe
                srcDoc={(generateDoc.data as any).html || (generateDoc.data as string)}
                title="Document preview"
                className="w-full rounded-lg border border-border bg-white"
                style={{ minHeight: "70vh" }}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
