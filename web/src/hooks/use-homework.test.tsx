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

import * as homework from "./use-homework";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useHomeworks", hook: () => homework.useHomeworks({ classSectionId: "section-1" }), url: "/homework?" },
  { name: "useHomework", hook: () => homework.useHomework("hw-1"), url: "/homework/hw-1" },
  { name: "useStudentHomework", hook: () => homework.useStudentHomework("student-1", "section-1"), url: "/homework/student/student-1" },
];

const mutations: MutationCase[] = [
  { name: "useCreateHomework", hook: () => homework.useCreateHomework(), method: "post", url: "/homework" },
  { name: "useUpdateHomework", hook: () => homework.useUpdateHomework(), method: "put", url: "/homework/id-1" },
  { name: "useDeleteHomework", hook: () => homework.useDeleteHomework(), arg: "id-1", method: "delete", url: "/homework/id-1" },
  { name: "useSubmitHomework", hook: () => homework.useSubmitHomework(), method: "post", url: "/homework/submit" },
  { name: "useGradeSubmission", hook: () => homework.useGradeSubmission(), method: "put", url: "/homework/submissions/id-1/grade" },
];

describe("use-homework queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-homework mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});
