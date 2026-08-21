import { beforeEach, describe, it, vi } from "vitest";

import {
  assertMutation,
  assertQuery,
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
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

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
