"use client";

import { useState } from "react";
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
import { PageHeader } from "@/components/layout/page-header";

export default function AdminReportsPage() {
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [tab, setTab] = useState<"report-cards" | "documents">("report-cards");
  const [generatedReports, setGeneratedReports] = useState<any[]>([]);
  const [viewingHtml, setViewingHtml] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState<string | null>(null);

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
          setViewingHtml(null);
        },
        onError: () => toast.error("Failed to generate"),
      }
    );
  };

  const handleViewReport = async (studentId: string) => {
    setLoadingReport(studentId);
    try {
      const res = await api.get(`/reports/term/${studentId}/html`, {
        params: { termId },
      });
      setViewingHtml(res.data);
    } catch {
      toast.error("Failed to load report");
    } finally {
      setLoadingReport(null);
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

  const handleDownloadReport = async (studentId: string, studentName: string) => {
    setLoadingReport(studentId);
    try {
      const res = await api.get(`/reports/term/${studentId}/pdf`, {
        params: { termId },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Report-Card-${studentName.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded PDF for ${studentName}`);
    } catch {
      toast.error("Failed to download report");
    } finally {
      setLoadingReport(null);
    }
  };

  const handleDownloadAll = async () => {
    for (const r of generatedReports) {
      const name = r.data?.student?.name || "Student";
      await handleDownloadReport(r.studentId, name);
    }
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Documents"
      />

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
              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={yearId}
                onChange={(e) => {
                  setYearId(e.target.value);
                  setTermId("");
                }}
               aria-label="Academic Year">
                <option value="">Academic Year</option>
                {years?.map((y: any) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>

              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
               aria-label="Term">
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
               aria-label="Class Level">
                <option value="">Class Level</option>
                {levels?.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>

              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
               aria-label="Section">
                <option value="">Section</option>
                {sections?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
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
                  <Button variant="outline" size="sm" onClick={handleDownloadAll}>
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
                  {generatedReports.map((r: any, i: number) => (
                    <TableRow key={r.studentId}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.data?.student?.name}</TableCell>
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
                            onClick={() => handleViewReport(r.studentId)}
                            disabled={loadingReport === r.studentId}
                          >
                            {loadingReport === r.studentId ? (
                              <Spinner className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadReport(r.studentId, r.data?.student?.name || "Student")}
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const res = await api.get(`/reports/term/${r.studentId}/html`, { params: { termId } });
                              handlePrintReport(res.data);
                            }}
                          >
                            <Printer className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {viewingHtml && (
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle>Report Card Preview</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handlePrintReport(viewingHtml)}>
                    <Printer className="w-4 h-4 mr-1" />
                    Print
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setViewingHtml(null)}>
                    Close
                  </Button>
                </div>
              </div>
              <div
                className="border rounded-lg p-4 bg-surface"
                dangerouslySetInnerHTML={{ __html: viewingHtml }}
              />
            </Card>
          )}
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
             aria-label="Report type">
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
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${(generateDoc.data as any).title || "Document"}.html`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
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
                    const w = window.open("", "_blank");
                    if (w) {
                      w.document.write(html as string);
                      w.document.close();
                      w.print();
                    }
                  }}
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </Button>
              </div>
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: (generateDoc.data as any).html || (generateDoc.data as string) }}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
