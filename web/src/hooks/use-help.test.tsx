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

import * as help from "./use-help";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useFaqs", hook: () => help.useFaqs("fees"), url: "/help/faqs" },
  { name: "useFaqsAdmin", hook: () => help.useFaqsAdmin(), url: "/help/faqs/admin" },
  { name: "useTickets", hook: () => help.useTickets("OPEN"), url: "/help/tickets" },
  { name: "useMyTickets", hook: () => help.useMyTickets(), url: "/help/tickets/mine" },
];

const mutations: MutationCase[] = [
  { name: "useCreateFaq", hook: () => help.useCreateFaq(), method: "post", url: "/help/faqs" },
  { name: "useUpdateFaq", hook: () => help.useUpdateFaq(), method: "patch", url: "/help/faqs/id-1" },
  { name: "useDeleteFaq", hook: () => help.useDeleteFaq(), arg: "id-1", method: "delete", url: "/help/faqs/id-1" },
  { name: "useCreateTicket", hook: () => help.useCreateTicket(), method: "post", url: "/help/tickets" },
  { name: "useUpdateTicketStatus", hook: () => help.useUpdateTicketStatus(), arg: { id: "id-1", status: "CLOSED" }, method: "patch", url: "/help/tickets/id-1/status" },
];

describe("use-help queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-help mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});
