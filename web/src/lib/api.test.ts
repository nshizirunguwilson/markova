import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import api from "./api";
import { toast } from "sonner";

/** The rejection half of the response interceptor registered in api.ts. */
function responseErrorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = (api.interceptors.response as any).handlers;
  return handlers[0].rejected as (e: unknown) => Promise<unknown>;
}

const failure = (url: string, status = 401) => ({
  config: { url, headers: {} },
  response: { status },
});

describe("api response interceptor", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("lets a failed login surface its own error instead of faking a session expiry", async () => {
    // The whole reason AUTH_ENDPOINTS exists: a wrong password is a 401, and
    // treating it as an expired session reloads the page before the user can
    // read what went wrong.
    localStorage.setItem("refresh_token", "stale-token");

    await expect(
      responseErrorHandler()(failure("/auth/login"))
    ).rejects.toBeDefined();

    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    "/auth/login",
    "/auth/verify-otp",
    "/auth/refresh",
    "/auth/request-reset",
    "/auth/reset-password",
  ])("never hijacks %s", async (url) => {
    localStorage.setItem("refresh_token", "stale-token");
    await expect(responseErrorHandler()(failure(url))).rejects.toBeDefined();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("stays quiet on a 401 when nobody is logged in", async () => {
    // No refresh token: a public page hit a protected route. Route guards send
    // the user to /login; a redirect here would loop.
    await expect(
      responseErrorHandler()(failure("/users"))
    ).rejects.toBeDefined();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("passes non-401 errors straight through", async () => {
    localStorage.setItem("refresh_token", "t");
    await expect(
      responseErrorHandler()(failure("/users", 500))
    ).rejects.toBeDefined();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("api request interceptor", () => {
  beforeEach(() => localStorage.clear());

  function requestHandler() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers = (api.interceptors.request as any).handlers;
    return handlers[0].fulfilled;
  }

  it("attaches the stored access token", () => {
    localStorage.setItem("access_token", "abc123");
    const config = requestHandler()({ headers: {} });
    expect(config.headers.Authorization).toBe("Bearer abc123");
  });

  it("sends no Authorization header when signed out", () => {
    const config = requestHandler()({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });
});
