"use client";

import { useState } from "react";
import { Card, CardTitle, Button } from "@/components/ui";
import { Download, FileText } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { toLocalDateString } from "@/lib/utils";

const EXPORTS = [
  { key: "users", label: "All Users", description: "Export all users with roles and status" },
  { key: "students", label: "Students", description: "Export students with class, ID, and status" },
  { key: "teachers", label: "Teachers", description: "Export teachers with employment status" },
  { key: "marks", label: "Marks", description: "Export all marks for current term" },
  { key: "attendance", label: "Attendance", description: "Export attendance records" },
  { key: "fees", label: "Fee Records", description: "Export fee payment records" },
];

export function DataExportTab() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (key: string) => {
    setLoading(key);
    try {
      // For now, export users list as CSV via the API
      // Full CSV export endpoints will be added in later sprints
      let endpoint = "/users?limit=1000";
      if (key === "students") endpoint = "/users?role=STUDENT&limit=1000";
      if (key === "teachers") endpoint = "/users?role=TEACHER&limit=1000";

      const res = await api.get(endpoint);
      const data = res.data?.data || [];

      if (data.length === 0) {
        toast.warning("No data to export");
        return;
      }

      // Convert to CSV
      const headers = Object.keys(flattenUser(data[0]));
      const rows = data.map((item: any) => {
        const flat = flattenUser(item);
        return headers.map((h) => `"${flat[h] || ""}"`).join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${key}_export_${toLocalDateString(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`${key} exported successfully`);
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

      <div className="mt-6 space-y-3">
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
      ? `${user.student.classSection.classLevel?.name || ""} ${user.student.classSection.name || ""}`
      : "",
  };
}
