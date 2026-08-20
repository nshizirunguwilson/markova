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
import { Card, CardTitle } from "@/components/ui";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import {
  useAdminDashboard,
  usePerformanceTrends,
  useClassComparisons,
  useDisciplineStats,
  useLibraryAnalytics,
  useAttendanceAnalytics,
} from "@/hooks/use-analytics";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Users, GraduationCap, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CHART_COLOR, CHART_SERIES } from "@/lib/chart-colors";

const COLORS = CHART_SERIES;

export default function AdminAnalyticsPage() {
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: dashboard } = useAdminDashboard(yearId || undefined, termId || undefined);
  const { data: trends } = usePerformanceTrends(yearId);
  const { data: classComp } = useClassComparisons(termId);
  const { data: discipline } = useDisciplineStats(yearId || undefined);
  const { data: library } = useLibraryAnalytics();
  const { data: attendance } = useAttendanceAnalytics(termId || undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics Dashboard"
      />

      <div className="flex gap-4">
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }} aria-label="All Years">
          <option value="">All Years</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="All Terms">
          <option value="">All Terms</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Overview Cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-accent rounded-lg"><GraduationCap className="w-5 h-5 text-primary" /></div>
            <div><p className="text-sm text-muted">Students</p><p className="text-xl font-bold">{dashboard.totalStudents}</p></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-accent rounded-lg"><Users className="w-5 h-5 text-primary" /></div>
            <div><p className="text-sm text-muted">Teachers</p><p className="text-xl font-bold">{dashboard.totalTeachers}</p></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-accent rounded-lg"><Users className="w-5 h-5 text-primary-light" /></div>
            <div><p className="text-sm text-muted">Parents</p><p className="text-xl font-bold">{dashboard.totalParents}</p></div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 bg-accent rounded-lg"><BookOpen className="w-5 h-5 text-primary" /></div>
            <div><p className="text-sm text-muted">Classes</p><p className="text-xl font-bold">{dashboard.totalClasses}</p></div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Trends */}
        {trends && trends.length > 0 && (
          <Card className="p-6">
            <CardTitle>Performance Trends</CardTitle>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="termName" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line isAnimationActive={false} type="monotone" dataKey="averageScore" stroke={CHART_COLOR.brand} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Class Comparisons */}
        {classComp && classComp.length > 0 && (
          <Card className="p-6">
            <CardTitle>Class Comparisons</CardTitle>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classComp}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="className" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar isAnimationActive={false} dataKey="averageScore" fill={CHART_COLOR.brandLight} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Attendance Stats */}
        {attendance && (
          <Card className="p-6">
            <CardTitle>Attendance Overview</CardTitle>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie isAnimationActive={false}
                    data={[
                      { name: "Present", value: attendance.present },
                      { name: "Absent", value: attendance.absent },
                      { name: "Late", value: attendance.late },
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    <Cell fill={CHART_COLOR.brandLight} />
                    <Cell fill={CHART_COLOR.danger} />
                    <Cell fill={CHART_COLOR.warning} />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-center text-sm text-muted mt-2">
              Attendance Rate: <span className="font-bold text-primary">{attendance.attendanceRate}%</span>
            </p>
          </Card>
        )}

        {/* Discipline Stats */}
        {discipline && (
          <Card className="p-6">
            <CardTitle>Discipline ({discipline.totalIncidents} incidents)</CardTitle>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={discipline.byAction}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar isAnimationActive={false} dataKey="count" fill={CHART_COLOR.danger} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Library Stats */}
        {library && (
          <Card className="p-6">
            <CardTitle>Library Usage</CardTitle>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{library.totalBooks}</p>
                <p className="text-sm text-muted">Total Books</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary-light">{library.activeLoans}</p>
                <p className="text-sm text-muted">Active Loans</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-danger">{library.overdueLoans}</p>
                <p className="text-sm text-muted">Overdue</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{library.totalLoans}</p>
                <p className="text-sm text-muted">Total Loans</p>
              </div>
            </div>
            {library.popularBooks?.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-foreground-muted mb-2">Popular Books</p>
                {library.popularBooks.slice(0, 5).map((b: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b">
                    <span>{b.title}</span>
                    <span className="text-muted">{b.loanCount} loans</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
