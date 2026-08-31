import { toast } from "sonner";

export type ExportColumn = { header: string; key: string };

export type ExportOptions = {
  filename: string;
  title?: string;
  columns: ExportColumn[];
  data: Record<string, any>[];
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getValue(row: Record<string, any>, key: string): string {
  const val = key.split(".").reduce((obj, k) => obj?.[k], row);
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportJSON(options: ExportOptions) {
  const rows = options.data.map((row) => {
    const obj: Record<string, string> = {};
    for (const col of options.columns) {
      obj[col.header] = getValue(row, col.key);
    }
    return obj;
  });
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${options.filename}.json`);
  toast.success(`Exported as JSON (${rows.length} rows)`);
}

export function exportCSV(options: ExportOptions) {
  const header = options.columns.map((c) => escapeCSV(c.header)).join(",");
  const rows = options.data.map((row) =>
    options.columns.map((col) => escapeCSV(getValue(row, col.key))).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${options.filename}.csv`);
  toast.success(`Exported as CSV (${options.data.length} rows)`);
}

export async function exportPDF(options: ExportOptions) {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  if (options.title) {
    doc.setFontSize(16);
    doc.text(options.title, 14, 15);
  }

  const head = [options.columns.map((c) => c.header)];
  const body = options.data.map((row) =>
    options.columns.map((col) => getValue(row, col.key))
  );

  (doc as any).autoTable({
    head,
    body,
    startY: options.title ? 22 : 14,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [27, 79, 114] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  doc.save(`${options.filename}.pdf`);
  toast.success(`Exported as PDF (${options.data.length} rows)`);
}

/**
 * The spreadsheet export.
 *
 * ExcelJS rather than SheetJS. The advisory against SheetJS covers prototype
 * pollution and a regular expression denial of service, and npm reports no fix
 * available, so waiting was not going to resolve it. Our exposure was narrow -
 * this only ever writes files from data the app already holds, and the bite is
 * in parsing untrusted workbooks - but a dependency with no patch coming is
 * one to leave behind rather than to keep watching.
 *
 * ExcelJS has no browser `writeFile`, so the buffer goes through the same
 * download helper as every other format here.
 */
/**
 * A worksheet name Excel will accept.
 *
 * Excel refuses names over 31 characters or containing any of : \ / ? * [ ],
 * and refuses the file outright rather than complaining about the name. Our
 * titles are page headings, so "Students: Senior 1 A" is an ordinary one.
 */
function sheetName(title?: string): string {
  const cleaned = (title || "Data").replace(/[:\\/?*[\]]/g, " ").trim();
  return cleaned.slice(0, 31) || "Data";
}

export async function exportExcel(options: ExportOptions) {
  const ExcelJS = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName(options.title));

  sheet.columns = options.columns.map((col) => ({
    header: col.header,
    key: col.key,
    /* Wide enough for the header, and a little more for the values under it.
       Left to itself every column is eight characters and every date reads as
       ####, which is a spreadsheet somebody has to fix before using. */
    width: Math.min(Math.max(col.header.length + 4, 12), 40),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of options.data) {
    sheet.addRow(
      Object.fromEntries(
        options.columns.map((col) => [col.key, getValue(row, col.key)]),
      ),
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${options.filename}.xlsx`,
  );
  toast.success(`Exported as Excel (${options.data.length} rows)`);
}

export function exportData(
  format: "json" | "csv" | "pdf" | "xlsx",
  options: ExportOptions
) {
  if (!options.data || options.data.length === 0) {
    toast.error("No data to export");
    return;
  }
  switch (format) {
    case "json": return exportJSON(options);
    case "csv": return exportCSV(options);
    case "pdf": return exportPDF(options);
    case "xlsx": return exportExcel(options);
  }
}
