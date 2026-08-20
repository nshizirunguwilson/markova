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


import { useState, useEffect } from "react";
import { Card, CardTitle, Spinner } from "@/components/ui";
import { useAcademicYears } from "@/hooks/use-academic";
import { useParentChildTrends } from "@/hooks/use-analytics";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CHART_COLOR } from "@/lib/chart-colors";

interface Child { id: string; name: string; }

export default function ParentAnalyticsPage() {
  const { user } = useAuthStore();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [yearId, setYearId] = useState("");

  const { data: years } = useAcademicYears();
  const { data, isLoading } = useParentChildTrends(selectedChild, yearId);

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
        title="Child Performance Trends"
      />

      <div className="flex gap-4 flex-wrap">
        {children.length > 1 && (
          <select className="border rounded-lg px-3 py-2 text-sm" value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)} aria-label="Select child">
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label="Select Year">
          <option value="">Select Year</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center py-8"><Spinner /></div>}

      {data && (
        <>
          {/* Attendance Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-foreground-muted">Total Days</p>
              <p className="text-xl font-bold text-primary">{data.attendance?.totalDays}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-foreground-muted">Present</p>
              <p className="text-xl font-bold text-success">{data.attendance?.presentDays}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-foreground-muted">Absent</p>
              <p className="text-xl font-bold text-danger">{data.attendance?.absentDays}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-foreground-muted">Attendance Rate</p>
              <p className="text-xl font-bold text-primary-light">{data.attendance?.rate}%</p>
            </Card>
          </div>

          {/* Performance Trend */}
          {data.performanceTrends?.length > 0 && (
            <Card className="p-6">
              <CardTitle>Performance Across Terms</CardTitle>
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.performanceTrends.filter((t: any) => t.average !== null)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="termName" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line isAnimationActive={false} type="monotone" dataKey="average" stroke={CHART_COLOR.brand} strokeWidth={2} dot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Term-by-term breakdown */}
          <Card className="p-6">
            <CardTitle>Term Results</CardTitle>
            <div className="mt-4 space-y-2">
              {data.performanceTrends?.map((t: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium">{t.termName}</span>
                  <div className="flex gap-4 text-sm">
                    <span>{t.average !== null ? `${t.average}%` : "—"}</span>
                    <span className="text-primary">{t.letterGrade ?? "—"}</span>
                    <span className="text-muted">Rank: {t.rank ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {!isLoading && !data && yearId && selectedChild && (
        <Card className="p-8 text-center text-muted">
          <TrendingUp className="w-12 h-12 mx-auto mb-2 text-border-strong" />
          No trend data available
        </Card>
      )}
    </div>
  );
}
