"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardTitle, PageSpinner } from "@/components/ui";
import { EChart } from "@/components/ui/echart";
import { TooltipGuide } from "@/components/ui/tooltip-guide";
import {
  useAdminDashboard,
  useAttendanceAnalytics,
  usePerformanceTrends,
} from "@/hooks/use-analytics";
import { useAcademicYears } from "@/hooks/use-academic";
import { viz, axisLabel, splitLine, tooltipStyle, legendStyle } from "@/lib/chart-theme";
import { useAttendanceDashboard } from "@/hooks/use-attendance";
import { useLibraryAnalytics } from "@/hooks/use-library";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  UserCheck,
  BookOpen,
  Calendar,
  Library,
  UserPlus,
  ClipboardList,
  BookMarked,
  PenLine,
  BarChart3,
} from "lucide-react";
import { toLocalDateString } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: dashboard, isLoading: loadingDashboard, isError: dashboardError, refetch: refetchDashboard } = useAdminDashboard();
  const { data: attendance, isLoading: loadingAttendance, isError: attendanceError, refetch: refetchAttendance } = useAttendanceDashboard(
    toLocalDateString(new Date())
  );
  const { data: library, isLoading: loadingLibrary, isError: libraryError, refetch: refetchLibrary } = useLibraryAnalytics();
  const { data: years } = useAcademicYears();
  const currentYearId = years?.find((y: any) => y.isCurrent)?.id ?? "";
  const { data: trends } = usePerformanceTrends(currentYearId);
  const { data: attendanceStats } = useAttendanceAnalytics();

  // Term-by-term school average: the one line that says how the year is going.
  const trendOption = useMemo<EChartsOption | null>(() => {
    const pts = (trends ?? []).filter((t: any) => t.studentCount > 0);
    if (pts.length < 2) return null;
    return {
      grid: { left: 40, right: 20, top: 20, bottom: 28 },
      xAxis: {
        type: "category",
        data: pts.map((t: any) => t.termName),
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: viz.grid } },
        axisLabel,
      },
      yAxis: { type: "value", min: 0, max: 100, axisLabel, splitLine },
      tooltip: {
        ...tooltipStyle,
        trigger: "axis",
        valueFormatter: (v: any) => `${Number(v).toFixed(1)}%`,
      },
      series: [
        {
          name: "School average",
          type: "line",
          data: pts.map((t: any) => t.averageScore),
          lineStyle: { color: viz.navy, width: 2.5 },
          itemStyle: { color: viz.navy, borderColor: "#fff", borderWidth: 2 },
          symbolSize: 9,
          label: {
            show: true,
            position: "top",
            color: viz.muted,
            fontSize: 11,
            formatter: (p: any) => `${Number(p.value).toFixed(1)}%`,
          },
          areaStyle: { color: "rgba(42,120,214,0.08)" },
        },
      ],
    };
  }, [trends]);

  // The last school days, present / late / absent stacked.
  const attendanceOption = useMemo<EChartsOption | null>(() => {
    // The last five school days, not the year. A full year of bars is 230
    // slivers a head teacher cannot read; this week is the thing they act on.
    const days = attendanceStats?.byDate?.slice(-5);
    if (!days?.length) return null;
    const label = (iso: string) =>
      new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    const bar = (name: string, color: string, key: string, top = false) => ({
      name,
      type: "bar" as const,
      stack: "att",
      barWidth: 14,
      itemStyle: {
        color,
        borderColor: "#fff",
        borderWidth: 1,
        ...(top ? { borderRadius: [3, 3, 0, 0] as [number, number, number, number] } : {}),
      },
      data: days.map((d: any) => d[key]),
    });
    return {
      grid: { left: 40, right: 12, top: 14, bottom: 50 },
      xAxis: {
        type: "category",
        data: days.map((d: any) => label(d.date)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: viz.grid } },
        axisLabel: { ...axisLabel, fontSize: 10 },
      },
      yAxis: { type: "value", axisLabel, splitLine },
      legend: { ...legendStyle, bottom: 0 },
      tooltip: { ...tooltipStyle, trigger: "axis", axisPointer: { type: "shadow" } },
      series: [
        bar("Present", viz.attendance.present, "present"),
        bar("Late", viz.attendance.late, "late"),
        bar("Absent", viz.attendance.absent, "absent", true),
      ],
    };
  }, [attendanceStats]);

  const isLoading = loadingDashboard && loadingAttendance && loadingLibrary;
  const isError = dashboardError || attendanceError || libraryError;

  if (isLoading) return <PageSpinner />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-lg font-semibold text-foreground">Something went wrong</p>
        <p className="mt-1 text-sm text-muted">We could not load the dashboard data.</p>
        <button
          onClick={() => { refetchDashboard(); refetchAttendance(); refetchLibrary(); }}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  /**
   * Today's attendance, as a percentage.
   *
   * The figures live under `overall` (see getDashboard in
   * backend/src/modules/attendance/attendance.service.ts). Reading
   * `attendance.totalStudents` and `attendance.presentCount` off the top level
   * meant this card read 0% every day of the year, on the screen a head
   * teacher looks at first.
   *
   * A late student is in school, so they count towards the rate; that is what
   * the server's own `rate` does, and it is used when it is there.
   */
  const attendanceRate = (() => {
    const overall = attendance?.overall;
    if (!overall) return 0;
    if (typeof overall.rate === "number") return Math.round(overall.rate);
    const total = overall.totalStudents ?? 0;
    if (total <= 0) return 0;
    return Math.round((((overall.present ?? 0) + (overall.late ?? 0)) / total) * 100);
  })();

  const statCards = [
    {
      label: "Total Students",
      value: dashboard?.totalStudents ?? "—",
      icon: GraduationCap,
      color: "text-primary bg-accent-light",
    },
    {
      label: "Total Teachers",
      value: dashboard?.totalTeachers ?? "—",
      icon: UserCheck,
      color: "text-success bg-success-wash",
    },
    {
      label: "Total Users",
      value: dashboard?.totalUsers ?? "—",
      icon: Users,
      color: "text-violet-600 bg-violet-50",
    },
    {
      label: "Subjects",
      value: dashboard?.totalSubjects ?? "—",
      icon: BookOpen,
      color: "text-warning bg-warning-wash",
    },
    {
      label: "Attendance Today",
      value: attendance?.overall ? `${attendanceRate}%` : "—",
      icon: Calendar,
      color: "text-cyan-600 bg-cyan-50",
    },
    {
      label: "Books on Loan",
      value: library?.activeLoans ?? "—",
      icon: Library,
      color: "text-warning bg-warning-wash",
    },
  ];

  const quickActions = [
    { label: "Add Student", href: "/admin/users", icon: UserPlus },
    { label: "Record Attendance", href: "/admin/attendance", icon: ClipboardList },
    { label: "Manage Library", href: "/admin/library", icon: BookMarked },
    { label: "Enter Marks", href: "/admin/marks", icon: PenLine },
  ];

  return (
    <div>
      <div className="mb-8">
        <PageHeader
          title={<>Welcome back, {user?.firstName}</>}
          description="Here&apos;s an overview of your school"
        />
      </div>

      <div data-guide="stat-cards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => (
          <Card key={card.label} padding="md" className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.color}`}
            >
              <card.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted">{card.label}</p>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {(trendOption || attendanceOption) && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
          {trendOption && (
            <Card>
              <CardTitle>The year so far</CardTitle>
              <p className="mt-0.5 text-sm text-muted">School average, term by term</p>
              <EChart option={trendOption} height={215} />
            </Card>
          )}
          {attendanceOption && (
            <Card>
              <CardTitle>The last five school days</CardTitle>
              <p className="mt-0.5 text-sm text-muted">Who was in, late or missing</p>
              <EChart option={attendanceOption} height={215} />
            </Card>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardTitle data-guide="quick-actions">Quick Actions</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/10"
              >
                <action.icon className="h-5 w-5 text-primary" />
                {action.label}
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle data-guide="at-a-glance" className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            At a Glance
          </CardTitle>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Attendance Rate (Today)</span>
              <span className="text-sm font-semibold text-foreground">
                {attendance?.overall ? `${attendanceRate}%` : "—"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-muted">
              <div
                className="h-2 rounded-full bg-cyan-500 motion-bar"
                style={{ width: `${attendanceRate}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Library: Active Loans</span>
              <span className="text-sm font-semibold text-foreground">
                {library?.activeLoans ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Library: Overdue</span>
              <span className="text-sm font-semibold text-foreground">
                {library?.overdueLoans ?? 0}
              </span>
            </div>
          </div>
        </Card>
      </div>
      <TooltipGuide
        id="admin-dashboard"
        steps={[
          {
            target: "[data-guide='stat-cards']",
            title: "School Overview",
            content: "These cards show real-time stats for your school — students, teachers, and attendance at a glance.",
          },
          {
            target: "[data-guide='quick-actions']",
            title: "Quick Actions",
            content: "Jump to common tasks like adding students, recording attendance, or entering marks.",
          },
          {
            target: "[data-guide='at-a-glance']",
            title: "Performance Snapshot",
            content: "Track attendance rates and library status in real time.",
          },
        ]}
      />
    </div>
  );
}
