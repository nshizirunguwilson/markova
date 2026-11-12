"use client";

import { Download, KeyRound } from "lucide-react";
import { Button } from "@/components/ui";

export type NewPassword = { name: string; login: string; password: string };

/**
 * The first passwords an import made, shown the one time they can be.
 *
 * The Users page showed them; the setup wizard's import steps dropped them,
 * so nobody brought in during setup could sign in without a reset.
 */
export function NewPasswords({
  credentials,
  fileName,
}: {
  credentials: NewPassword[];
  fileName: string;
}) {
  if (!credentials.length) return null;

  const download = () => {
    const csv = [
      "name,login,password",
      ...credentials.map((c) => `${c.name},${c.login},${c.password}`),
    ].join("\n");
    const url = window.URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-accent-light/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
        <KeyRound className="h-4 w-4" />
        {credentials.length} users created, each with their own password
      </div>
      <p className="mb-3 text-xs text-muted">
        Download and share these safely. They are shown only now, and
        every user must change their password on first login.
      </p>
      <div className="mb-3 max-h-36 overflow-auto rounded border border-border bg-surface text-xs">
        {credentials.slice(0, 6).map((c, i) => (
          <div key={i} className="flex justify-between border-b border-border px-2 py-1 last:border-0">
            <span className="font-medium">{c.name}</span>
            <span className="text-muted">{c.login}</span>
            <span className="font-mono">{c.password}</span>
          </div>
        ))}
        {credentials.length > 6 && (
          <p className="px-2 py-1 text-muted">…and {credentials.length - 6} more in the file</p>
        )}
      </div>
      <Button size="sm" onClick={download}>
        <Download className="mr-2 h-4 w-4" />
        Download credentials CSV
      </Button>
    </div>
  );
}
