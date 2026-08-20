"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileJson, FileSpreadsheet, FileText, Table } from "lucide-react";

type ExportFormat = "json" | "csv" | "pdf" | "xlsx";

interface ExportDropdownProps {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
}

const formats: { format: ExportFormat; label: string; icon: typeof FileJson }[] = [
  { format: "json", label: "JSON", icon: FileJson },
  { format: "csv", label: "CSV", icon: FileText },
  { format: "pdf", label: "PDF Table", icon: Table },
  { format: "xlsx", label: "Excel", icon: FileSpreadsheet },
];

export function ExportDropdown({ onExport, disabled }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        Export
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface py-1 shadow-lg">
          {formats.map(({ format, label, icon: Icon }) => (
            <button
              key={format}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent-light"
              onClick={() => {
                onExport(format);
                setOpen(false);
              }}
            >
              <Icon className="h-4 w-4 text-muted" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
