"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Spinner,
  Button,
} from "@/components/ui";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import { useTermReport } from "@/hooks/use-reports";
import { useAuthStore } from "@/stores/auth-store";
import { FileText, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DEFAULT_BRAND_COLOR } from "@/lib/chart-colors";

export default function StudentReportsPage() {
  const { user } = useAuthStore();
  const studentId = (user as any)?.studentId || "";
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: report, isLoading } = useTermReport(studentId, termId);

  const handlePrint = () => {
    if (!report) return;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<html><head><title>Report Card</title><style>
        body { font-family: Arial; margin: 40px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: ${DEFAULT_BRAND_COLOR}; color: white; }
        .header { text-align: center; margin-bottom: 20px; }
      </style></head><body>
        <div class="header"><h2>${report.student?.user?.firstName} ${report.student?.user?.lastName} — Term Report</h2></div>
        <table><tr><th>Subject</th><th>Score</th><th>Grade</th></tr>
        ${report.subjects?.map((s: any) => `<tr><td>${s.subjectName}</td><td>${s.average}</td><td>${s.grade}</td></tr>`).join("")}
        </table>
        <p><strong>Average:</strong> ${report.average} | <strong>Rank:</strong> ${report.rank}</p>
      </body></html>`);
      w.document.close();
      w.print();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Report Cards"
      />

      <div className="flex gap-4">
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }} aria-label="Select Year">
          <option value="">Select Year</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="Select Term">
          <option value="">Select Term</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center py-8"><Spinner /></div>}

      {report && (
        <Card className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <CardTitle>
              {report.student?.user?.firstName} {report.student?.user?.lastName} — {report.termName}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="p-3 bg-accent">
              <p className="text-xs text-foreground-muted">Average</p>
              <p className="text-xl font-bold text-primary">{report.average ?? "—"}</p>
            </Card>
            <Card className="p-3 bg-accent">
              <p className="text-xs text-foreground-muted">Grade</p>
              <p className="text-xl font-bold text-primary">{report.letterGrade ?? "—"}</p>
            </Card>
            <Card className="p-3 bg-accent">
              <p className="text-xs text-foreground-muted">Rank</p>
              <p className="text-xl font-bold text-primary">{report.rank ?? "—"}</p>
            </Card>
          </div>

          <div className="space-y-2">
            {report.subjects?.map((s: any, i: number) => (
              <div key={i} className="flex justify-between items-center py-2 border-b">
                <span className="font-medium">{s.subjectName}</span>
                <div className="flex gap-4 text-sm">
                  <span>{s.average}%</span>
                  <span className="font-medium text-primary">{s.grade}</span>
                </div>
              </div>
            ))}
          </div>

          {report.teacherComment && (
            <div className="bg-surface-muted rounded-lg p-4">
              <p className="text-sm font-medium text-foreground-muted">Teacher&apos;s Comment</p>
              <p className="text-sm mt-1">{report.teacherComment}</p>
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
