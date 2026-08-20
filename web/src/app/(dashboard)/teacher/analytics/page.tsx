"use client";

import { useState } from "react";
import { Card, CardTitle, Spinner } from "@/components/ui";
import { useAcademicYears, useTerms, useClassLevels, useSections } from "@/hooks/use-academic";
import { useTeacherClassAnalytics } from "@/hooks/use-analytics";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Analytics"
      />

      <div className="flex gap-4 flex-wrap">
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }}>
          <option value="">Year</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">Term</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={levelId} onChange={(e) => { setLevelId(e.target.value); setSectionId(""); }}>
          <option value="">Level</option>
          {levels?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">Section</option>
          {sections?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center py-8"><Spinner /></div>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subject Performance */}
          {data.subjectAnalytics?.length > 0 && (
            <Card className="p-6">
              <CardTitle>Subject Performance</CardTitle>
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.subjectAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="subjectName" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="averageScore" fill="#2E86C1" name="Average" />
                    <Bar dataKey="highestScore" fill="#1B4F72" name="Highest" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Underperforming Students */}
          {data.underperforming?.length > 0 && (
            <Card className="p-6">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Underperforming Students
              </CardTitle>
              <div className="mt-4 space-y-2">
                {data.underperforming.map((s: any, i: number) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">{s.name}</span>
                    <div className="flex gap-3 text-sm">
                      <span className="text-red-600 font-bold">{s.average}%</span>
                      <span className="text-gray-500">{s.letterGrade}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {!isLoading && !data && sectionId && termId && (
        <Card className="p-8 text-center text-gray-500">
          <TrendingUp className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          No analytics data available
        </Card>
      )}
    </div>
  );
}
