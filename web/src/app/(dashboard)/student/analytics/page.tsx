"use client";

// Charts are opted out of the React Compiler and of Recharts' own animation.
//
// 1. "use no memo": Recharts discovers its series by walking and cloning its
//    children; the compiler's memoization stops the series from registering, so
//    the axes and grid render while nothing is actually plotted.
// 2. isAnimationActive={false}: the series shapes are emitted by a
//    requestAnimationFrame animation that did not reliably run here, leaving
//    empty shape groups in the DOM. A dashboard that refetches should not
//    replay its animations on every update anyway.
//
// Both were confirmed in a browser: the bar paths go from absent to drawn.
"use no memo";


import { useState } from "react";
import { Card, CardTitle, Spinner } from "@/components/ui";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import { useStudentAnalytics } from "@/hooks/use-analytics";
import { useAuthStore } from "@/stores/auth-store";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CHART_COLOR } from "@/lib/chart-colors";

export default function StudentAnalyticsPage() {
  const { user } = useAuthStore();
  const studentId = (user as any)?.studentId || "";
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data, isLoading } = useStudentAnalytics(studentId, termId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Performance"
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

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-accent">
              <p className="text-xs text-foreground-muted">My Average</p>
              <p className="text-2xl font-bold text-primary">{data.studentAverage}%</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-foreground-muted">Class Average</p>
              <p className="text-2xl font-bold text-primary-light">{data.classAverage}%</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-foreground-muted">Rank</p>
              <p className="text-2xl font-bold text-primary">{data.rank ?? "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-foreground-muted">Total Students</p>
              <p className="text-2xl font-bold text-foreground-muted">{data.totalStudents}</p>
            </Card>
          </div>

          {data.subjects?.length > 0 && (
            <Card className="p-6">
              <CardTitle>Subject Scores vs Class Average</CardTitle>
              <div className="h-72 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.subjects}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="subjectName" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="average" fill={CHART_COLOR.brand} name="My Score" />
                    <ReferenceLine y={data.classAverage} stroke={CHART_COLOR.danger} strokeDasharray="3 3" label="Class Avg" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}

      {!isLoading && !data && termId && (
        <Card className="p-8 text-center text-muted">
          <TrendingUp className="w-12 h-12 mx-auto mb-2 text-border-strong" />
          No analytics data available for this term
        </Card>
      )}
    </div>
  );
}
