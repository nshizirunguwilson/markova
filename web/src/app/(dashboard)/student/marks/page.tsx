"use client";

import { useState, useMemo } from "react";
import { Card, CardTitle, Spinner } from "@/components/ui";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import { useStudentTermResult } from "@/hooks/use-marks";
import { useAuthStore } from "@/stores/auth-store";
import { BarChart3, Clock, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { WithheldNotice } from "@/components/finance/withheld-notice";

export default function StudentMarksPage() {
  const { user } = useAuthStore();
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);

  const [selectedTermChoice, setSelectedTerm] = useState("");
  // Derived during render rather than synced in an effect: the user's
  // explicit choice wins, otherwise fall back to the server default.
  const selectedTerm = selectedTermChoice || terms?.find((t: any) => t.isCurrent)?.id || "";

  const studentId = (user as any)?.studentId;
  const { data, isLoading } = useStudentTermResult(studentId, selectedTerm);
  const result = data?.result;
  const marks = data?.marks || [];
  /**
   * The school releases marks when it is ready to, which is not the moment a
   * teacher types them in. Until then the API withholds them and says so, and
   * this reads as a normal "not out yet" rather than an empty page that looks
   * like the marks were lost.
   */
  const notReleased = !!data && data.published === false;
  /**
   * Held over unpaid fees, which is a different thing from not released.
   *
   * Not released is the school still working; held is something the family
   * can act on. Answered as data rather than as a refusal precisely so this
   * page can say which it is and how much it would take.
   */
  const withheld = data?.withheld;

  // Group marks by subject
  const subjectMap = useMemo(() => {
    const map = new Map<string, { subject: string; assessments: any[]; average: number }>();
    for (const m of marks) {
      if (!map.has(m.subjectId)) {
        map.set(m.subjectId, { subject: m.subject?.name ?? "Subject", assessments: [], average: 0 });
      }
      const entry = map.get(m.subjectId)!;
      entry.assessments.push({
        type: m.assessmentType.name,
        score: m.score,
        maxScore: m.maxScore,
        pct: Math.round((m.score / m.maxScore) * 100),
      });
    }
    for (const [, val] of map) {
      const total = val.assessments.reduce((s: number, a: any) => s + a.pct, 0);
      val.average = val.assessments.length > 0 ? Math.round(total / val.assessments.length) : 0;
    }
    return Array.from(map.values());
  }, [marks]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Marks"
        description="View your academic performance"
        actions={
          <>
            <select
          value={selectedTerm}
          onChange={(e) => setSelectedTerm(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
         aria-label="Select term...">
          <option value="">Select term...</option>
          {terms?.map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.isCurrent ? "(Current)" : ""}
            </option>
          ))}
        </select>
          </>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : withheld ? (
        <WithheldNotice withheld={withheld} feesHref="/student/fees" what="marks" />
      ) : (
        <>
          {/* Summary Cards */}
          {result && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <p className="text-xs text-muted">Average</p>
                <p className="text-2xl font-bold text-primary">{result.average?.toFixed(1) || "-"}%</p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Grade</p>
                <p className="text-2xl font-bold text-foreground">{result.letterGrade || "-"}</p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Class Rank</p>
                <p className="text-2xl font-bold text-foreground">
                  {result.rank ? `#${result.rank}` : "-"}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Subjects</p>
                <p className="text-2xl font-bold text-foreground">{subjectMap.length}</p>
              </Card>
            </div>
          )}

          {/* Subject Breakdown */}
          {subjectMap.length > 0 ? (
            <Card>
              <CardTitle><BarChart3 className="mr-2 inline h-5 w-5" /> Subject Breakdown</CardTitle>
              <div className="mt-4 space-y-4">
                {subjectMap.map((s, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{s.subject}</span>
                      <span className="text-sm font-bold text-primary">{s.average}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/20">
                      <div
                        className={`h-2 rounded-full motion-bar ${
                          s.average >= 80
                            ? "bg-success"
                            : s.average >= 60
                            ? "bg-primary"
                            : s.average >= 50
                            ? "bg-warning"
                            : "bg-danger"
                        }`}
                        style={{ width: `${s.average}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {s.assessments.map((a: any, j: number) => (
                        <span key={j} className="text-xs text-muted">
                          {a.type}: {a.score}/{a.maxScore}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : notReleased ? (
            <Card>
              <div className="py-10 text-center">
                <Clock className="mx-auto mb-3 h-8 w-8 text-muted opacity-50" />
                <p className="font-medium text-foreground">
                  Your results for this term have not been released yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                  Your teachers may still be entering or checking marks. They
                  will appear here as soon as the school publishes them.
                </p>
              </div>
            </Card>
          ) : selectedTerm ? (
            <Card>
              <p className="text-center text-muted py-8">No marks found for this term.</p>
            </Card>
          ) : null}

          {/* Trend Chart (visual bar comparison) */}
          {subjectMap.length > 0 && (
            <Card>
              <CardTitle><TrendingUp className="mr-2 inline h-5 w-5" /> Performance Comparison</CardTitle>
              <div className="mt-4 flex items-end gap-3" style={{ height: "max(200px, 30vw)", maxHeight: "320px" }}>
                {subjectMap.map((s, i) => (
                  <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center">
                    <span className="mb-1 text-xs font-bold text-foreground">{s.average}%</span>
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-lg ${
                          s.average >= 80
                            ? "bg-success"
                            : s.average >= 60
                            ? "bg-primary"
                            : s.average >= 50
                            ? "bg-warning"
                            : "bg-danger"
                        }`}
                        style={{ height: `${s.average}%` }}
                      />
                    </div>
                    <span className="mt-1 text-xs text-muted truncate w-full text-center">{s.subject}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Comments */}
          {result && (result.teacherComment || result.headmasterComment) && (
            <Card>
              <CardTitle>Comments</CardTitle>
              {result.teacherComment && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted">Class Teacher</p>
                  <p className="text-sm text-foreground">{result.teacherComment}</p>
                </div>
              )}
              {result.headmasterComment && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted">Headmaster</p>
                  <p className="text-sm text-foreground">{result.headmasterComment}</p>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
