"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardTitle, Badge, Spinner } from "@/components/ui";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import { useStudentTermResult } from "@/hooks/use-marks";
import { useAuthStore } from "@/stores/auth-store";
import { BarChart3, Users } from "lucide-react";
import api from "@/lib/api";

interface Child {
  id: string; // student ID
  name: string;
  className: string;
}

export default function ParentMarksPage() {
  const { user } = useAuthStore();
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");

  // Fetch linked children
  useEffect(() => {
    if (!user?.id) return;
    api
      .get(`/users/${user.id}`)
      .then((res) => {
        const links = res.data?.parentStudents || [];
        setChildren(
          links.map((ps: any) => ({
            id: ps.student.id,
            name: `${ps.student.user.firstName} ${ps.student.user.lastName}`,
            className: ps.student.classSection
              ? `${ps.student.classSection.classLevel?.name || ""} ${ps.student.classSection.name || ""}`
              : "",
          }))
        );
        if (links.length > 0) setSelectedChild(links[0].student.id);
      })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    const current = terms?.find((t: any) => t.isCurrent);
    if (current) setSelectedTerm(current.id);
  }, [terms]);

  const { data, isLoading } = useStudentTermResult(selectedChild, selectedTerm);
  const result = data?.result;
  const marks = data?.marks || [];

  const subjectMap = useMemo(() => {
    const map = new Map<string, { subject: string; assessments: any[]; average: number }>();
    for (const m of marks) {
      if (!map.has(m.subjectId)) {
        map.set(m.subjectId, { subject: m.subject.name, assessments: [], average: 0 });
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Child&apos;s Marks</h1>
          <p className="text-sm text-muted">View your child&apos;s academic performance</p>
        </div>
        <div className="flex gap-3">
          {children.length > 1 && (
            <select
              value={selectedChild}
              onChange={(e) => setSelectedChild(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.className})
                </option>
              ))}
            </select>
          )}
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Select term...</option>
            {terms?.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.isCurrent ? "(Current)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Child info card */}
      {children.length > 0 && (
        <Card>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                {children.find((c) => c.id === selectedChild)?.name}
              </p>
              <p className="text-xs text-muted">
                {children.find((c) => c.id === selectedChild)?.className}
              </p>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* Summary */}
          {result && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <p className="text-xs text-muted">Average</p>
                <p className="text-2xl font-bold text-primary">{result.average?.toFixed(1) || "—"}%</p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Grade</p>
                <p className="text-2xl font-bold text-foreground">{result.letterGrade || "—"}</p>
              </Card>
              <Card>
                <p className="text-xs text-muted">Class Rank</p>
                <p className="text-2xl font-bold text-foreground">
                  {result.rank ? `#${result.rank}` : "—"}
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
                        className={`h-2 rounded-full transition-all ${
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
                    <div className="mt-1 flex gap-2">
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
          ) : selectedTerm ? (
            <Card>
              <p className="text-center text-muted py-8">No marks found for this term.</p>
            </Card>
          ) : null}

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
