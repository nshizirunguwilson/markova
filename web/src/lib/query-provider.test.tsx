import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createQueryClient } from "./query-provider";

/** Shaped the way axios rejects, which is what errorMessage inspects. */
const failure = (status = 500) =>
  Object.assign(new Error("boom"), {
    isAxiosError: true,
    response: { status, data: { message: "The server said no" } },
  });

let client: ReturnType<typeof createQueryClient>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  for (const m of Object.values(h.toast)) m.mockReset();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
});

describe("failed reads", () => {
  // Pages render `data ?? []`, so without this a failed load looks identical to
  // a school that has no records yet.
  it("passes on what the API said, when the API said something useful", async () => {
    renderHook(
      () => useQuery({ queryKey: ["a"], queryFn: () => Promise.reject(failure(400)) }),
      { wrapper },
    );
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.toast.error.mock.calls[0][0]).toContain("The server said no");
  });

  // A 500 body is for the logs, not for a teacher. They get told it failed.
  it("does not repeat a server error verbatim", async () => {
    renderHook(
      () => useQuery({ queryKey: ["a5"], queryFn: () => Promise.reject(failure(500)) }),
      { wrapper },
    );
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.toast.error.mock.calls[0][0]).not.toContain("The server said no");
  });

  it("says the server is unreachable rather than blaming the request", async () => {
    const offline = Object.assign(new Error("Network Error"), { isAxiosError: true });
    renderHook(
      () => useQuery({ queryKey: ["b"], queryFn: () => Promise.reject(offline) }),
      { wrapper },
    );
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.toast.error.mock.calls[0][0]).toMatch(/reach the server/i);
  });

  // A dashboard fires several queries at once; one dropped connection fails all
  // of them and six identical toasts add nothing.
  it("announces a burst of identical failures once", async () => {
    renderHook(
      () => {
        useQuery({ queryKey: ["c1"], queryFn: () => Promise.reject(failure()) });
        useQuery({ queryKey: ["c2"], queryFn: () => Promise.reject(failure()) });
        useQuery({ queryKey: ["c3"], queryFn: () => Promise.reject(failure()) });
        return null;
      },
      { wrapper },
    );
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 60));
    expect(h.toast.error).toHaveBeenCalledTimes(1);
  });

  // The axios interceptor owns the expired-session path, including the redirect.
  it("stays quiet on a 401, which the session handling already covers", async () => {
    renderHook(
      () => useQuery({ queryKey: ["d"], queryFn: () => Promise.reject(failure(401)) }),
      { wrapper },
    );
    await waitFor(() =>
      expect(client.getQueryState(["d"])?.status).toBe("error"),
    );
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  // An adult child keeping something private is said calmly by the page; a red
  // alert on top would say something had gone wrong.
  it("stays quiet when something is kept private", async () => {
    const kept = Object.assign(new Error("Forbidden"), {
      isAxiosError: true,
      response: {
        status: 403,
        data: { reason: "KEPT_PRIVATE", message: "Keza has chosen to keep their health visits private." },
      },
    });
    renderHook(
      () => useQuery({ queryKey: ["k"], queryFn: () => Promise.reject(kept), retry: false }),
      { wrapper },
    );
    await waitFor(() => expect(client.getQueryState(["k"])?.status).toBe("error"));
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  // A background refetch that fails still leaves usable data on screen.
  it("stays quiet when a refetch fails but data is already shown", async () => {
    client.setQueryData(["e"], [{ id: 1 }]);
    renderHook(
      () => useQuery({ queryKey: ["e"], queryFn: () => Promise.reject(failure()) }),
      { wrapper },
    );
    await waitFor(() =>
      expect(client.getQueryState(["e"])?.status).toBe("error"),
    );
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});

describe("failed writes", () => {
  it("reports a mutation that has no handler of its own", async () => {
    const { result } = renderHook(
      () => useMutation({ mutationFn: () => Promise.reject(failure()) }),
      { wrapper },
    );
    result.current.mutate(undefined);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  // The domain hooks already word their own failures, and two toasts for one
  // action is worse than one.
  it("leaves a mutation that reports its own failure alone", async () => {
    const own = vi.fn();
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: () => Promise.reject(failure()),
          onError: own,
        }),
      { wrapper },
    );
    result.current.mutate(undefined);
    await waitFor(() => expect(own).toHaveBeenCalled());
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});
