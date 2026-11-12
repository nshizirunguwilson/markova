"use client";

import { useState, useRef } from "react";
import { Upload, FileText, GraduationCap } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { NewPasswords, type NewPassword } from "@/components/people/new-passwords";
import { useSections } from "@/hooks/use-academic";
import { classDisplayName } from "@/lib/utils";
import { useBulkImport, useUsers } from "@/hooks/use-users";

export function StepImportStudents() {
  const { data: usersData } = useUsers({ role: "STUDENT", limit: 100 });
  const bulkImport = useBulkImport();
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [credentials, setCredentials] = useState<NewPassword[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const students = usersData?.data || [];
  const { data: sections } = useSections();

  /* A principal knows "Senior 1 A", not the id behind it. A class column is
     matched to its id here; a classSectionId column still works as before. */
  const norm = (v: unknown) => String(v).toLowerCase().replace(/\s+/g, " ").trim();
  const idFor = (name: unknown): string | undefined =>
    ((sections as any[]) ?? []).find((s) => norm(classDisplayName(s)) === norm(name))?.id;
  const withClassIds = (rows: any[]) =>
    rows.map(({ class: name, ...row }) =>
      row.classSectionId || !name ? row : { ...row, classSectionId: idFor(name) },
    );
  const unknownClasses = Array.from(
    new Set(parsedRows.map((r) => r.class).filter((name) => name && !idFor(name))),
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = (ev.target?.result as string).trim().split("\n");
      if (lines.length < 2) return;
      const headers = lines[0].split(",").map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim());
        const row: any = {};
        headers.forEach((h, i) => (row[h] = vals[i] || ""));
        return row;
      });
      setParsedRows(rows);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    bulkImport.mutate({ role: "STUDENT", rows: withClassIds(parsedRows) }, {
      onSuccess: (result: { credentials?: NewPassword[] }) => {
        setCredentials(result?.credentials ?? []);
        setParsedRows([]);
        setFileName("");
      },
    });
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Import Students</h2>
      <p className="mb-6 text-sm text-muted">Add students via CSV: email, firstName, lastName, class (e.g. Senior 1 A), gender, dateOfBirth</p>

      {students.length > 0 && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="h-4 w-4 text-success" />
            <span className="font-medium">{students.length} students already in system</span>
          </div>
        </div>
      )}

      <div
        className="cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center hover:border-primary/50"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="mx-auto mb-3 h-8 w-8 text-muted" />
        <p className="text-sm text-muted">Upload student CSV</p>
        {fileName && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{fileName}</span>
            <Badge>{parsedRows.length} rows</Badge>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile}  aria-label="Choose a student CSV file"/>
      </div>

      {unknownClasses.length > 0 && (
        <p role="alert" className="mt-4 text-sm text-danger">
          No class called {unknownClasses.join(", ")}. Add it in the Classes step, or check the spelling.
        </p>
      )}

      {parsedRows.length > 0 && (
        <Button
          className="mt-4"
          onClick={handleImport}
          isLoading={bulkImport.isPending}
          disabled={unknownClasses.length > 0}
        >
          Import {parsedRows.length} Students
        </Button>
      )}
      <div className="mt-4">
        <NewPasswords credentials={credentials} fileName="student_credentials.csv" />
      </div>
    </div>
  );
}
