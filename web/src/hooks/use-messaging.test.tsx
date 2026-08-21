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

import * as messaging from "./use-messaging";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useContacts", hook: () => messaging.useContacts("uwase"), url: "/messaging/contacts" },
  { name: "useConversations", hook: () => messaging.useConversations(), url: "/messaging/conversations" },
  { name: "useMessages", hook: () => messaging.useMessages("conv-1"), url: "/messaging/conversations/conv-1/messages" },
  { name: "useUnreadMessageCount", hook: () => messaging.useUnreadMessageCount(), url: "/messaging/unread" },
];

const mutations: MutationCase[] = [
  { name: "useCreateConversation", hook: () => messaging.useCreateConversation(), method: "post", url: "/messaging/conversations" },
  { name: "useSendMessage", hook: () => messaging.useSendMessage(), method: "post", url: "/messaging/messages" },
  { name: "useMarkRead", hook: () => messaging.useMarkRead(), arg: "conv-1", method: "post", url: "/messaging/read" },
];

describe("use-messaging queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-messaging mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});
