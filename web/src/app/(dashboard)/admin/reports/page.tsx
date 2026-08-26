"use client";

import { useEffect, useRef, useState } from "react";
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
import { A4Preview } from "@/components/a4-preview";
import api from "@/lib/api";
import { Check, FileText, Printer, Download, Users, Eye } from "lucide-react";
import { printHtml } from "@/lib/print";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

// One student's line in the bulk roll call.
type BulkItem = { status: "pending" | "active" | "done" | "failed"; error?: string };

type BulkState = {
  phase: "confirm" | "working" | "review" | "zipping" | "done" | "cancelled";
  items: BulkItem[];
  ok: number;
  failed: number;
  currentIdx?: number;
};

// Which row button is busy. Kept per action so a download never spins the eye.
type RowAction = { id: string; kind: "view" | "download" | "print" } | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [viewing, setViewing] = useState<{ html: string; name: string; studentId: string } | null>(null);
  const [pending, setPending] = useState<RowAction>(null);
  const [bulk, setBulk] = useState<BulkState | null>(null);
  const bulkCancelled = useRef(false);
  const zipRef = useRef<JSZip | null>(null);
  const itemsRef = useRef<BulkItem[]>([]);
  const activeRowRef = useRef<HTMLLIElement | null>(null);

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId);
  const generateClass = useGenerateClassReports();
  const generateDoc = useGenerateDocument();

  const [docStudentId, setDocStudentId] = useState("");
  // The wire values are lowercase, from DocumentType in
  // backend/src/modules/reports/dto/index.ts. Sending the uppercase names was
  // rejected by validation, so every document type failed.
  const [docType, setDocType] = useState("transfer_letter");
  const [docDownloading, setDocDownloading] = useState(false);

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
      setViewing({ html: res.data, name: studentName, studentId });
    } catch {
      toast.error("Failed to load report");
    } finally {
      setPending(null);
    }
  };

  // Prints from this page rather than a second tab. See lib/print.ts: the
  // old window.open route left an orphan tab behind, and popup blockers made
  // the Print button do nothing at all.
  const handlePrintReport = (html: string) => {
    if (!printHtml(html)) toast.error("Your browser would not open the print dialog");
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

  // ── Bulk download: confirm, roll-call fetch with retries, review, zip ──

  const openBulkConfirm = () => {
    bulkCancelled.current = false;
    zipRef.current = new JSZip();
    itemsRef.current = generatedReports.map(() => ({ status: "pending" as const }));
    setBulk({ phase: "confirm", items: [...itemsRef.current], ok: 0, failed: 0 });
  };

  const countOf = (status: BulkItem["status"]) =>
    itemsRef.current.filter((it) => it.status === status).length;

  const pushBulk = (phase: BulkState["phase"], currentIdx?: number) =>
    setBulk({
      phase,
      items: itemsRef.current.map((it) => ({ ...it })),
      ok: countOf("done"),
      failed: countOf("failed"),
      currentIdx,
    });

  // Fetch one student's PDF into the zip. Retries once on its own: a rate
  // limit (429) waits out the throttle window, anything else gets one quick
  // second chance.
  const fetchOneIntoZip = async (i: number) => {
    const r = generatedReports[i];
    const name: string = r.data?.student?.name || `Student ${i + 1}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const blob = await fetchPdfBlob(r.studentId);
        zipRef.current?.file(
          `${String(i + 1).padStart(2, "0")} - ${name.replace(/[\\/:*?"<>|]/g, "")}.pdf`,
          blob,
        );
        itemsRef.current[i] = { status: "done" };
        return;
      } catch (e: any) {
        const status = e?.response?.status;
        if (attempt === 1) {
          await sleep(status === 429 ? 3000 : 800);
          continue;
        }
        itemsRef.current[i] = {
          status: "failed",
          error:
            status === 429
              ? "Rate limited"
              : status
                ? `Server error ${status}`
                : "Network error",
        };
      }
    }
  };

  const runBulk = async (indices: number[]) => {
    for (const i of indices) {
      if (bulkCancelled.current) {
        pushBulk("cancelled");
        return;
      }
      itemsRef.current[i] = { status: "active" };
      pushBulk("working", i);
      await fetchOneIntoZip(i);
      pushBulk("working", i);
    }
    if (countOf("failed") > 0) {
      pushBulk("review");
    } else {
      await finalizeZip();
    }
  };

  const finalizeZip = async () => {
    if (countOf("done") === 0) {
      pushBulk("done");
      return;
    }
    pushBulk("zipping");
    const zipBlob = await zipRef.current!.generateAsync({ type: "blob" });
    const cls = (generatedReports[0]?.data?.student?.class || "Class").replace(/\s+/g, "-");
    const termName = (generatedReports[0]?.data?.term?.name || "Term").replace(/\s+/g, "-");
    saveBlob(zipBlob, `Report-Cards-${cls}-${termName}.zip`);
    pushBulk("done");
  };

  const startBulk = () => runBulk(generatedReports.map((_, i) => i));

  const retryFailed = () => {
    const failedIdx = itemsRef.current
      .map((it, i) => (it.status === "failed" ? i : -1))
      .filter((i) => i >= 0);
    failedIdx.forEach((i) => (itemsRef.current[i] = { status: "pending" }));
    void runBulk(failedIdx);
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

  const documentHtml: string =
    (generateDoc.data as any)?.html ?? (generateDoc.data as string) ?? "";

  /**
   * The letter as a real A4 PDF.
   *
   * "Download" used to save the raw HTML, which opens in a browser rather
   * than a reader and prints at whatever size that browser chooses. The API
   * renders the same sheet through Chrome at 210×297mm.
   */
  const handleDownloadDocument = async () => {
    setDocDownloading(true);
    try {
      const res = await api.post(
        "/reports/document/pdf",
        { studentId: docStudentId, type: docType },
        { responseType: "blob" },
      );
      const title = (generateDoc.data as any)?.title || "Document";
      saveBlob(new Blob([res.data], { type: "application/pdf" }), `${title}.pdf`);
      toast.success("Downloaded PDF");
    } catch (e) {
      toast.error(errorMessage(e, "Failed to download the document"));
    } finally {
      setDocDownloading(false);
    }
  };

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [bulk?.currentIdx]);

  const bulkTotal = bulk?.items.length ?? 0;
  const bulkReached = (bulk?.ok ?? 0) + (bulk?.failed ?? 0);
  const bulkTitle =
    bulk?.phase === "confirm"
      ? "Download all report cards"
      : bulk?.phase === "review"
        ? "Some reports failed"
        : bulk?.phase === "cancelled"
          ? "Stopped"
          : bulk?.phase === "done"
            ? "Ready"
            : "Packing report cards";

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-primary">Reports & Documents</h1>

      <div className="flex gap-2 border-b border-border">
        {(["report-cards", "documents"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground-muted"
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
              <select aria-label="Academic year"
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

              <select aria-label="Term"
                className="border rounded-lg px-3 py-2 text-sm"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">Term</option>
                {terms?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <select aria-label="Class level"
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

              <select aria-label="Class section"
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
            size="5xl"
          >
            <div className="mb-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending?.kind === "download"}
                onClick={() =>
                  viewing && handleDownloadReport(viewing.studentId, viewing.name)
                }
              >
                {pending?.id === viewing?.studentId && pending?.kind === "download" ? (
                  <Spinner className="w-4 h-4 mr-1" />
                ) : (
                  <Download className="w-4 h-4 mr-1" />
                )}
                Download
              </Button>
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
              {/* Isolated in an iframe (the sheet carries its own global
                  styles) and scaled to fit the width, so this container's
                  scrollbar is the only one. */}
              {viewing && <A4Preview html={viewing.html} title="Report card preview" />}
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
                  <Button onClick={startBulk}>
                    <Download className="mr-2 h-4 w-4" />
                    Pack {generatedReports.length} reports
                  </Button>
                </div>
              </div>
            )}

            {bulk && bulk.phase !== "confirm" && (
              <div className="space-y-4">
                {/* Status line + running count */}
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-muted" aria-live="polite">
                    {bulk.phase === "working" && bulk.currentIdx != null && (
                      <>Fetching{" "}
                        <span className="font-medium text-foreground">
                          {generatedReports[bulk.currentIdx]?.data?.student?.name}
                        </span>
                        &rsquo;s report</>
                    )}
                    {bulk.phase === "review" && (
                      <>
                        {bulk.failed} of {bulkTotal} could not be fetched. Retry
                        them, or download the {bulk.ok} that succeeded.
                      </>
                    )}
                    {bulk.phase === "zipping" && "Packing everything into one file"}
                    {bulk.phase === "done" &&
                      (bulk.ok > 0
                        ? `Packed ${bulk.ok} report${bulk.ok === 1 ? "" : "s"} into one zip file.`
                        : "No report could be fetched. Check that the API is running and try again.")}
                    {bulk.phase === "cancelled" &&
                      `Stopped after ${bulkReached} of ${bulkTotal}. Nothing was downloaded.`}
                  </p>
                  <p className="shrink-0 text-lg font-semibold tabular-nums text-primary">
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

                {/* The roll call: every student on their own ruled line */}
                <ol className="max-h-60 overflow-y-auto rounded-lg border border-border bg-surface px-3 py-1">
                  {bulk.items.map((it, i) => {
                    const name =
                      generatedReports[i]?.data?.student?.name || `Student ${i + 1}`;
                    const isActive = it.status === "active";
                    return (
                      <li
                        key={generatedReports[i]?.studentId ?? i}
                        ref={isActive ? activeRowRef : undefined}
                        className={`flex items-baseline gap-2 py-1.5 text-sm ${
                          it.status === "pending" ? "text-muted" : "text-foreground"
                        } ${isActive ? "-mx-3 bg-accent-light/60 px-3" : ""}`}
                      >
                        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">
                          {i + 1}
                        </span>
                        <span className={it.status === "pending" ? "" : "font-medium"}>
                          {name}
                        </span>
                        <span className="mx-1 flex-1 border-b border-dotted border-border" />
                        {it.status === "done" && (
                          <Check className="h-4 w-4 shrink-0 self-center text-primary" aria-label="Packed" />
                        )}
                        {isActive && <Spinner className="h-3.5 w-3.5 shrink-0 self-center" />}
                        {it.status === "failed" && (
                          <span className="shrink-0 text-xs font-medium text-danger">
                            {it.error || "Failed"}
                          </span>
                        )}
                        {it.status === "pending" && (
                          <span className="shrink-0 text-xs">queued</span>
                        )}
                      </li>
                    );
                  })}
                </ol>

                <div className="flex justify-end gap-3">
                  {bulk.phase === "working" && (
                    <Button variant="outline" onClick={() => (bulkCancelled.current = true)}>
                      Stop
                    </Button>
                  )}
                  {bulk.phase === "review" && (
                    <>
                      <Button variant="outline" onClick={() => setBulk(null)}>
                        Cancel
                      </Button>
                      <Button variant="outline" onClick={finalizeZip}>
                        Download {bulk.ok} anyway
                      </Button>
                      <Button onClick={retryFailed}>
                        Retry {bulk.failed} failed
                      </Button>
                    </>
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
            <select aria-label="Document type"
              className="border rounded-lg px-3 py-2 text-sm"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="transfer_letter">Transfer Letter</option>
              <option value="enrollment_confirmation">Enrollment Confirmation</option>
              <option value="discipline_report">Discipline Report</option>
              <option value="transcript">Transcript</option>
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
            <div className="mt-4 rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {(generateDoc.data as any).title || "Document"}
                  <span className="ml-2 text-xs font-normal text-muted">A4 · 210 × 297 mm</span>
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={docDownloading}
                    onClick={handleDownloadDocument}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePrintReport(documentHtml)}
                  >
                    <Printer className="w-4 h-4 mr-1" />
                    Print
                  </Button>
                </div>
              </div>
              {/* The same A4 sheet the PDF is, scaled to fit — the old preview
                  was a free-height iframe, so the letter was shown at a size it
                  is never printed at. */}
              <A4Preview html={documentHtml} title="Document preview" />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
