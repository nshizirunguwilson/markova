"use client";

import { useState } from "react";
import { Card, CardTitle, Button } from "@/components/ui";
import { Download, FileText, Archive } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { toLocalDateString } from "@/lib/utils";

const EXPORTS = [
  { key: "users", label: "All Users", description: "Export all users with roles and status" },
  { key: "students", label: "Students", description: "Export students with class, ID, and status" },
  { key: "teachers", label: "Teachers", description: "Export teachers with employment status" },
  { key: "marks", label: "Marks", description: "Export all recorded marks with student, subject and term" },
  { key: "attendance", label: "Attendance", description: "Export all attendance records" },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataExportTab() {
  const [loading, setLoading] = useState<string | null>(null);
  const [fullLoading, setFullLoading] = useState(false);

  const handleExportEverything = async () => {
    setFullLoading(true);
    try {
      const res = await api.get("/reports/export/all", { responseType: "blob" });
      downloadBlob(res.data as Blob, `markova-export-${toLocalDateString(new Date())}.zip`);
      toast.success("Full export downloaded");
    } catch {
      toast.error("Full export failed");
    } finally {
      setFullLoading(false);
    }
  };

  // The CSV is assembled server-side — one request regardless of table size,
  // so big datasets (marks, attendance) don't hit pagination or rate limits.
  const handleExport = async (key: string) => {
    setLoading(key);
    try {
      const res = await api.get(`/reports/export/dataset/${key}`, {
        responseType: "blob",
        timeout: 120000,
      });
      downloadBlob(res.data as Blob, `${key}_export_${toLocalDateString(new Date())}.csv`);
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
