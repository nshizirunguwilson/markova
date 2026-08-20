"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardTitle, Badge, Spinner } from "@/components/ui";
import { useStudentAttendanceSummary } from "@/hooks/use-attendance";
import { useAuthStore } from "@/stores/auth-store";
import { Calendar, Check, X, Clock, Users } from "lucide-react";
import { toLocalDateString } from "@/lib/utils";
import api from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";

interface Child {
  id: string;
  name: string;
  className: string;
}

export default function ParentAttendancePage() {
  const { user } = useAuthStore();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    api
      .get(`/users/${user.id}`)
      .then((res) => {
        const links = res.data?.parentStudents || [];
        const mapped = links.map((ps: any) => ({
          id: ps.student.id,
          name: `${ps.student.user.firstName} ${ps.student.user.lastName}`,
          className: ps.student.classSection
            ? `${ps.student.classSection.classLevel?.name || ""} ${ps.student.classSection.name || ""}`
            : "",
        }));
        setChildren(mapped);
        if (mapped.length > 0) setSelectedChild(mapped[0].id);
      })
      .catch(() => {});
  }, [user?.id]);

  const { data, isLoading } = useStudentAttendanceSummary(selectedChild);

  const calendarData = useMemo(() => {
    if (!data?.records) return [];
    const recordMap = new Map<string, string>();
    for (const r of data.records) {
      recordMap.set(toLocalDateString(new Date(r.date)), r.status);
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: any[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, status: recordMap.get(dateStr) || null });
    }
    return days;
  }, [data]);

  const monthName = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Child&apos;s Attendance"
        description="Monitor your child&apos;s attendance"
        actions={
          <>
            {children.length === 1 ? (
          <span className="flex items-center rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground">
            Viewing attendance for: <strong className="ml-1">{children[0].name}</strong>
          </span>
        ) : children.length > 1 ? (
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
           aria-label="Select child">
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.className})</option>
            ))}
          </select>
        ) : null}
          </>
        }
      />

      {children.length > 0 && (
        <Card>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                {children.find((c) => c.id === selectedChild)?.name}
              </p>
              <p className="text-xs text-muted">
                {children.find((c) => c.id === selectedChild)?.className}
              </p>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <p className="text-xs text-muted">Attendance Rate</p>
              <p className={`text-2xl font-bold ${data.attendanceRate >= 90 ? "text-success" : data.attendanceRate >= 75 ? "text-warning" : "text-danger"}`}>
                {data.attendanceRate}%
              </p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Present</p>
              <p className="text-2xl font-bold text-success">{data.present}</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Late</p>
              <p className="text-2xl font-bold text-warning">{data.late}</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Absent</p>
              <p className="text-2xl font-bold text-danger">{data.absent}</p>
            </Card>
          </div>

          <Card>
            <CardTitle><Calendar className="mr-2 inline h-5 w-5" /> {monthName}</CardTitle>
            <div className="mt-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarData.map((cell: any, i: number) => (
                  <div
                    key={i}
                    className={`flex h-10 items-center justify-center rounded-lg text-xs font-medium ${
                      !cell ? "" :
                      cell.status === "PRESENT" ? "bg-success/10 text-success" :
                      cell.status === "LATE" ? "bg-warning/10 text-warning" :
                      cell.status === "ABSENT" ? "bg-danger/10 text-danger" :
                      "bg-surface text-muted"
                    }`}
                  >
                    {cell?.day && (
                      <div className="flex flex-col items-center">
                        <span>{cell.day}</span>
                        {cell.status === "PRESENT" && <Check className="h-3 w-3" />}
                        {cell.status === "LATE" && <Clock className="h-3 w-3" />}
                        {cell.status === "ABSENT" && <X className="h-3 w-3" />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs">
              <span className="flex items-center gap-1"><div className="h-3 w-3 rounded bg-success/20" /> Present</span>
              <span className="flex items-center gap-1"><div className="h-3 w-3 rounded bg-warning/20" /> Late</span>
              <span className="flex items-center gap-1"><div className="h-3 w-3 rounded bg-danger/20" /> Absent</span>
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-center text-muted py-8">No attendance records found.</p>
        </Card>
      )}
    </div>
  );
}
