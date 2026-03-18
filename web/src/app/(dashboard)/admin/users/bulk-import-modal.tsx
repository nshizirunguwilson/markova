"use client";

import { useState, useRef } from "react";
import { Upload, Download, FileText, AlertCircle } from "lucide-react";
import { Modal, Button, Badge } from "@/components/ui";
import { useBulkImport } from "@/hooks/use-users";
import api from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function BulkImportModal({ isOpen, onClose }: Props) {
  const [role, setRole] = useState("STUDENT");
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkImport = useBulkImport();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.trim().split("\n");
      if (lines.length < 2) {
        setErrors(["File must have a header row and at least one data row"]);
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(",").map((v) => v.trim());
        const row: any = {};
        headers.forEach((h, i) => {
          row[h] = values[i] || "";
        });
        return row;
      });

      setParsedRows(rows);
      setErrors([]);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get(`/users/import-template/${role}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${role.toLowerCase()}_template.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // Fallback: generate template client-side
      const templates: Record<string, string> = {
        STUDENT:
          "email,firstName,lastName,classSectionId,gender,dateOfBirth",
        TEACHER: "email,phone,firstName,lastName",
        PARENT: "phone,firstName,lastName,studentIds,relationship",
      };
      const csv = templates[role] || templates.STUDENT;
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${role.toLowerCase()}_template.csv`;
      link.click();
    }
  };

  const handleImport = async () => {
    const result = await bulkImport.mutateAsync({ role, rows: parsedRows });
    if (result.errors?.length) {
      setErrors(result.errors);
    } else {
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setParsedRows([]);
    setFileName("");
    setErrors([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title="Bulk Import Users"
      size="lg"
    >
      <div className="space-y-5">
        {/* Role selector */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Import as
          </label>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              handleReset();
            }}
            className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="STUDENT">Students</option>
            <option value="TEACHER">Teachers</option>
            <option value="PARENT">Parents</option>
          </select>
        </div>

        {/* Template download */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadTemplate}
        >
          <Download className="mr-2 h-4 w-4" />
          Download CSV Template
        </Button>

        {/* File upload */}
        <div
          className="cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center hover:border-primary/50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mx-auto mb-3 h-8 w-8 text-muted" />
          <p className="text-sm text-muted">
            Click to upload a CSV file
          </p>
          {fileName && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {fileName}
              </span>
              <Badge>{parsedRows.length} rows</Badge>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Preview */}
        {parsedRows.length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">
              Preview ({parsedRows.length} rows)
            </p>
            <div className="max-h-40 overflow-auto text-xs">
              {parsedRows.slice(0, 5).map((row, i) => (
                <div key={i} className="border-b border-border py-1">
                  {Object.entries(row).map(([k, v]) => (
                    <span key={k} className="mr-3">
                      <span className="text-muted">{k}:</span>{" "}
                      {String(v)}
                    </span>
                  ))}
                </div>
              ))}
              {parsedRows.length > 5 && (
                <p className="mt-1 text-muted">
                  ...and {parsedRows.length - 5} more rows
                </p>
              )}
            </div>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="rounded-lg border border-danger/30 bg-red-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-danger">
              <AlertCircle className="h-4 w-4" />
              Import Errors
            </div>
            <ul className="max-h-32 overflow-auto text-xs text-danger">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              handleReset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={parsedRows.length === 0}
            isLoading={bulkImport.isPending}
          >
            Import {parsedRows.length} Users
          </Button>
        </div>
      </div>
    </Modal>
  );
}
