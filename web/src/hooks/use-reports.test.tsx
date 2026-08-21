import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertMutation,
  assertQuery,
  resolveAll,
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

import * as reports from "./use-reports";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useTermReport", hook: () => reports.useTermReport("student-1", "term-1"), url: "/reports/term/student-1" },
  { name: "useYearReport", hook: () => reports.useYearReport("student-1", "year-1"), url: "/reports/year/student-1" },
  { name: "useIdCard", hook: () => reports.useIdCard("student-1"), url: "/reports/id-card/student-1" },
  { name: "useIdCardRegistry", hook: () => reports.useIdCardRegistry({}), url: "/reports/id-cards/registry" },
];

const mutations: MutationCase[] = [
  { name: "useGenerateClassReports", hook: () => reports.useGenerateClassReports(), method: "post", url: "/reports/term/class" },
  { name: "useGenerateDocument", hook: () => reports.useGenerateDocument(), method: "post", url: "/reports/document" },
  { name: "useBulkIdCards", hook: () => reports.useBulkIdCards(), method: "post", url: "/reports/id-cards/bulk" },
  { name: "useIssueIdCard", hook: () => reports.useIssueIdCard(), method: "post", url: "/reports/id-cards/issue" },
  { name: "useIssueBulkIdCards", hook: () => reports.useIssueBulkIdCards(), method: "post", url: "/reports/id-cards/issue-bulk" },
  { name: "useRevokeIdCard", hook: () => reports.useRevokeIdCard(), method: "post", url: "/reports/id-cards/revoke" },
];

describe("use-reports queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-reports mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});

// Fetched on demand behind a button, never on mount, because rendering a whole
// report card is expensive and most visits never ask for one.
describe("use-reports lazy queries", () => {
  it("useTermReportHtml stays idle until it is asked for", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { Providers } = await import("@/test/harness");
    resolveAll(api, "<html></html>");
    const { result } = renderHook(() => reports.useTermReportHtml("student-1", "term-1"), { wrapper: Providers });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });
});
