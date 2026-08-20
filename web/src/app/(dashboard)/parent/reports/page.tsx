"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardTitle,
  Spinner,
  Button,
} from "@/components/ui";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import { useTermReport } from "@/hooks/use-reports";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";
import { FileText, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

interface Child { id: string; name: string; }

export default function ParentReportsPage() {
  const { user } = useAuthStore();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: report, isLoading } = useTermReport(selectedChild, termId);

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/users/${user.id}`).then((res) => {
      const links = res.data?.parentStudents || [];
      const kids = links.map((ps: any) => ({
        id: ps.student.id,
        name: `${ps.student.user.firstName} ${ps.student.user.lastName}`,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0].id);
    }).catch(() => {});
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Cards"
      />

      <div className="flex gap-4 flex-wrap">
        {children.length > 1 && (
          <select className="border rounded-lg px-3 py-2 text-sm" value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)}>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }}>
          <option value="">Select Year</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={termId} onChange={(e) => setTermId(e.target.value)}>
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
            <Button variant="outline" size="sm" onClick={() => {
              const w = window.open("", "_blank");
              if (w) {
                w.document.write(`<html><head><title>Report Card</title></head><body>
                  <h2>${report.student?.user?.firstName} ${report.student?.user?.lastName}</h2>
                  <p>Average: ${report.average} | Grade: ${report.letterGrade} | Rank: ${report.rank}</p>
                </body></html>`);
                w.document.close();
                w.print();
              }
            }}>
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
