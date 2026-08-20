"use client";

import { useState, useMemo } from "react";
import { Card, CardTitle, Button, Spinner } from "@/components/ui";
import { useStudentAttendanceSummary } from "@/hooks/use-attendance";
import { useAuthStore } from "@/stores/auth-store";
import {
  Calendar,
  Check,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toLocalDateString } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

export default function StudentAttendancePage() {
  const { user } = useAuthStore();
  const studentId = (user as any)?.studentId;
  const { data, isLoading } = useStudentAttendanceSummary(studentId);
  const [viewDate, setViewDate] = useState(new Date());

  const goToPrevMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const goToNextMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  // Build calendar grid for viewed month
  const calendarData = useMemo(() => {
    if (!data?.records) return [];
    const recordMap = new Map<string, string>();
    for (const r of data.records) {
      const dateStr = toLocalDateString(new Date(r.date));
      recordMap.set(dateStr, r.status);
    }

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Padding
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, status: recordMap.get(dateStr) || null });
    }
    return days;
  }, [data, viewDate]);

  const monthName = viewDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Attendance"
        description="View your attendance record"
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : data ? (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <p className="text-xs text-muted">Attendance Rate</p>
              <p
                className={`text-2xl font-bold ${data.attendanceRate >= 90 ? "text-success" : data.attendanceRate >= 75 ? "text-warning" : "text-danger"}`}
              >
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

          {/* Calendar View */}
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle>
                <Calendar className="mr-2 inline h-5 w-5" /> {monthName}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToPrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-medium text-muted py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarData.map((cell, i) => (
                  <div
                    key={i}
                    className={`flex h-10 items-center justify-center rounded-lg text-xs font-medium ${
                      !cell
                        ? ""
                        : cell.status === "PRESENT"
                          ? "bg-success/10 text-success"
                          : cell.status === "LATE"
                            ? "bg-warning/10 text-warning"
                            : cell.status === "ABSENT"
                              ? "bg-danger/10 text-danger"
                              : "bg-surface text-muted"
                    }`}
                  >
                    {cell?.day && (
                      <div className="flex flex-col items-center">
                        <span>{cell.day}</span>
                        {cell.status === "PRESENT" && (
                          <Check className="h-3 w-3" />
                        )}
                        {cell.status === "LATE" && (
                          <Clock className="h-3 w-3" />
                        )}
                        {cell.status === "ABSENT" && <X className="h-3 w-3" />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs">
              <span className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-success/20" /> Present
              </span>
              <span className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-warning/20" /> Late
              </span>
              <span className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-danger/20" /> Absent
              </span>
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-center text-muted py-8">
            No attendance records found.
          </p>
        </Card>
      )}
    </div>
  );
}
