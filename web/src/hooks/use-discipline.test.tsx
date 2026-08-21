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

import * as discipline from "./use-discipline";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useIncidents", hook: () => discipline.useIncidents({ termId: "term-1" }), url: "/discipline/incidents?" },
  { name: "useIncident", hook: () => discipline.useIncident("inc-1"), url: "/discipline/incidents/inc-1" },
  { name: "useStudentDiscipline", hook: () => discipline.useStudentDiscipline("student-1"), url: "/discipline/student/student-1" },
  { name: "usePendingAppeals", hook: () => discipline.usePendingAppeals(), url: "/discipline/appeals/pending" },
  { name: "useDisciplineDashboard", hook: () => discipline.useDisciplineDashboard("term-1"), url: "/discipline/dashboard" },
];

const mutations: MutationCase[] = [
  { name: "useCreateIncident", hook: () => discipline.useCreateIncident(), method: "post", url: "/discipline/incidents" },
  { name: "useDeleteIncident", hook: () => discipline.useDeleteIncident(), arg: "id-1", method: "delete", url: "/discipline/incidents/id-1" },
  { name: "useCreateAppeal", hook: () => discipline.useCreateAppeal(), method: "post", url: "/discipline/appeals" },
  { name: "useReviewAppeal", hook: () => discipline.useReviewAppeal(), method: "put", url: "/discipline/appeals/id-1/review" },
  { name: "useAcknowledgeIncident", hook: () => discipline.useAcknowledgeIncident(), arg: "inc-1", method: "post", url: "/discipline/acknowledge" },
];

describe("use-discipline queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-discipline mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});
