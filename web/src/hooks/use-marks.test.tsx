import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  assertMutation,
  assertQuery,
  resolveAll,
  runMutation,
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
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));

import * as marks from "./use-marks";

const api = h.api;

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
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
  { name: "useConfirmReportCards", hook: () => marks.useConfirmReportCards(), method: "post", url: "/marks/report-cards/confirm" },
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

/**
 * What each of the three acts on a report card tells the person who did it.
 *
 * They are three different decisions with three different consequences, and
 * a line that says "saved" for all of them teaches somebody that the three
 * buttons are the same button.
 */
describe("what the desk is told", () => {
  it("says the principal can now issue, when a class is confirmed", async () => {
    resolveAll(api, {});
    await runMutation(() => marks.useConfirmReportCards(), {
      classSectionId: "section-1",
      termId: "term-1",
      isConfirmed: true,
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/principal can now issue/i),
    );
  });

  /*
    Handing a class back withdraws any card already issued from it, which is
    a consequence somebody is owed in the line rather than in a support call.
  */
  it("says what handing a class back cost", async () => {
    resolveAll(api, {});
    await runMutation(() => marks.useConfirmReportCards(), {
      classSectionId: "section-1",
      termId: "term-1",
      isConfirmed: false,
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/already issued are withdrawn/i),
    );
  });
});

/**
 * The draft.
 *
 * Fetched on demand rather than with the class: thirty drafts nobody asked
 * for is thirty round trips to answer a question the reviewer may not have.
 */
describe("drafting the comments", () => {
  it("asks for one child, for one term", async () => {
    resolveAll(api, { classTeacher: "a", headTeacher: "b" });
    await runMutation(() => marks.useSuggestComments(), {
      studentId: "student-1",
      termId: "term-1",
    });
    expect(api.get).toHaveBeenCalledWith(
      "/reports/term/student-1/comment-suggestions",
      expect.objectContaining({ params: { termId: "term-1" } }),
    );
  });

  it("hands back both drafts", async () => {
    resolveAll(api, { classTeacher: "the work", headTeacher: "the standing" });
    const out = await runMutation(() => marks.useSuggestComments(), {
      studentId: "student-1",
      termId: "term-1",
    });
    expect(out.current.data).toEqual({
      classTeacher: "the work",
      headTeacher: "the standing",
    });
  });

  // Nothing is written by asking for a draft.
  it("saves nothing", async () => {
    resolveAll(api, { classTeacher: "a", headTeacher: "b" });
    await runMutation(() => marks.useSuggestComments(), {
      studentId: "student-1",
      termId: "term-1",
    });
    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("says so when a draft cannot be written", async () => {
    api.get.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "That term has no marks in it." },
      },
    });
    await runMutation(() => marks.useSuggestComments(), {
      studentId: "student-1",
      termId: "term-1",
    });
    expect(h.toast.error).toHaveBeenCalledWith("That term has no marks in it.");
  });

  // Nothing useful comes back from a 500, so the shared line stands.
  it("falls back to the house sentence when the server says nothing", async () => {
    api.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });
    await runMutation(() => marks.useSuggestComments(), {
      studentId: "student-1",
      termId: "term-1",
    });
    expect(h.toast.error).toHaveBeenCalled();
  });
});
