import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const offline = vi.hoisted(() => ({ clearPendingMarks: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/offline-db", () => offline);

import { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { beginSession, accessToken } from "./session";
import { signOut } from "./sign-out";

/**
 * Signing out ends the session on the server too, and leaves nothing of the
 * person in the browser. It used to forget the tokens here and leave the
 * session open on the server for a week.
 */
describe("signing out", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api.post.mockReset().mockResolvedValue({ data: {} });
    offline.clearPendingMarks.mockClear();
    useAuthStore.setState({ user: { id: "u" } as never, isAuthenticated: true });
  });

  it("names this computer's session to the server", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: false });
    await signOut();
    expect(api.post).toHaveBeenCalledWith(
      "/auth/logout",
      { refreshToken: "r" },
      { timeout: 5000 },
    );
    expect(accessToken()).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("asks for every session to end, when asked to sign out everywhere", async () => {
    beginSession({ accessToken: "a", refreshToken: "r" });
    await signOut(undefined, { everywhere: true });
    expect(api.post).toHaveBeenCalledWith(
      "/auth/logout",
      { everywhere: true },
      { timeout: 5000 },
    );
  });

  it("forgets everything even when the server cannot be reached", async () => {
    api.post.mockRejectedValue(new Error("offline"));
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    await signOut();
    expect(accessToken()).toBeNull();
  });

  it("drops every page it had loaded", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["marks"], [1, 2, 3]);
    beginSession({ accessToken: "a", refreshToken: "r" });
    await signOut(queryClient);
    expect(queryClient.getQueryData(["marks"])).toBeUndefined();
  });

  it("clears anything kept for offline on a shared computer, and nothing on one's own", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    await signOut();
    expect(offline.clearPendingMarks).toHaveBeenCalled();

    offline.clearPendingMarks.mockClear();
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: false });
    await signOut();
    expect(offline.clearPendingMarks).not.toHaveBeenCalled();
  });
});

describe("signing out when the offline queue will not clear", () => {
  it("still forgets the sign in", async () => {
    offline.clearPendingMarks.mockRejectedValueOnce(new Error("locked"));
    api.post.mockResolvedValue({ data: {} });
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    await signOut();
    expect(accessToken()).toBeNull();
  });
});

describe("signing out with nothing held", () => {
  it("names no session, and still tidies up", async () => {
    localStorage.clear();
    sessionStorage.clear();
    api.post.mockReset().mockResolvedValue({ data: {} });
    await signOut();
    expect(api.post).toHaveBeenCalledWith(
      "/auth/logout",
      { refreshToken: undefined },
      { timeout: 5000 },
    );
  });
});
