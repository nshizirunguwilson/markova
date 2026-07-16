"use client";

import { useState } from "react";
import { Card, CardTitle, Button } from "@/components/ui";
import { Download, FileText, Archive } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { toLocalDateString, classDisplayName } from "@/lib/utils";

const EXPORTS = [
  { key: "users", label: "All Users", description: "Export all users with roles and status" },
  { key: "students", label: "Students", description: "Export students with class, ID, and status" },
  { key: "teachers", label: "Teachers", description: "Export teachers with employment status" },
  { key: "marks", label: "Marks", description: "Export all marks for current term" },
  { key: "attendance", label: "Attendance", description: "Export attendance records" },
];

export function DataExportTab() {
  const [loading, setLoading] = useState<string | null>(null);
  const [fullLoading, setFullLoading] = useState(false);

  const handleExportEverything = async () => {
    setFullLoading(true);
    try {
      const res = await api.get("/reports/export/all", { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `markova-export-${toLocalDateString(new Date())}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Full export downloaded");
    } catch {
      toast.error("Full export failed");
    } finally {
      setFullLoading(false);
    }
  };

  const handleExport = async (key: string) => {
    setLoading(key);
    try {
      // Each export pulls its own dataset and flattens it to readable columns.
      const base =
        key === "students"
          ? "/users?role=STUDENT"
          : key === "teachers"
          ? "/users?role=TEACHER"
          : key === "marks"
          ? "/marks"
          : key === "attendance"
          ? "/attendance"
          : "/users";
      const sep = base.includes("?") ? "&" : "?";

      // Page through everything — these endpoints cap limit at 100 per request.
      const data: any[] = [];
      let pageNum = 1;
      let totalPages = 1;
      do {
        const res = await api.get(`${base}${sep}page=${pageNum}&limit=100`);
        data.push(...(res.data?.data || []));
        totalPages = res.data?.meta?.totalPages || 1;
        pageNum++;
      } while (pageNum <= totalPages && pageNum <= 500);

      if (data.length === 0) {
        toast.warning("No data to export");
        return;
      }

      const flatten =
        key === "marks" ? flattenMark : key === "attendance" ? flattenAttendance : flattenUser;

      const headers = Object.keys(flatten(data[0]));
      const rows = data.map((item: any) => {
        const flat = flatten(item);
        return headers.map((h) => `"${String(flat[h] ?? "").replace(/"/g, '""')}"`).join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${key}_export_${toLocalDateString(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`${key} exported successfully (${data.length} rows)`);
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardTitle>Data Export</CardTitle>
      <p className="mt-1 text-sm text-muted">Download data as CSV files</p>

      {/* Full export — everything the system holds, as one ZIP of CSVs */}
      <div className="mt-6 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-3">
          <Archive className="h-5 w-5 text-primary" />
          <div>
            <p className="font-medium text-foreground">Export everything</p>
            <p className="text-xs text-muted">
              A complete backup of all system data — one CSV per table, bundled in a ZIP.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleExportEverything}
          isLoading={fullLoading}
          disabled={fullLoading}
        >
          {fullLoading ? "Preparing..." : (<><Download className="mr-1 h-4 w-4" /> Export ZIP</>)}
        </Button>
      </div>

      <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Or export a single dataset
      </p>

      <div className="space-y-3">
        {EXPORTS.map((exp) => (
          <div
            key={exp.key}
            className="flex items-center justify-between rounded-lg border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">{exp.label}</p>
                <p className="text-xs text-muted">{exp.description}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport(exp.key)}
              isLoading={loading === exp.key}
              disabled={loading !== null}
            >
              {loading === exp.key ? (
                "Exporting..."
              ) : (
                <><Download className="mr-1 h-4 w-4" /> Export</>
              )}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function flattenUser(user: any): Record<string, string> {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email || "",
    phone: user.phone || "",
    role: user.role,
    isActive: String(user.isActive),
    studentId: user.student?.studentIdNumber || "",
    class: user.student?.classSection
      ? classDisplayName(user.student.classSection)
      : "",
  };
}

function flattenMark(m: any): Record<string, string> {
  const u = m.student?.user;
  return {
    studentId: m.student?.studentIdNumber || "",
    student: u ? `${u.firstName} ${u.lastName}` : "",
    subject: m.subject?.name || "",
    assessment: m.assessmentType?.name || "",
    score: String(m.score ?? ""),
    maxScore: String(m.maxScore ?? ""),
  };
}

function flattenAttendance(a: any): Record<string, string> {
  const u = a.student?.user;
  return {
    studentId: a.student?.studentIdNumber || "",
    student: u ? `${u.firstName} ${u.lastName}` : "",
    date: a.date ? new Date(a.date).toISOString().slice(0, 10) : "",
    status: a.status || "",
    reason: a.reasonCategory || "",
  };
}
