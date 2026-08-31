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
import { viz } from "@/lib/chart-theme";
import { useChartTheme } from "@/hooks/use-chart-theme";
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
  /* One object rather than four destructured values: it is memoised on
     the resolved theme, so the option builders below take a single
     stable dependency instead of four the compiler cannot track. */
  const chart = useChartTheme();
  const user = useAuthStore((s) => s.user);
  const { data: dashboard, isLoading: loadingDashboard, isError: dashboardError, refetch: refetchDashboard } = useAdminDashboard();
  /*
    The register itself is the DOS's and the guard refuses it to a principal,
    which is the rule this dashboard used to break: one 403 on
    /attendance/dashboard blanked the whole page, on the screen the principal
    opens first. The school-wide rate comes from the admin analytics endpoint
    instead, which is theirs and already loaded for the chart below.
  */
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
        axisLabel: chart.axisLabel,
      },
      yAxis: { type: "value", min: 0, max: 100, axisLabel: chart.axisLabel, splitLine: chart.splitLine },
      tooltip: {
        ...chart.tooltipStyle,
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
  }, [trends, chart]);

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
        axisLabel: { ...chart.axisLabel, fontSize: 10 },
      },
      yAxis: { type: "value", axisLabel: chart.axisLabel, splitLine: chart.splitLine },
      legend: { ...chart.legendStyle, bottom: 0 },
      tooltip: { ...chart.tooltipStyle, trigger: "axis", axisPointer: { type: "shadow" } },
      series: [
        bar("Present", viz.attendance.present, "present"),
        bar("Late", viz.attendance.late, "late"),
        bar("Absent", viz.attendance.absent, "absent", true),
      ],
    };
  }, [attendanceStats, chart]);

  const isLoading = loadingDashboard && loadingLibrary;
  /* Only the dashboard call itself blanks the page. A library or analytics
     panel that fails is one missing card, not a reason to hide the eleven
     that loaded - which is what "Something went wrong" used to do. */
  const isError = dashboardError;

  if (isLoading) return <PageSpinner />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-lg font-semibold text-foreground">Something went wrong</p>
        <p className="mt-1 text-sm text-muted">We could not load the dashboard data.</p>
        <button
          onClick={() => { refetchDashboard(); refetchLibrary(); }}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  /**
   * The school's attendance, as a percentage.
   *
   * Read off the admin analytics endpoint, which is the principal's, rather
   * than the register, which is not: the DOS runs academic delivery and the
   * guard enforces it. A late student is in school, so they count towards the
   * rate, and that is what the server's own figure already does.
   */
  const attendanceRate =
    typeof attendanceStats?.attendanceRate === "number"
      ? Math.round(attendanceStats.attendanceRate)
      : null;

  const statCards = [
    {
      label: "Total Students",
      value: dashboard?.totalStudents ?? "-",
      icon: GraduationCap,
      color: "text-primary bg-accent-light",
    },
    {
      label: "Total Teachers",
      value: dashboard?.totalTeachers ?? "-",
      icon: UserCheck,
      color: "text-success bg-success-wash",
    },
    {
      label: "Total Users",
      value: dashboard?.totalUsers ?? "-",
      icon: Users,
      color: "text-info bg-info-wash",
    },
    {
      label: "Subjects",
      value: dashboard?.totalSubjects ?? "-",
      icon: BookOpen,
      color: "text-warning bg-warning-wash",
    },
    {
      label: "Attendance Today",
      value: attendanceRate === null ? "-" : `${attendanceRate}%`,
      icon: Calendar,
      color: "text-primary bg-accent-light",
    },
    {
      label: "Books on Loan",
      value: library?.activeLoans ?? "-",
      icon: Library,
      color: "text-warning bg-warning-wash",
    },
  ];

  const quickActions = [
    /* Four things the principal can actually do. "Record Attendance" and
       "Enter Marks" were here, and both are the DOS's: the shell bounced the
       principal straight back, so the dashboard's own shortcuts were two
       dead ends. */
    { label: "Add Student", href: "/admin/users", icon: UserPlus },
    { label: "Admissions", href: "/admin/admissions", icon: ClipboardList },
    { label: "Manage Library", href: "/admin/library", icon: BookMarked },
    { label: "School Fees", href: "/admin/finance", icon: PenLine },
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
                {attendanceRate === null ? "-" : `${attendanceRate}%`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-muted">
              <div
                className="h-2 rounded-full bg-primary motion-bar"
                style={{ width: `${attendanceRate}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Library: books out</span>
              <span className="text-sm font-semibold text-foreground">
                {library?.activeLoans ?? "-"}
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
            content: "These cards show real-time stats for your school - students, teachers, and attendance at a glance.",
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
