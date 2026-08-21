import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  save: vi.fn(),
  autoTable: vi.fn(),
  text: vi.fn(),
  setFontSize: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: h.toast }));

vi.mock("jspdf", () => ({
  default: class {
    save = h.save;
    text = h.text;
    setFontSize = h.setFontSize;
    autoTable = h.autoTable;
  },
}));
vi.mock("jspdf-autotable", () => ({}));

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn((rows: unknown) => ({ rows })),
    book_new: vi.fn(() => ({ Sheets: {} })),
    book_append_sheet: vi.fn(),
  },
  writeFile: h.writeFile,
}));

import { exportCSV, exportData, exportJSON } from "./export";

const columns = [
  { header: "Name", key: "user.firstName" },
  { header: "Class", key: "classSection.name" },
  { header: "Boarding", key: "boarding" },
  { header: "Score", key: "score" },
];

const data = [
  {
    user: { firstName: "Divine" },
    classSection: { name: "Senior 1 A" },
    boarding: true,
    score: 82,
  },
  {
    user: { firstName: "Keza" },
    classSection: null,
    boarding: false,
    score: null,
  },
];

/** Captures whatever the module hands to the browser to download. */
let captured: { text: string; filename: string; type: string } | null = null;

beforeEach(() => {
  captured = null;
  for (const fn of Object.values(h.toast)) fn.mockReset();

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      // Blob.text() is async and download is sync, so read the parts directly.
      const parts = (blob as unknown as { __parts?: string[] }).__parts ?? [];
      captured = {
        text: parts.join(""),
        filename: "",
        type: blob.type,
      };
      return "blob:mock";
    }),
    revokeObjectURL: vi.fn(),
  });

  // Record the Blob contents, which jsdom otherwise only exposes async.
  class RecordingBlob {
    type: string;
    __parts: string[];
    constructor(parts: string[], opts?: { type?: string }) {
      this.__parts = parts;
      this.type = opts?.type ?? "";
    }
  }
  vi.stubGlobal("Blob", RecordingBlob);

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
    if (captured) captured.filename = "captured";
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("exportCSV", () => {
  it("writes a header row and one row per record", () => {
    exportCSV({ filename: "students", columns, data });
    expect(captured?.text.split("\n")[0]).toBe("Name,Class,Boarding,Score");
    expect(captured?.text.split("\n")).toHaveLength(3);
  });

  it("reads nested keys with dots", () => {
    exportCSV({ filename: "students", columns, data });
    expect(captured?.text).toContain("Divine");
    expect(captured?.text).toContain("Senior 1 A");
  });

  it("renders booleans as Yes and No, not true and false", () => {
    exportCSV({ filename: "students", columns, data });
    const [, first, second] = captured!.text.split("\n");
    expect(first).toContain("Yes");
    expect(second).toContain("No");
  });

  it("renders a missing value as empty rather than the word null", () => {
    exportCSV({ filename: "students", columns, data });
    const second = captured!.text.split("\n")[2];
    expect(second).not.toContain("null");
    expect(second).not.toContain("undefined");
  });

  // A comma inside a name would otherwise shift every later column by one.
  it("quotes a value containing a comma", () => {
    exportCSV({
      filename: "x",
      columns: [{ header: "Name", key: "name" }],
      data: [{ name: "Uwase, Aline" }],
    });
    expect(captured?.text).toContain('"Uwase, Aline"');
  });

  it("doubles an embedded quote, the way CSV requires", () => {
    exportCSV({
      filename: "x",
      columns: [{ header: "Name", key: "name" }],
      data: [{ name: 'The "Best" Class' }],
    });
    expect(captured?.text).toContain('"The ""Best"" Class"');
  });

  it("quotes a value containing a newline", () => {
    exportCSV({
      filename: "x",
      columns: [{ header: "Note", key: "note" }],
      data: [{ note: "line one\nline two" }],
    });
    expect(captured?.text).toMatch(/"line one\nline two"/);
  });

  it("reports the row count", () => {
    exportCSV({ filename: "students", columns, data });
    expect(h.toast.success).toHaveBeenCalledWith(expect.stringContaining("2 rows"));
  });
});

describe("exportJSON", () => {
  it("keys each object by column header, not by the source key", () => {
    exportJSON({ filename: "students", columns, data });
    const parsed = JSON.parse(captured!.text) as Record<string, string>[];
    expect(Object.keys(parsed[0])).toEqual(["Name", "Class", "Boarding", "Score"]);
    expect(parsed[0].Name).toBe("Divine");
  });

  it("applies the same boolean and null handling as CSV", () => {
    exportJSON({ filename: "students", columns, data });
    const parsed = JSON.parse(captured!.text) as Record<string, string>[];
    expect(parsed[0].Boarding).toBe("Yes");
    expect(parsed[1].Score).toBe("");
  });
});

describe("exportData", () => {
  it("refuses an empty set instead of downloading a header-only file", () => {
    exportData("csv", { filename: "x", columns, data: [] });
    expect(h.toast.error).toHaveBeenCalledWith("No data to export");
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("refuses when data is missing entirely", () => {
    exportData("csv", {
      filename: "x",
      columns,
      data: undefined as unknown as Record<string, unknown>[],
    });
    expect(h.toast.error).toHaveBeenCalledWith("No data to export");
  });

  it.each(["json", "csv"] as const)("dispatches the %s format", (format) => {
    exportData(format, { filename: "x", columns, data });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringContaining(format.toUpperCase()),
    );
  });

  it("dispatches xlsx through the spreadsheet writer", async () => {
    await exportData("xlsx", { filename: "students", title: "Students", columns, data });
    expect(h.writeFile).toHaveBeenCalledWith(expect.anything(), "students.xlsx");
    expect(h.toast.success).toHaveBeenCalledWith(expect.stringContaining("Excel"));
  });

  it("dispatches pdf through the document writer", async () => {
    await exportData("pdf", { filename: "students", title: "Students", columns, data });
    expect(h.save).toHaveBeenCalledWith("students.pdf");
    expect(h.autoTable).toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith(expect.stringContaining("PDF"));
  });
});
