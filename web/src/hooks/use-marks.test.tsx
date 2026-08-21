import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  assertMutation,
  assertQuery,
  resolveAll,
  type MutationCase,
  type QueryCase,
} from "@/test/hooks";
import { Providers } from "@/test/harness";

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

import * as marks from "./use-marks";

const api = h.api;

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
});

const queries: QueryCase[] = [
  { name: "useMarks", hook: () => marks.useMarks({ classSectionId: "section-1", termId: "term-1" }), url: "/marks?" },
  { name: "useMarksCompletion", hook: () => marks.useMarksCompletion("section-1", "term-1", "subject-1", "assess-1"), url: "/marks/completion" },
  { name: "useTermResults", hook: () => marks.useTermResults("section-1", "term-1"), url: "/marks/term-results/class" },
  { name: "useStudentTermResult", hook: () => marks.useStudentTermResult("student-1", "term-1"), url: "/marks/term-results/student/student-1" },
  { name: "useYearResults", hook: () => marks.useYearResults("section-1", "year-1"), url: "/marks/year-results/class" },
  { name: "useStudentYearResult", hook: () => marks.useStudentYearResult("student-1", "year-1"), url: "/marks/year-results/student/student-1" },
  { name: "useReportCard", hook: () => marks.useReportCard("student-1", "term-1"), url: "/marks/report-card/student-1" },
];

const mutations: MutationCase[] = [
  { name: "useCreateMark", hook: () => marks.useCreateMark(), method: "post", url: "/marks" },
  { name: "useUpdateMark", hook: () => marks.useUpdateMark(), method: "put", url: "/marks/id-1" },
  { name: "useBatchMarks", hook: () => marks.useBatchMarks(), method: "post", url: "/marks/batch" },
  { name: "useCalculateTermResults", hook: () => marks.useCalculateTermResults(), method: "post", url: "/marks/term-results/calculate" },
  { name: "usePublishTermResults", hook: () => marks.usePublishTermResults(), method: "post", url: "/marks/term-results/publish" },
  { name: "useUpdateTermResultComment", hook: () => marks.useUpdateTermResultComment(), method: "put", url: "/marks/term-results/id-1/comment" },
  { name: "useCalculateYearResults", hook: () => marks.useCalculateYearResults(), method: "post", url: "/marks/year-results/calculate" },
];

describe("use-marks queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-marks mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});

// Several of these deliberately stay idle until they have everything they need,
// so a half-filled filter bar does not fire a request the API would reject.
describe("use-marks enabled guards", () => {
  it("useMarks waits for a term", async () => {
    resolveAll(api, []);
    const { result } = renderHook(() => marks.useMarks({ classSectionId: "s1" }), {
      wrapper: Providers,
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("useMarksCompletion waits for all four filters", async () => {
    resolveAll(api, []);
    const { result } = renderHook(
      () => marks.useMarksCompletion("section-1", "term-1"),
      { wrapper: Providers },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("useStudentTermResult waits for both ids", async () => {
    resolveAll(api, []);
    const { result } = renderHook(() => marks.useStudentTermResult("student-1"), {
      wrapper: Providers,
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
