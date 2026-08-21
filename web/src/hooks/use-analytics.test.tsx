import { beforeEach, describe, it, vi } from "vitest";

import {
  assertQuery,
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

import * as analytics from "./use-analytics";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useAdminDashboard", hook: () => analytics.useAdminDashboard("year-1", "term-1"), url: "/analytics/admin/dashboard" },
  { name: "usePerformanceTrends", hook: () => analytics.usePerformanceTrends("year-1"), url: "/analytics/admin/performance-trends" },
  { name: "useClassComparisons", hook: () => analytics.useClassComparisons("term-1"), url: "/analytics/admin/class-comparisons" },
  { name: "useDisciplineStats", hook: () => analytics.useDisciplineStats("year-1"), url: "/analytics/admin/discipline" },
  { name: "useLibraryAnalytics", hook: () => analytics.useLibraryAnalytics(), url: "/analytics/admin/library" },
  { name: "useAttendanceAnalytics", hook: () => analytics.useAttendanceAnalytics("term-1"), url: "/analytics/admin/attendance" },
  { name: "useGradeDistribution", hook: () => analytics.useGradeDistribution("term-1"), url: "/analytics/admin/grade-distribution" },
  { name: "useEnrollment", hook: () => analytics.useEnrollment(), url: "/analytics/admin/enrollment" },
  { name: "useStudentProfile", hook: () => analytics.useStudentProfile("student-1"), url: "/analytics/student/student-1/profile" },
  { name: "useTeacherClassAnalytics", hook: () => analytics.useTeacherClassAnalytics("section-1", "term-1"), url: "/analytics/teacher/class/section-1" },
  { name: "useStudentAnalytics", hook: () => analytics.useStudentAnalytics("student-1", "term-1"), url: "/analytics/student/student-1" },
  { name: "useParentChildTrends", hook: () => analytics.useParentChildTrends("student-1", "year-1"), url: "/analytics/parent/child/student-1/trends" },
];


describe("use-analytics queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

