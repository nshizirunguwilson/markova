import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertMutation,
  assertQuery,
  type MutationCase,
  type QueryCase,
} from "@/test/hooks";

const h = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));

import * as users from "./use-users";

const api = h.api;
beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

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

/**
 * What these hooks say when the server says nothing.
 *
 * A phone that loses signal mid-request produces an error with no response on
 * it at all, so `err.response.data.message` is undefined. Without a fallback
 * the toast would read "undefined", which is the worst possible thing to show
 * someone who has just filled in a twelve-field form.
 */
describe("use-users mutations on a dead connection", () => {
  const offline = () => {
    const error = Object.assign(new Error("Network Error"), {});
    for (const m of ["get", "post", "put", "patch", "delete"] as const) {
      api[m].mockRejectedValue(error);
    }
  };

  const cases = [
    { name: "useCreateUser", hook: () => users.useCreateUser(), arg: { name: "x" }, says: "Failed to create user" },
    { name: "useUpdateUser", hook: () => users.useUpdateUser(), arg: { id: "id-1", data: {} }, says: "Failed to update user" },
    { name: "useDeleteUser", hook: () => users.useDeleteUser(), arg: "id-1", says: "Failed to deactivate user" },
  ];

  it.each(cases)("$name says what failed rather than undefined", async (c) => {
    const { runMutation } = await import("@/test/hooks");
    offline();

    const result = await runMutation(c.hook, c.arg);

    expect(result.current.isError).toBe(true);
    expect(h.toast.error).toHaveBeenCalledWith(c.says);
  });

  it.each(cases)("$name repeats the server's own words when it has some", async (c) => {
    const { runMutation } = await import("@/test/hooks");
    const error = Object.assign(new Error("nope"), {
      response: { status: 409, data: { message: "That email is already taken" } },
    });
    for (const m of ["get", "post", "put", "patch", "delete"] as const) {
      api[m].mockRejectedValue(error);
    }

    await runMutation(c.hook, c.arg);

    expect(h.toast.error).toHaveBeenCalledWith("That email is already taken");
  });
});
