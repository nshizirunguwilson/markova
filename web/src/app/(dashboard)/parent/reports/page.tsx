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
import { Clock, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { printHtml } from "@/lib/print";
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
  const { data: report, isLoading, error } = useTermReport(selectedChild, termId);
  // The school issues report cards after results are finalised, so the API
  // refuses until then. A normal state, not a fault.
  const notIssued = (error as any)?.response?.status === 403;

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/users/${user.id}`).then((res) => {
      const links = res.data?.parentStudents || [];
      const kids = links.map((ps: any) => ({
        id: ps.student.id,
        name: `${ps.student?.user?.firstName} ${ps.student?.user?.lastName}`,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0].id);
    }).catch(() => {});
  }, [user?.id]);

  const [printing, setPrinting] = useState(false);

  /**
   * Prints the A4 report card the school actually issues.
   *
   * This used to build its own two-line page in a popup — name, average,
   * grade, rank — so a parent who pressed Print got something that looked
   * nothing like the document their child's school hands out. It now prints
   * the same sheet, from this page rather than a second tab.
   */
  const handlePrint = async () => {
    if (!selectedChild || !termId) return;
    setPrinting(true);
    try {
      const res = await api.get(`/reports/term/${selectedChild}/html`, {
        params: { termId },
      });
      if (!printHtml(res.data)) {
        toast.error("Your browser would not open the print dialog");
      }
    } catch (e: any) {
      toast.error(
        e?.response?.status === 403
          ? "This report card has not been issued yet"
          : "Could not load the official report card",
      );
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Cards"
      />

      <div className="flex gap-4 flex-wrap">
        {children.length > 1 && (
          <select className="border rounded-lg px-3 py-2 text-sm" value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)} aria-label="Select child">
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
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

      {notIssued && !isLoading && (
        <Card>
          <div className="py-10 text-center">
            <Clock className="mx-auto mb-3 h-8 w-8 text-muted opacity-50" />
            <p className="font-medium text-foreground">
              This report card has not been issued yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              The school issues report cards once results have been finalised.
              It will appear here as soon as it does.
            </p>
          </div>
        </Card>
      )}

      {report && (
        <Card className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <CardTitle>
              {report.student?.user?.firstName} {report.student?.user?.lastName} — {report.termName}
            </CardTitle>
            <Button variant="outline" size="sm" isLoading={printing} onClick={handlePrint}>
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
