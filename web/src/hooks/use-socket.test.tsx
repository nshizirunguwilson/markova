import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: () => ({ connect: h.connect, disconnect: h.disconnect }),
}));

import { renderHook } from "@testing-library/react";
import { Providers, signIn, signOut } from "@/test/harness";
import { useSocketConnection } from "./use-socket";

beforeEach(() => {
  h.connect.mockReset();
  h.disconnect.mockReset();
  localStorage.clear();
  signOut();
});

/**
 * The realtime connection is opened once a user is signed in and closed when
 * they leave. Opening it without a token, or leaving it open after sign out,
 * are both ways to end up with a socket authenticating as the wrong person.
 */
describe("the chat socket", () => {
  it("does not connect for a signed-out visitor", () => {
    renderHook(() => useSocketConnection(), { wrapper: Providers });
    expect(h.connect).not.toHaveBeenCalled();
  });

  it("does not connect when the user is known but the token is gone", () => {
    signIn("TEACHER");
    renderHook(() => useSocketConnection(), { wrapper: Providers });
    expect(h.connect).not.toHaveBeenCalled();
  });

  it("connects with the stored token and the user's id", () => {
    localStorage.setItem("access_token", "the-token");
    const user = signIn("TEACHER");
    renderHook(() => useSocketConnection(), { wrapper: Providers });

    expect(h.connect).toHaveBeenCalledTimes(1);
    const [token, , userId] = h.connect.mock.calls[0];
    expect(token).toBe("the-token");
    expect(userId).toBe(user.id);
  });

  it("closes the socket when the component goes away", () => {
    localStorage.setItem("access_token", "the-token");
    signIn("TEACHER");
    const { unmount } = renderHook(() => useSocketConnection(), { wrapper: Providers });
    unmount();
    expect(h.disconnect).toHaveBeenCalled();
  });

  it("opens one socket, not one per render", () => {
    localStorage.setItem("access_token", "the-token");
    signIn("TEACHER");
    const { rerender } = renderHook(() => useSocketConnection(), { wrapper: Providers });
    rerender();
    rerender();
    expect(h.connect).toHaveBeenCalledTimes(1);
  });
});
