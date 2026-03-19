"use client";

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
      <h1 className="text-2xl font-bold text-[#1B4F72]">Child Performance Trends</h1>

      <div className="flex gap-4 flex-wrap">
        {children.length > 1 && (
          <select className="border rounded-lg px-3 py-2 text-sm" value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)}>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => setYearId(e.target.value)}>
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
              <p className="text-xs text-gray-600">Total Days</p>
              <p className="text-xl font-bold text-[#1B4F72]">{data.attendance?.totalDays}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-600">Present</p>
              <p className="text-xl font-bold text-green-600">{data.attendance?.presentDays}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-600">Absent</p>
              <p className="text-xl font-bold text-red-600">{data.attendance?.absentDays}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-gray-600">Attendance Rate</p>
              <p className="text-xl font-bold text-[#2E86C1]">{data.attendance?.rate}%</p>
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
                    <Line type="monotone" dataKey="average" stroke="#1B4F72" strokeWidth={2} dot={{ r: 6 }} />
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
                    <span className="text-[#1B4F72]">{t.letterGrade ?? "—"}</span>
                    <span className="text-gray-500">Rank: {t.rank ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {!isLoading && !data && yearId && selectedChild && (
        <Card className="p-8 text-center text-gray-500">
          <TrendingUp className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          No trend data available
        </Card>
      )}
    </div>
  );
}
