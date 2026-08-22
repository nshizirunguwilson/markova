"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { Card, CardTitle, Badge, Avatar, PageSpinner } from "@/components/ui";
import { EChart } from "@/components/ui/echart";
import { useStudentProfile } from "@/hooks/use-analytics";
import { viz, axisLabel, splitLine, tooltipStyle, legendStyle } from "@/lib/chart-theme";
import { ShieldCheck } from "lucide-react";

/**
 * Shared across the admin student page, the student portal and the parent
 * portal. Answers a parent-teacher meeting's questions in reading order:
 * who is this → how are they doing right now → are they improving →
 * where are they strong or weak → how did every subject move over the year.
 */
// "Term 1" → "T1"; the first term of each year carries the year underneath.
function termAxis(terms: any[]) {
  const labels: string[] = [];
  const yearSpans: { from: number; to: number; year: string }[] = [];
  terms.forEach((t: any, i: number) => {
    const short = (t.termName || "").replace("Term ", "T");
    const prevYear = i > 0 ? terms[i - 1].yearName : null;
    if (t.yearName && t.yearName !== prevYear) {
      labels.push(`${short}\n${t.yearName}`);
      yearSpans.push({ from: i, to: i, year: t.yearName });
    } else {
      labels.push(short);
      if (yearSpans.length) yearSpans[yearSpans.length - 1].to = i;
    }
  });
  return { labels, yearSpans };
}

export function StudentPerformance({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentProfile(studentId);

  const terms = data?.terms ?? [];
  const latest = terms.length ? terms[terms.length - 1] : null;

  // ── Are they improving? Student vs class, term by term ─────────────────────
  const trajectoryOption = useMemo<EChartsOption | null>(() => {
    if (terms.length < 2) return null;
    const { labels, yearSpans } = termAxis(terms);
    return {
      grid: { left: 44, right: 24, top: 26, bottom: 62 },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: viz.grid } },
        axisLabel: { ...axisLabel, interval: 0, lineHeight: 15 },
      },
      yAxis: { type: "value", min: 0, max: 100, axisLabel, splitLine },
      legend: { ...legendStyle, bottom: 0 },
      tooltip: {
        ...tooltipStyle,
        trigger: "axis",
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params];
            // ECharts calls this for anything under the pointer, including an empty
            // axis position. A tooltip must never be able to take its chart down.
            const t = terms[list[0]?.dataIndex ?? -1];
            if (!t) return "";
            const head = `<b>${t.termName ?? ""}</b> · ${t.yearName ?? ""}${t.className ? `<br/>${t.className}` : ""}`;
          const rows = list
            .map(
              (p: any) =>
                `${p.marker} ${p.seriesName}: <b>${p.value == null ? "–" : Number(p.value).toFixed(1) + "%"}</b>`,
            )
            .join("<br/>");
          return `${head}<br/>${rows}`;
        },
      },
      series: [
        {
          name: data.student.name.split(" ")[0],
          type: "line",
          data: terms.map((t: any) => t.average),
          lineStyle: { color: viz.navy, width: 2.5 },
          itemStyle: { color: viz.navy, borderColor: "#fff", borderWidth: 2 },
          symbolSize: 10,
          label: {
            show: true,
            position: "top",
            color: viz.muted,
            fontSize: 11,
            formatter: (p: any) => `${(Number(p?.value) || 0).toFixed(1)}%`,
          },
        },
        {
          name: "Class average",
          type: "line",
          data: terms.map((t: any) => t.classAverage),
          lineStyle: { color: viz.muted, width: 1.5, type: "dashed" },
          itemStyle: { color: viz.muted },
          symbolSize: 6,
          // Every second school year gets a faint wash so the eye can group
          // the terms without any extra chrome.
          markArea: {
            silent: true,
            itemStyle: { color: "rgba(42,120,214,0.045)" },
            data: yearSpans
              .filter((_, i) => i % 2 === 1)
              .map((s2) => [{ xAxis: s2.from }, { xAxis: s2.to }]) as any,
          },
        },
      ],
    };
  }, [terms, data]);

  // ── Where are they strong or weak, this term ────────────────────────────────
  const subjectsOption = useMemo<EChartsOption | null>(() => {
    if (!latest?.subjects?.length) return null;
    const rows = latest.subjects;
    return {
      grid: { left: 150, right: 84, top: 8, bottom: 30 },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { ...axisLabel, formatter: "{value}%" },
        splitLine,
      },
      yAxis: {
        type: "category",
        data: rows.map((s: any) => s?.name),
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...axisLabel, width: 140, overflow: "truncate" as const },
      },
      tooltip: {
        ...tooltipStyle,
        formatter: (p: any) => {
          const s = rows[p?.dataIndex ?? -1];
          if (!s) return "";
          return `<b>${s.name}</b><br/>${s.total}% · Grade ${s.grade} (${s.points} points)`;
        },
      },
      series: [
        {
          type: "bar",
          barWidth: 11,
          data: rows.map((s: any) => ({
            value: s?.total,
            itemStyle: {
              color: (s?.total ?? 0) >= 50 ? viz.navy : viz.attendance.absent,
              borderRadius: 6,
            },
          })),
          label: {
            show: true,
            position: "right",
            color: viz.muted,
            fontSize: 11,
            formatter: (p: any) => {
              const s = rows[p?.dataIndex ?? -1];
              return s ? `${s.total}%  ${s.grade}` : "";
            },
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: viz.muted, type: "dashed", width: 1 },
            label: { color: viz.muted, fontSize: 10.5, formatter: "pass 50%" },
            data: [{ xAxis: 50 }],
          },
        },
      ],
    };
  }, [latest]);

  // ── How every subject moved across the year ────────────────────────────────
  const heatmapOption = useMemo<EChartsOption | null>(() => {
    if (terms.length < 2) return null;
    // Order subjects by their latest total so the strongest sit on top.
    const order = new Map<string, number>();
    latest?.subjects?.forEach((s: any, i: number) => order.set(s?.name, i));
    const subjects = ([
      ...new Set(terms.flatMap((t: any) => t.subjects.map((s: any) => s?.name))),
    ] as string[]).sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));

    const cells: [number, number, number][] = [];
    const gradeAt = new Map<string, string>();
    terms.forEach((t: any, x: number) => {
      for (const s of t.subjects) {
        const y = subjects.indexOf(s?.name);
        if (y === -1 || s?.total == null) continue;
        cells.push([x, y, s?.total]);
        gradeAt.set(`${x}|${y}`, s?.grade);
      }
    });

    return {
      grid: { left: 150, right: 16, top: 10, bottom: 62 },
      xAxis: {
        type: "category",
        data: termAxis(terms).labels,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...axisLabel, fontWeight: 600, interval: 0, lineHeight: 15 },
      },
      yAxis: {
        type: "category",
        data: subjects,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...axisLabel, width: 140, overflow: "truncate" as const },
      },
      visualMap: {
        min: 20,
        max: 100,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemHeight: 90,
        text: ["strong", "weak"],
        textStyle: { color: viz.muted, fontSize: 10.5 },
        inRange: { color: [...viz.blueRamp] },
      },
      tooltip: {
        ...tooltipStyle,
        formatter: (p: any) => {
            // A heatmap cell the pointer grazes between rows arrives with no data.
            const cell = p?.data?.value ?? p?.data;
            const [x, y, v] = Array.isArray(cell) ? cell : [];
            if (x === undefined || y === undefined || !terms[x]) return "";
            return `<b>${subjects[y] ?? ""}</b> · ${terms[x].termName ?? ""} ${terms[x].yearName ?? ""}<br/>${v ?? 0}% · Grade ${gradeAt.get(`${x}|${y}`) ?? "–"}`;
        },
      },
      series: [
        {
          type: "heatmap",
          // Dark ink on pale cells, white on saturated ones.
          data: cells.map(([x, y, v]) => ({
            value: [x, y, v],
            label: { color: v >= 62 ? "#fff" : viz.ink },
          })),
          itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 },
          label: {
            show: true,
            fontSize: 10,
            formatter: (p: any) => {
              // The cell label. Same story as the tooltip above: a position
              // with no cell under it arrives with no data to read.
              const cell = p?.data?.value ?? p?.data;
              return Array.isArray(cell) && cell[2] !== undefined
                ? String(cell[2])
                : "";
            },
          },
          emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgb(16 24 40 / 0.25)" } },
        },
      ],
    };
  }, [terms, latest]);

  if (isLoading) return <PageSpinner />;
  if (!data) {
    return (
      <div className="py-24 text-center text-muted">Student not found.</div>
    );
  }

  const s = data.student;
  const chips = [
    {
      label: "Average",
      value: latest?.average != null ? `${latest.average.toFixed(1)}%` : "–",
      sub: latest?.letterGrade ? `Grade ${latest.letterGrade}` : "",
    },
    {
      label: "Position",
      value: latest?.rank ? `${latest.rank}` : "–",
      sub: `of ${latest?.classSize ?? s?.classSize ?? "–"}`,
    },
    {
      label: "Aggregate",
      value: latest?.aggregate ?? "–",
      sub: latest?.aggregateMax ? `/ ${latest.aggregateMax}` : "",
    },
    {
      label: "Attendance",
      value: latest?.attendancePct != null ? `${latest.attendancePct}%` : "–",
      sub: latest?.termName ?? "",
    },
    {
      label: "Conduct",
      value: s?.disciplinePoints ?? "–",
      sub: "/ 100 points",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Who is this */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            src={s?.photoUrl}
            fallback={(s?.name ?? "").split(" ").filter(Boolean).map((w: string) => w[0]).slice(0, 2).join("")}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{s?.name ?? "Student"}</h1>
              <Badge variant="info">{s?.class}</Badge>
              {s?.trade && <Badge variant="default">{s?.trade.name}</Badge>}
              {s?.status === "ACTIVE" && (
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Active
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {s?.studentIdNumber}
              {s?.email ? ` · ${s?.email}` : ""}
            </p>
          </div>
        </div>

        {/* How are they doing right now */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {chips.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-border bg-accent-light/40 px-3 py-2.5 text-center"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {c.label}
              </p>
              <p className="text-lg font-bold tabular-nums text-primary">
                {c.value}
                {c.sub && (
                  <span className="ml-1 text-xs font-medium text-muted">{c.sub}</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {terms.length === 0 ? (
        <Card className="p-10 text-center text-muted">
          No marks recorded for this student yet.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {trajectoryOption && (
              <Card className="p-6">
                <CardTitle>Term by term</CardTitle>
                <p className="mt-0.5 text-sm text-muted">
                  {s?.name.split(" ")[0]}&apos;s average against the class, across the year.
                </p>
                <EChart option={trajectoryOption} height={280} />
              </Card>
            )}

            {subjectsOption && (
              <Card className="p-6">
                <CardTitle>
                  Subjects this term ({latest?.termName}
                  {latest?.yearName ? `, ${latest.yearName}` : ""})
                </CardTitle>
                <p className="mt-0.5 text-sm text-muted">
                  Strongest first; anything left of the dashed line needs attention.
                </p>
                <EChart
                  option={subjectsOption}
                  height={(latest?.subjects?.length ?? 0) * 26 + 60}
                />
              </Card>
            )}
          </div>

          {heatmapOption && (
            <Card className="p-6">
              <CardTitle>Every subject, every term</CardTitle>
              <p className="mt-0.5 text-sm text-muted">
                One row per subject: watch a cell darken (improving) or fade (slipping) left to right.
              </p>
              <EChart
                option={heatmapOption}
                height={
                  (new Set(
                    terms.flatMap((t: any) => t.subjects.map((x: any) => x.name)),
                  ).size) * 30 + 90
                }
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
