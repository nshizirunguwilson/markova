"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Spinner,
  Button,
} from "@/components/ui";
import { A4Preview } from "@/components/a4-preview";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import { useTermReport } from "@/hooks/use-reports";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";
import { toast } from "sonner";
import { printHtml } from "@/lib/print";
import { WithheldNotice } from "@/components/finance/withheld-notice";
import { withheldFrom } from "@/lib/withheld";
import { Clock, Download, Eye, FileText, Printer } from "lucide-react";

export default function StudentReportsPage() {
  const { user } = useAuthStore();
  const studentId = (user as any)?.studentId || "";
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: report, isLoading, error } = useTermReport(studentId, termId);
  /**
   * Issuing the report card is a decision the school takes after the marks
   * are out, so the API refuses it until then. That is a normal state, not a
   * fault - this reads as "not issued yet" rather than an error the student
   * has to interpret.
   */
  /**
   * Held over the fees, which is not the same as not issued.
   *
   * Both arrive as a 403. Not issued is the school still working; held is
   * something the family can act on, and the panel for it names the amount.
   */
  const withheld = withheldFrom(error);
  const notIssued = !withheld && (error as any)?.response?.status === 403;
  const [officialHtml, setOfficialHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "view" | "print" | "download">("");

  const fetchOfficialHtml = async (): Promise<string | null> => {
    try {
      const res = await api.get(`/reports/term/${studentId}/html`, {
        params: { termId },
      });
      return res.data;
    } catch (e: any) {
      toast.error(
        e?.response?.status === 403
          ? "Your report card has not been issued yet"
          : "Could not load the official report card",
      );
      return null;
    }
  };

  // Print the same A4 card the school issues, not a homemade table.
  const handlePrint = async () => {
    setBusy("print");
    const html = officialHtml ?? (await fetchOfficialHtml());
    setBusy("");
    if (!html) return;
    setOfficialHtml(html);
    // Prints from this page. A second tab left behind, or swallowed by a
    // popup blocker, is not what a Print button should do.
    if (!printHtml(html)) toast.error("Your browser would not open the print dialog");
  };

  const handleView = async () => {
    if (officialHtml) return setOfficialHtml(null);
    setBusy("view");
    const html = await fetchOfficialHtml();
    setBusy("");
    if (html) setOfficialHtml(html);
  };

  const handleDownload = async () => {
    setBusy("download");
    try {
      const res = await api.get(`/reports/term/${studentId}/pdf`, {
        params: { termId },
        responseType: "blob",
      });
      const url = URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "My-Report-Card.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download the PDF");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-primary">My Report Cards</h1>

      <div className="flex gap-4">
        <select aria-label="Academic year" className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }}>
          <option value="">Select Year</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select aria-label="Term" className="border rounded-lg px-3 py-2 text-sm" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">Select Term</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center py-8"><Spinner /></div>}

      {withheld && !isLoading && (
        <WithheldNotice
          withheld={withheld}
          feesHref="/student/fees"
          what="report cards"
        />
      )}

      {notIssued && !isLoading && (
        <Card>
          <div className="py-10 text-center">
            <Clock className="mx-auto mb-3 h-8 w-8 text-muted opacity-50" />
            <p className="font-medium text-foreground">
              Your report card for this term has not been issued yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              The school issues report cards once results have been finalised.
              It will appear here, ready to read and print, as soon as it does.
            </p>
          </div>
        </Card>
      )}

      {report && (
        <Card className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <CardTitle>
              {report.student?.name} - {report.term?.name}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleView} disabled={busy !== ""}>
                {busy === "view" ? <Spinner className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                {officialHtml ? "Hide card" : "View card"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy !== ""}>
                {busy === "download" ? <Spinner className="w-4 h-4 mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                Download
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint} disabled={busy !== ""}>
                {busy === "print" ? <Spinner className="w-4 h-4 mr-1" /> : <Printer className="w-4 h-4 mr-1" />}
                Print
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="p-3 bg-accent">
              <p className="text-xs text-foreground-muted">Average</p>
              <p className="text-xl font-bold text-primary">{report.result?.average != null ? `${report.result.average.toFixed(1)}%` : "-"}</p>
            </Card>
            <Card className="p-3 bg-accent">
              <p className="text-xs text-foreground-muted">Grade</p>
              <p className="text-xl font-bold text-primary">{report.result?.letterGrade ?? "-"}</p>
            </Card>
            <Card className="p-3 bg-accent">
              <p className="text-xs text-foreground-muted">Rank</p>
              <p className="text-xl font-bold text-primary">{report.classStats?.rank ? `#${report.classStats.rank}` : "-"}</p>
            </Card>
          </div>

          <div className="space-y-2">
            {report.subjects?.map((s: any, i: number) => (
              <div key={i} className="flex justify-between items-center py-2 border-b">
                <span className="font-medium">{s.subject}</span>
                <div className="flex gap-4 text-sm">
                  <span>{s.average}%</span>
                  <span className="font-medium text-primary">{s.grade}</span>
                </div>
              </div>
            ))}
          </div>

          {officialHtml && (
            <div className="rounded-lg border border-border bg-accent-light/40 p-3">
              <A4Preview html={officialHtml} title="My report card" />
            </div>
          )}

          {report.result?.teacherComment && (
            <div className="bg-surface-muted rounded-lg p-4">
              <p className="text-sm font-medium text-foreground-muted">Teacher&apos;s Comment</p>
              <p className="text-sm mt-1">{report.result.teacherComment}</p>
            </div>
          )}
        </Card>
      )}

      {!isLoading && !report && termId && (
        <Card className="p-8 text-center text-muted">
          <FileText className="w-12 h-12 mx-auto mb-2 text-border-strong" />
          No report card available for this term
        </Card>
      )}
    </div>
  );
}
