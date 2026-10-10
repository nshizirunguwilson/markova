"use client";

import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Card, CardTitle, Spinner } from "@/components/ui";
import { useAcademicYears, useTerms, useClassLevels, useSections } from "@/hooks/use-academic";
import { useTeacherClassAnalytics } from "@/hooks/use-analytics";
import { EChart } from "@/components/ui/echart";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CHART_COLOR } from "@/lib/chart-colors";

export default function TeacherAnalyticsPage() {
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId);
  const { data, isLoading } = useTeacherClassAnalytics(sectionId, termId);
  const chart = useChartTheme();

  const subjectOption = useMemo<EChartsOption | null>(() => {
    const rows = data?.subjectAnalytics;
    if (!rows?.length) return null;
    const bar = (name: string, color: string, key: string) => ({
      name,
      type: "bar" as const,
      barMaxWidth: 18,
      itemStyle: { color, borderRadius: [3, 3, 0, 0] as [number, number, number, number] },
      data: rows.map((r: any) => r[key]),
    });
    return {
      grid: { left: 40, right: 12, top: 14, bottom: 70 },
      xAxis: {
        type: "category",
        data: rows.map((r: any) => r.subjectName),
        axisTick: { show: false },
        axisLabel: { ...chart.axisLabel, fontSize: 10, rotate: 30 },
      },
      yAxis: { type: "value", min: 0, max: 100, axisLabel: chart.axisLabel, splitLine: chart.splitLine },
      legend: { ...chart.legendStyle, bottom: 0 },
      tooltip: { ...chart.tooltipStyle, trigger: "axis", axisPointer: { type: "shadow" } },
      series: [
        bar("Average", CHART_COLOR.brandLight, "averageScore"),
        bar("Highest", CHART_COLOR.brand, "highestScore"),
      ],
    };
  }, [data, chart]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Analytics"
      />

      <div className="flex gap-4 flex-wrap">
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }} aria-label="Year">
          <option value="">Year</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="Term">
          <option value="">Term</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={levelId} onChange={(e) => { setLevelId(e.target.value); setSectionId(""); }} aria-label="Level">
          <option value="">Level</option>
          {levels?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} aria-label="Section">
          <option value="">Section</option>
          {sections?.map((s: any) => <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center py-8"><Spinner /></div>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subject Performance */}
          {subjectOption && (
            <Card className="p-6">
              <CardTitle>Subject Performance</CardTitle>
              <div className="mt-4">
                <EChart option={subjectOption} height={256} />
              </div>
            </Card>
          )}

          {/* Underperforming Students */}
          {data.underperforming?.length > 0 && (
            <Card className="p-6">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Underperforming Students
              </CardTitle>
              <div className="mt-4 space-y-2">
                {data.underperforming.map((s: any, i: number) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">{s.name}</span>
                    <div className="flex gap-3 text-sm">
                      <span className="text-danger font-bold">{s.average}%</span>
                      <span className="text-muted">{s.letterGrade}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {!isLoading && !data && sectionId && termId && (
        <Card className="p-8 text-center text-muted">
          <TrendingUp className="w-12 h-12 mx-auto mb-2 text-border-strong" />
          No analytics data available
        </Card>
      )}
    </div>
  );
}
