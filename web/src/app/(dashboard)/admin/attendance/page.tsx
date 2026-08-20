"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Badge,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { useAttendanceDashboard, useChronicallyAbsent } from "@/hooks/use-attendance";
import { Button } from "@/components/ui";
import { Calendar, AlertTriangle, Users, TrendingDown } from "lucide-react";
import { toLocalDateString } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

export default function AdminAttendancePage() {
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [tab, setTab] = useState<"dashboard" | "chronic">("dashboard");

  const { data: dashboard, isLoading } = useAttendanceDashboard(date);
  const { data: chronic } = useChronicallyAbsent();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Dashboard"
        description="Real-time attendance monitoring"
        actions={
          <>
            <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          {date !== toLocalDateString(new Date()) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDate(toLocalDateString(new Date()))}
            >
              Clear Filters
            </Button>
          )}
        </div>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border">
        <button
          onClick={() => setTab("dashboard")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "dashboard" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <Calendar className="mr-1 inline h-4 w-4" /> Today&apos;s Overview
        </button>
        <button
          onClick={() => setTab("chronic")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "chronic" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <AlertTriangle className="mr-1 inline h-4 w-4" /> Chronic Absenteeism
          {chronic?.count > 0 && (
            <Badge variant="danger" className="ml-1">{chronic.count}</Badge>
          )}
        </button>
      </div>

      {tab === "dashboard" && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : !dashboard ? (
            <Card>
              <div className="py-12 text-center text-muted">
                <Calendar className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p className="font-medium">No attendance data</p>
                <p className="mt-1 text-xs">No attendance records found for this date</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Overall Stats */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <Card>
                  <p className="text-xs text-muted">Total Students</p>
                  <p className="text-2xl font-bold text-foreground">{dashboard.overall.totalStudents}</p>
                </Card>
                <Card>
                  <p className="text-xs text-muted">Present</p>
                  <p className="text-2xl font-bold text-success">{dashboard.overall.present}</p>
                </Card>
                <Card>
                  <p className="text-xs text-muted">Late</p>
                  <p className="text-2xl font-bold text-warning">{dashboard.overall.late}</p>
                </Card>
                <Card>
                  <p className="text-xs text-muted">Absent</p>
                  <p className="text-2xl font-bold text-danger">{dashboard.overall.absent}</p>
                </Card>
                <Card>
                  <p className="text-xs text-muted">Attendance Rate</p>
                  <p className="text-2xl font-bold text-primary">{dashboard.overall.rate}%</p>
                </Card>
              </div>

              {/* Per-Section Breakdown */}
              <Card>
                <CardTitle>
                  <Users className="mr-2 inline h-5 w-5" /> Class Breakdown
                </CardTitle>
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Present</TableHead>
                        <TableHead>Late</TableHead>
                        <TableHead>Absent</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.sections.map((s: any) => (
                        <TableRow key={s.sectionId}>
                          <TableCell className="font-medium">{s.className}</TableCell>
                          <TableCell>{s.total}</TableCell>
                          <TableCell className="text-success">{s.present}</TableCell>
                          <TableCell className="text-warning">{s.late}</TableCell>
                          <TableCell className="text-danger">{s.absent}</TableCell>
                          <TableCell>
                            <span className={`font-bold ${s.rate >= 90 ? "text-success" : s.rate >= 75 ? "text-warning" : "text-danger"}`}>
                              {s.rate}%
                            </span>
                          </TableCell>
                          <TableCell>
                            {s.marked ? (
                              <Badge variant="success">Marked</Badge>
                            ) : (
                              <Badge variant="danger">Not Marked</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              {/* Visual bar chart */}
              <Card>
                <CardTitle>Attendance by Class</CardTitle>
                <div className="mt-4 flex items-end gap-3 h-40">
                  {dashboard.sections.map((s: any) => (
                    <div key={s.sectionId} className="flex h-full flex-1 flex-col items-center">
                      <span className="mb-1 text-xs font-bold">{s.rate}%</span>
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className={`w-full rounded-t-lg ${
                            s.rate >= 90 ? "bg-success" : s.rate >= 75 ? "bg-warning" : "bg-danger"
                          }`}
                          style={{ height: `${s.rate}%` }}
                        />
                      </div>
                      <span className="mt-1 text-xs text-muted truncate w-full text-center">
                        {s.className}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {tab === "chronic" && (
        <Card>
          <CardTitle>
            <TrendingDown className="mr-2 inline h-5 w-5 text-danger" />
            Chronically Absent Students ({chronic?.count || 0})
          </CardTitle>
          <p className="mt-1 text-xs text-muted">
            Students with absence rate above {chronic?.threshold || 20}%
          </p>
          {chronic?.students?.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Total Days</TableHead>
                    <TableHead>Absent Days</TableHead>
                    <TableHead>Absence Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chronic.students.map((s: any) => (
                    <TableRow key={s.studentId}>
                      <TableCell>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted font-mono">{s.studentIdNumber}</p>
                      </TableCell>
                      <TableCell>{s.class}</TableCell>
                      <TableCell>{s.totalDays}</TableCell>
                      <TableCell className="text-danger font-bold">{s.absentDays}</TableCell>
                      <TableCell>
                        <Badge variant="danger">{s.absenceRate}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="mt-4 text-center text-muted py-8">No chronically absent students found.</p>
          )}
        </Card>
      )}
    </div>
  );
}
