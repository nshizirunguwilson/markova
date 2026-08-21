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

import * as notifications from "./use-notifications";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useNotifications", hook: () => notifications.useNotifications(), url: "/notifications" },
  { name: "useUnreadCount", hook: () => notifications.useUnreadCount(), url: "/notifications/unread" },
];

const mutations: MutationCase[] = [
  { name: "useMarkRead", hook: () => notifications.useMarkRead(), arg: "note-1", method: "put", url: "/notifications/note-1/read" },
  { name: "useMarkAllRead", hook: () => notifications.useMarkAllRead(), method: "put", url: "/notifications/read-all" },
];

describe("use-notifications queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-notifications mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});
