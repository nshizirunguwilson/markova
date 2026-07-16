"use client";

import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Card, CardTitle } from "@/components/ui";
import { EChart } from "@/components/ui/echart";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import {
  useAdminDashboard,
  useClassComparisons,
  useDisciplineStats,
  useLibraryAnalytics,
  useAttendanceAnalytics,
  useGradeDistribution,
  useEnrollment,
} from "@/hooks/use-analytics";
import { viz, axisLabel, splitLine, tooltipStyle, legendStyle } from "@/lib/chart-theme";
import { Users, GraduationCap, BookOpen, School } from "lucide-react";

const GRADES = ["A", "B", "C", "D", "E", "S", "F"];

const humanize = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });

export default function AdminAnalyticsPage() {
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);

  // Land on the current year and term so every chart has data immediately.
  useEffect(() => {
    if (!yearId && years?.length) {
      setYearId((years.find((y: any) => y.isCurrent) ?? years[0]).id);
    }
  }, [years, yearId]);
  useEffect(() => {
    if (!termId && terms?.length) {
      setTermId((terms.find((t: any) => t.isCurrent) ?? terms[0]).id);
    }
  }, [terms, termId]);

  const { data: dashboard } = useAdminDashboard(yearId || undefined, termId || undefined);
  const { data: classComp } = useClassComparisons(termId);
  const { data: gradeDist } = useGradeDistribution(termId || undefined);
  const { data: enrollment } = useEnrollment();
  const { data: attendance } = useAttendanceAnalytics(termId || undefined);
  const { data: discipline } = useDisciplineStats(yearId || undefined);
  const { data: library } = useLibraryAnalytics();

  // ── Where every class stands: floating range bar + average dot ─────────────
  const classOption = useMemo<EChartsOption | null>(() => {
    if (!classComp?.length) return null;
    const rows = [...classComp].sort((a: any, b: any) => b.averageScore - a.averageScore);
    const names = rows.map((r: any) => r.className);
    const byName = new Map(rows.map((r: any) => [r.className, r]));
    const schoolAvg =
      rows.reduce((s: number, r: any) => s + r.averageScore * r.studentCount, 0) /
      rows.reduce((s: number, r: any) => s + r.studentCount, 0);

    return {
      grid: { left: 118, right: 36, top: 14, bottom: 54 },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { ...axisLabel, formatter: "{value}%" },
        splitLine,
      },
      yAxis: {
        type: "category",
        data: names,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...axisLabel, fontSize: 11.5 },
      },
      legend: { ...legendStyle, bottom: 0, data: ["Lowest to highest", "Class average"] },
      tooltip: {
        ...tooltipStyle,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any) => {
          const name = Array.isArray(params) ? params[0]?.name : params?.name;
          const r: any = byName.get(name);
          if (!r) return "";
          return [
            `<b>${r.className}</b> · ${r.studentCount} students`,
            `Average <b>${r.averageScore.toFixed(1)}%</b>`,
            `Range ${r.lowest.toFixed(0)}% – ${r.highest.toFixed(0)}%`,
          ].join("<br/>");
        },
      },
      series: [
        {
          name: "base",
          type: "bar",
          stack: "range",
          silent: true,
          barWidth: 9,
          itemStyle: { color: "transparent" },
          data: rows.map((r: any) => r.lowest),
        },
        {
          name: "Lowest to highest",
          type: "bar",
          stack: "range",
          barWidth: 9,
          itemStyle: { color: viz.band, borderRadius: 5 },
          data: rows.map((r: any) => r.highest - r.lowest),
        },
        {
          name: "Class average",
          type: "scatter",
          symbolSize: 11,
          itemStyle: { color: viz.navy, borderColor: "#fff", borderWidth: 2 },
          data: rows.map((r: any) => r.averageScore),
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: viz.muted, type: "dashed", width: 1 },
            label: {
              position: "insideEndTop",
              color: viz.muted,
              fontSize: 11,
              formatter: `School avg ${schoolAvg.toFixed(1)}%`,
            },
            data: [{ xAxis: Math.round(schoolAvg * 10) / 10 }],
          },
        },
      ],
    };
  }, [classComp]);

  // ── How grades spread: level × letter heatmap on the sequential ramp ───────
  const gradeOption = useMemo<EChartsOption | null>(() => {
    if (!gradeDist?.length) return null;
    const levels = gradeDist.map((g: any) => g.level);
    const cells: [number, number, number][] = [];
    let maxPct = 0;
    gradeDist.forEach((g: any, y: number) => {
      GRADES.forEach((letter, x) => {
        const count = g.counts[letter] ?? 0;
        const pct = g.total ? (count / g.total) * 100 : 0;
        maxPct = Math.max(maxPct, pct);
        cells.push([x, y, Math.round(pct * 10) / 10]);
      });
    });
    const countFor = (x: number, y: number) =>
      gradeDist[y]?.counts[GRADES[x]] ?? 0;

    return {
      grid: { left: 74, right: 16, top: 10, bottom: 66 },
      xAxis: {
        type: "category",
        data: GRADES,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...axisLabel, fontSize: 12, fontWeight: 600 },
      },
      yAxis: {
        type: "category",
        data: levels,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel,
      },
      visualMap: {
        min: 0,
        max: Math.max(maxPct, 1),
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemHeight: 90,
        text: ["more of the level", "none"],
        textStyle: { color: viz.muted, fontSize: 10.5 },
        inRange: { color: [...viz.blueRamp] },
      },
      tooltip: {
        ...tooltipStyle,
        formatter: (p: any) => {
          const [x, y, pct] = p.data;
          return `<b>${levels[y]}</b> · Grade ${GRADES[x]}<br/>${countFor(x, y)} students (${pct}%)`;
        },
      },
      series: [
        {
          type: "heatmap",
          data: cells,
          itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 },
          label: {
            show: true,
            fontSize: 10,
            color: viz.ink,
            formatter: (p: any) => {
              const c = countFor(p.data[0], p.data[1]);
              return c > 0 ? String(c) : "";
            },
          },
          emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgb(16 24 40 / 0.25)" } },
        },
      ],
    };
  }, [gradeDist]);

  // ── Who the school holds: enrollment pyramid by level and gender ───────────
  const enrollmentOption = useMemo<EChartsOption | null>(() => {
    if (!enrollment?.length) return null;
    const levels = enrollment.map((e: any) => e.level);
    const maxSide = Math.max(
      ...enrollment.map((e: any) => Math.max(e.male, e.female)),
    );
    return {
      grid: { left: 70, right: 30, top: 12, bottom: 44 },
      xAxis: {
        type: "value",
        min: -maxSide * 1.25,
        max: maxSide * 1.25,
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "category",
        data: levels,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel,
      },
      legend: { ...legendStyle, bottom: 0, data: ["Boys", "Girls"] },
      tooltip: {
        ...tooltipStyle,
        formatter: (p: any) =>
          `<b>${p.name}</b><br/>${p.seriesName}: ${Math.abs(p.value)}`,
      },
      series: [
        {
          name: "Boys",
          type: "bar",
          stack: "pyramid",
          barWidth: 16,
          itemStyle: { color: viz.gender.male, borderRadius: [8, 0, 0, 8] },
          label: {
            show: true,
            position: "left",
            color: viz.muted,
            fontSize: 11,
            formatter: (p: any) => String(Math.abs(p.value as number)),
          },
          data: enrollment.map((e: any) => -e.male),
        },
        {
          name: "Girls",
          type: "bar",
          stack: "pyramid",
          barWidth: 16,
          itemStyle: { color: viz.gender.female, borderRadius: [0, 8, 8, 0] },
          label: { show: true, position: "right", color: viz.muted, fontSize: 11 },
          data: enrollment.map((e: any) => e.female),
        },
      ],
    };
  }, [enrollment]);

  // ── School days: attendance stacked by day ─────────────────────────────────
  const attendanceOption = useMemo<EChartsOption | null>(() => {
    if (!attendance?.byDate?.length) return null;
    const days = attendance.byDate;
    return {
      grid: { left: 44, right: 16, top: 14, bottom: 52 },
      xAxis: {
        type: "category",
        data: days.map((d: any) => shortDate(d.date)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: viz.grid } },
        axisLabel,
      },
      yAxis: { type: "value", axisLabel, splitLine },
      legend: { ...legendStyle, bottom: 0 },
      tooltip: { ...tooltipStyle, trigger: "axis", axisPointer: { type: "shadow" } },
      series: [
        {
          name: "Present",
          type: "bar",
          stack: "att",
          barWidth: 16,
          itemStyle: { color: viz.attendance.present, borderColor: "#fff", borderWidth: 1 },
          data: days.map((d: any) => d.present),
        },
        {
          name: "Late",
          type: "bar",
          stack: "att",
          barWidth: 16,
          itemStyle: { color: viz.attendance.late, borderColor: "#fff", borderWidth: 1 },
          data: days.map((d: any) => d.late),
        },
        {
          name: "Absent",
          type: "bar",
          stack: "att",
          barWidth: 16,
          itemStyle: {
            color: viz.attendance.absent,
            borderColor: "#fff",
            borderWidth: 1,
            borderRadius: [3, 3, 0, 0],
          },
          data: days.map((d: any) => d.absent),
        },
      ],
    };
  }, [attendance]);

  // ── Discipline actions ──────────────────────────────────────────────────────
  const disciplineOption = useMemo<EChartsOption | null>(() => {
    if (!discipline?.byAction?.length) return null;
    const rows = [...discipline.byAction].sort((a: any, b: any) => b.count - a.count);
    return {
      grid: { left: 120, right: 40, top: 10, bottom: 8 },
      xAxis: { type: "value", axisLabel, splitLine },
      yAxis: {
        type: "category",
        data: rows.map((r: any) => humanize(r.name)),
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel,
      },
      tooltip: { ...tooltipStyle },
      series: [
        {
          type: "bar",
          barWidth: 12,
          itemStyle: { color: viz.navy, borderRadius: 6 },
          label: { show: true, position: "right", color: viz.muted, fontSize: 11 },
          data: rows.map((r: any) => r.count),
        },
      ],
    };
  }, [discipline]);

  // ── Library favourites ──────────────────────────────────────────────────────
  const booksOption = useMemo<EChartsOption | null>(() => {
    if (!library?.popularBooks?.length) return null;
    const rows = library.popularBooks.slice(0, 8);
    return {
      grid: { left: 170, right: 40, top: 10, bottom: 8 },
      xAxis: { type: "value", axisLabel, splitLine, minInterval: 1 },
      yAxis: {
        type: "category",
        data: rows.map((b: any) => b.title),
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...axisLabel, width: 155, overflow: "truncate" as const },
      },
      tooltip: {
        ...tooltipStyle,
        formatter: (p: any) =>
          `<b>${rows[p.dataIndex].title}</b><br/>${rows[p.dataIndex].author ?? ""}<br/>${p.value} loans`,
      },
      series: [
        {
          type: "bar",
          barWidth: 12,
          itemStyle: { color: viz.series[0], borderRadius: 6 },
          label: { show: true, position: "right", color: viz.muted, fontSize: 11 },
          data: rows.map((b: any) => b.loanCount),
        },
      ],
    };
  }, [library]);

  const tiles = dashboard
    ? [
        { label: "Students", value: dashboard.totalStudents, icon: GraduationCap },
        { label: "Teachers", value: dashboard.totalTeachers, icon: Users },
        { label: "Parents", value: dashboard.totalParents, icon: Users },
        { label: "Year levels", value: dashboard.totalClasses, icon: School },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-muted">How the school is doing, at a glance</p>
        </div>
        <div className="flex gap-3">
          <select
            className="rounded-lg border border-border px-3 py-2 text-sm"
            value={yearId}
            onChange={(e) => { setYearId(e.target.value); setTermId(""); }}
          >
            {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <select
            className="rounded-lg border border-border px-3 py-2 text-sm"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
          >
            {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label} className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-accent p-2">
                <t.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted">{t.label}</p>
                <p className="text-xl font-bold tabular-nums">{t.value}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {classOption && (
        <Card className="p-6">
          <CardTitle>Where every class stands</CardTitle>
          <p className="mt-0.5 text-sm text-muted">
            The band is the spread from the weakest to the strongest student; the dot is the class average.
          </p>
          <div className="mt-2">
            <EChart option={classOption} height={(classComp?.length ?? 0) * 25 + 92} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {gradeOption && (
          <Card className="p-6">
            <CardTitle>How grades spread across levels</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              Each cell counts students on that grade; darker means a bigger share of the level.
            </p>
            <EChart option={gradeOption} height={320} />
          </Card>
        )}

        {enrollmentOption && (
          <Card className="p-6">
            <CardTitle>Who the school holds</CardTitle>
            <p className="mt-0.5 text-sm text-muted">Enrolled students per level, boys and girls side by side.</p>
            <EChart option={enrollmentOption} height={320} />
          </Card>
        )}

        {attendanceOption && (
          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <CardTitle>School days, day by day</CardTitle>
              {attendance && (
                <span className="text-sm text-muted">
                  rate <span className="font-semibold text-primary">{attendance.attendanceRate}%</span>
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">Attendance across the last school days.</p>
            <EChart option={attendanceOption} height={300} />
          </Card>
        )}

        {disciplineOption && (
          <Card className="p-6">
            <CardTitle>Discipline ({discipline.totalIncidents} incidents)</CardTitle>
            <p className="mt-0.5 text-sm text-muted">Actions taken this year, most frequent first.</p>
            <EChart option={disciplineOption} height={280} />
          </Card>
        )}

        {booksOption && (
          <Card className="p-6 lg:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle>What the library lends</CardTitle>
              {library && (
                <span className="text-sm text-muted">
                  {library.totalBooks} titles · {library.activeLoans} out ·{" "}
                  <span className={library.overdueLoans ? "font-semibold text-danger" : ""}>
                    {library.overdueLoans} overdue
                  </span>
                </span>
              )}
            </div>
            <EChart option={booksOption} height={300} />
          </Card>
        )}
      </div>
    </div>
  );
}
