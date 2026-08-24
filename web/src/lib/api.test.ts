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

/**
 * The refresh path.
 *
 * The backend rotates refresh tokens and treats a second use of the same token
 * as a replay attack, deactivating the whole session. That makes single-flight
 * refresh a correctness requirement, not an optimisation: a dashboard fires
 * several queries at once, and if a expiring token means five parallel refresh
 * calls, four of them look like an attack and log the user out.
 */
describe("refreshing an expired session", () => {
  const axiosPost = vi.fn();
  const requestHandler = () => {
    const handlers = (api.interceptors.request as never as {
      handlers: Array<{ fulfilled: (c: unknown) => unknown }>;
    }).handlers;
    return handlers[0].fulfilled;
  };

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    axiosPost.mockReset();

    const axios = (await import("axios")).default;
    vi.spyOn(axios, "post").mockImplementation(axiosPost as never);
  });

  it("attaches the stored token to every outgoing request", () => {
    localStorage.setItem("access_token", "the-token");
    const config = requestHandler()({ headers: {} }) as {
      headers: Record<string, string>;
    };
    expect(config.headers.Authorization).toBe("Bearer the-token");
  });

  it("sends no authorization header when signed out", () => {
    const config = requestHandler()({ headers: {} }) as {
      headers: Record<string, string>;
    };
    expect(config.headers.Authorization).toBeUndefined();
  });

  it("does not try to refresh when there is no refresh token", async () => {
    await expect(responseErrorHandler()(failure("/users"))).rejects.toBeDefined();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("stores both rotated tokens after a successful refresh", async () => {
    localStorage.setItem("refresh_token", "old-refresh");
    axiosPost.mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
    });

    await responseErrorHandler()(failure("/users")).catch(() => undefined);

    expect(localStorage.getItem("access_token")).toBe("new-access");
    expect(localStorage.getItem("refresh_token")).toBe("new-refresh");
  });

  // The one that matters. Five queries hitting 401 together must produce one
  // refresh, or the backend sees four replays and ends the session.
  it("refreshes once for a burst of parallel failures", async () => {
    localStorage.setItem("refresh_token", "old-refresh");
    let resolveRefresh: (v: unknown) => void = () => {};
    axiosPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const handler = responseErrorHandler();
    const inflight = [
      handler(failure("/users")),
      handler(failure("/marks")),
      handler(failure("/attendance")),
    ].map((p) => p.catch(() => undefined));

    resolveRefresh({
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
    });
    await Promise.all(inflight);

    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it("ends the session when the API rejects the refresh", async () => {
    localStorage.setItem("access_token", "old-access");
    localStorage.setItem("refresh_token", "spent-refresh");
    const rejection = Object.assign(new Error("Unauthorized"), {
      isAxiosError: true,
      response: { status: 401, data: {} },
    });
    axiosPost.mockRejectedValue(rejection);

    await responseErrorHandler()(failure("/users")).catch(() => undefined);

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("session has expired"),
    );
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });

  // A dropped connection is not an expired session. Throwing the tokens away
  // for a network blip would sign a teacher out every time the wifi wobbles.
  it("keeps the tokens when the refresh never reached the server", async () => {
    localStorage.setItem("access_token", "old-access");
    localStorage.setItem("refresh_token", "still-good");
    axiosPost.mockRejectedValue(
      Object.assign(new Error("Network Error"), { isAxiosError: true }),
    );

    await responseErrorHandler()(failure("/users")).catch(() => undefined);

    expect(localStorage.getItem("refresh_token")).toBe("still-good");
    expect(toast.error).not.toHaveBeenCalled();
  });

  // Retrying forever would spin if the new token is refused too.
  it("retries a failed request only once", async () => {
    localStorage.setItem("refresh_token", "old-refresh");
    axiosPost.mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
    });

    const alreadyRetried = {
      config: { url: "/users", headers: {}, _retry: true },
      response: { status: 401 },
    };
    await expect(responseErrorHandler()(alreadyRetried)).rejects.toBeDefined();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("passes a non-401 straight through without refreshing", async () => {
    localStorage.setItem("refresh_token", "old-refresh");
    await expect(
      responseErrorHandler()(failure("/users", 500)),
    ).rejects.toBeDefined();
    expect(axiosPost).not.toHaveBeenCalled();
  });
});

/**
 * The corners of the interceptors.
 *
 * A rejected request never reaches the server, a failure with no config at all
 * arrives when axios itself throws, and a non-401 has to pass straight through
 * rather than triggering a refresh.
 */
describe("failures that are not an expired session", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("passes a server error straight through", async () => {
    localStorage.setItem("refresh_token", "good");
    await expect(
      responseErrorHandler()(failure("/users", 500)),
    ).rejects.toBeTruthy();

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("passes a forbidden through without ending the session", async () => {
    localStorage.setItem("refresh_token", "good");
    await expect(
      responseErrorHandler()(failure("/users", 403)),
    ).rejects.toBeTruthy();

    expect(localStorage.getItem("refresh_token")).toBe("good");
  });

  it("copes with a failure that carries no request config at all", async () => {
    // axios throws this shape when a request is aborted before it is sent.
    await expect(
      responseErrorHandler()({ message: "Network Error" }),
    ).rejects.toBeTruthy();
  });

  it("does not retry a request that has already been retried once", async () => {
    localStorage.setItem("refresh_token", "good");
    const already = {
      config: { url: "/users", headers: {}, _retry: true },
      response: { status: 401 },
    };

    await expect(responseErrorHandler()(already)).rejects.toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("the request interceptor's own rejection path", () => {
  it("passes a request that never left the browser straight through", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers = (api.interceptors.request as any).handlers;
    const rejected = handlers[0].rejected as (e: unknown) => Promise<unknown>;

    await expect(rejected(new Error("no network"))).rejects.toThrow("no network");
  });
});
