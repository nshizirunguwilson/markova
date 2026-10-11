import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessToken,
  beginSession,
  forgetTokens,
  isShared,
  keepTokens,
  refreshToken,
} from "./session";

/**
 * On somebody's own computer the sign in outlives the browser; on a shared
 * one it lives only until the browser closes (B5).
 */
describe("where the sign in is kept", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps an ordinary sign in where it survives closing the browser", () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: false });
    expect(localStorage.getItem("access_token")).toBe("a");
    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(isShared()).toBe(false);
    expect(accessToken()).toBe("a");
    expect(refreshToken()).toBe("r");
  });

  it("keeps a shared computer's sign in only until the browser closes", () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    expect(sessionStorage.getItem("access_token")).toBe("a");
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(isShared()).toBe(true);
    expect(accessToken()).toBe("a");
  });

  it("keeps a refreshed pair where the sign in already was", () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    keepTokens({ accessToken: "a2", refreshToken: "r2" });
    expect(sessionStorage.getItem("refresh_token")).toBe("r2");
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });

  it("leaves nothing of an earlier sign in behind when a new one begins", () => {
    localStorage.setItem("access_token", "old");
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("forgets everything, wherever it was", () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    localStorage.setItem("refresh_token", "stale");
    forgetTokens();
    expect(accessToken()).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(isShared()).toBe(false);
  });
});

describe("a browser that refuses storage", () => {
  it("reads nothing rather than failing", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(accessToken()).toBeNull();
      expect(isShared()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("on the server, where there is no browser", () => {
  it("holds no sign in, and forgetting is harmless", () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(isShared()).toBe(false);
      expect(accessToken()).toBeNull();
      expect(() => forgetTokens()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
