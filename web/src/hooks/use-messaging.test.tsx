import { beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * How far along an upload is. It matters here in a way it does not for a
 * logo: a video may be fifty megabytes, and fifty megabytes up a Rwandan
 * mobile line with no indication of progress reads as the app having hung.
 */
describe("uploading an attachment", () => {
  it("reports how far along it is", async () => {
    const { renderHook, waitFor } = await import("@testing-library/react");
    const { Providers } = await import("@/test/harness");

    api.post.mockImplementation(
      async (
        _url: string,
        _body: unknown,
        config: { onUploadProgress?: (e: unknown) => void },
      ) => {
        config.onUploadProgress?.({ loaded: 25, total: 100 });
        config.onUploadProgress?.({ loaded: 100, total: 100 });
        return { data: { fileUrl: "/uploads/a.pdf", fileName: "a.pdf", size: 4 } };
      },
    );

    const seen: number[] = [];
    const { result } = renderHook(() => messaging.useUploadAttachment(), {
      wrapper: Providers,
    });
    await result.current.mutateAsync({
      file: new File(["x"], "a.pdf", { type: "application/pdf" }),
      onProgress: (p) => seen.push(p),
    });

    await waitFor(() => expect(seen).toEqual([25, 100]));
  });

  // `total` is absent when the size is not known up front. Rare for a file,
  // but it has to leave the bar alone rather than dividing by nothing.
  it("leaves the bar alone when the size is not known", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { Providers } = await import("@/test/harness");

    api.post.mockImplementation(
      async (
        _url: string,
        _body: unknown,
        config: { onUploadProgress?: (e: unknown) => void },
      ) => {
        config.onUploadProgress?.({ loaded: 25 });
        return { data: { fileUrl: "/uploads/a.pdf", fileName: "a.pdf", size: 4 } };
      },
    );

    const seen: number[] = [];
    const { result } = renderHook(() => messaging.useUploadAttachment(), {
      wrapper: Providers,
    });
    await result.current.mutateAsync({
      file: new File(["x"], "a.pdf", { type: "application/pdf" }),
      onProgress: (p) => seen.push(p),
    });

    expect(seen).toEqual([]);
  });

  // A caller that does not care how far along it is.
  it("uploads perfectly well with nobody watching", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { Providers } = await import("@/test/harness");

    api.post.mockImplementation(
      async (
        _url: string,
        _body: unknown,
        config: { onUploadProgress?: (e: unknown) => void },
      ) => {
        config.onUploadProgress?.({ loaded: 50, total: 100 });
        return { data: { fileUrl: "/uploads/a.pdf", fileName: "a.pdf", size: 4 } };
      },
    );

    const { result } = renderHook(() => messaging.useUploadAttachment(), {
      wrapper: Providers,
    });
    const answer = await result.current.mutateAsync({
      file: new File(["x"], "a.pdf", { type: "application/pdf" }),
    });

    expect(answer.fileUrl).toBe("/uploads/a.pdf");
  });
});
