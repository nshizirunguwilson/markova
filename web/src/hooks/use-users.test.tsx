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

import * as users from "./use-users";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useUsers (no filters)", hook: () => users.useUsers(), url: "/users?" },
  { name: "useUsers (filtered)", hook: () => users.useUsers({ role: "TEACHER", search: "uwase" }), url: "role=TEACHER" },
  { name: "useUser", hook: () => users.useUser("user-1"), url: "/users/user-1" },
];

const mutations: MutationCase[] = [
  { name: "useCreateUser", hook: () => users.useCreateUser(), method: "post", url: "/users" },
  { name: "useUpdateUser", hook: () => users.useUpdateUser(), method: "put", url: "/users/id-1" },
  { name: "useDeleteUser", hook: () => users.useDeleteUser(), arg: "id-1", method: "delete", url: "/users/id-1" },
  { name: "useBulkImport", hook: () => users.useBulkImport(), method: "post", url: "/users/bulk-import" },
];

describe("use-users queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-users mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});
