import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertMutation,
  assertQuery,
  runMutation,
  type MutationCase,
  type QueryCase,
} from "@/test/hooks";

const h = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ default: h.api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import * as attendance from "./use-attendance";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useClassAttendance", hook: () => attendance.useClassAttendance("section-1", "2026-08-21"), url: "/attendance/class" },
  { name: "useStudentAttendanceSummary", hook: () => attendance.useStudentAttendanceSummary("student-1"), url: "/attendance/student-summary" },
  { name: "useAttendanceDashboard", hook: () => attendance.useAttendanceDashboard("2026-08-21"), url: "/attendance/dashboard" },
  { name: "useChronicallyAbsent", hook: () => attendance.useChronicallyAbsent("section-1", 3), url: "/attendance/chronic" },
];

const mutations: MutationCase[] = [
  { name: "useBulkAttendance", hook: () => attendance.useBulkAttendance(), method: "post", url: "/attendance/bulk" },
  { name: "useQrScan", hook: () => attendance.useQrScan(), method: "post", url: "/attendance/qr-scan" },
];

describe("use-attendance queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-attendance mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});

/** What the person scanning, or telling families, is told. */
describe("use-attendance messages", () => {
  beforeEach(() => Object.values(toast).forEach((t) => t.mockReset()));

  it("says a second scan is a second scan, not a failure", async () => {
    api.post.mockResolvedValue({ data: { duplicate: true, student: { name: "Keza" } } });
    await runMutation(() => attendance.useQrScan(), { qrData: "x" });
    expect(toast.info).toHaveBeenCalledWith("Keza already scanned");
  });

  it("names the student and the mark, or says recorded", async () => {
    api.post.mockResolvedValue({ data: {} });
    await runMutation(() => attendance.useQrScan(), { qrData: "x" });
    expect(toast.success).toHaveBeenCalledWith("Student: recorded");
  });

  it.each([
    [{ studentsIdentified: 0, alertsSent: 0, unreachable: 0 }, "Nobody needed telling.", null],
    [{ studentsIdentified: 1, alertsSent: 1, unreachable: 0 }, "Told 1 family about 1 child.", null],
    [
      { studentsIdentified: 3, alertsSent: 4, unreachable: 2 },
      "Told 4 families about 3 children.",
      "2 families have no email or phone on file and will need a call.",
    ],
    [
      { studentsIdentified: 2, alertsSent: 2, unreachable: 1 },
      "Told 2 families about 2 children.",
      "1 family has no email or phone on file and will need a call.",
    ],
  ])("tells the families of absent children, and who needs a call", async (r, said, warned) => {
    api.post.mockResolvedValue({ data: r });
    await runMutation(() => attendance.useAlertChronicFamilies());
    expect(toast.success).toHaveBeenCalledWith(said);
    if (warned) expect(toast.warning).toHaveBeenCalledWith(warned);
    else expect(toast.warning).not.toHaveBeenCalled();
  });

  it("says when the alerts could not go", async () => {
    api.post.mockRejectedValue(new Error("down"));
    await runMutation(() => attendance.useAlertChronicFamilies()).catch(() => {});
    expect(toast.error).toHaveBeenCalledWith("Could not send the alerts");
  });
});
