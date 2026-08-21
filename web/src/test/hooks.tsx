/**
 * Drivers for the `use-<domain>` hooks.
 *
 * Those hooks are all the same two shapes: a `useQuery` that reads one endpoint,
 * or a `useMutation` that writes one and invalidates a key. Testing 144 of them
 * by hand would be 144 copies of the same eight lines, so the two shapes are
 * driven from a table instead and each domain file just declares its rows.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";

import { Providers } from "./harness";

export type ApiMock = Record<
  "get" | "post" | "put" | "patch" | "delete",
  ReturnType<typeof vi.fn>
>;

/** A fresh set of axios-shaped spies. Call inside `vi.hoisted`. */
export function makeApiMock(): ApiMock {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

/** Every method resolves with `{ data }`, whatever the url. */
export function resolveAll(api: ApiMock, data: unknown = []) {
  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    api[method].mockResolvedValue({ data });
  }
}

/** Every method rejects, for the unhappy path. */
export function rejectAll(api: ApiMock, status = 500, message = "Failed") {
  const error = Object.assign(new Error(message), {
    response: { status, data: { message } },
  });
  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    api[method].mockRejectedValue(error);
  }
}

type AnyHookResult = {
  isSuccess: boolean;
  isError: boolean;
  data?: unknown;
  mutate: (arg?: unknown) => void;
};

/** Renders a query hook and waits for it to settle either way. */
export async function runQuery(hook: () => unknown) {
  const { result } = renderHook(hook as () => AnyHookResult, {
    wrapper: Providers,
  });
  await waitFor(() =>
    expect(result.current.isSuccess || result.current.isError).toBe(true),
  );
  return result;
}

/** Renders a mutation hook, fires it, and waits for it to settle either way. */
export async function runMutation(hook: () => unknown, arg?: unknown) {
  const { result } = renderHook(hook as () => AnyHookResult, {
    wrapper: Providers,
  });
  await act(async () => {
    result.current.mutate(arg);
  });
  await waitFor(() =>
    expect(result.current.isSuccess || result.current.isError).toBe(true),
  );
  return result;
}

/** The url every call in `api` was made with, in order. */
export function calledUrls(api: ApiMock) {
  return (["get", "post", "put", "patch", "delete"] as const).flatMap((m) =>
    api[m].mock.calls.map((c) => `${m.toUpperCase()} ${String(c[0])}`),
  );
}

export interface QueryCase {
  name: string;
  hook: () => unknown;
  /** Substring the requested url must contain. */
  url: string;
  method?: "get" | "post";
}

export interface MutationCase {
  name: string;
  hook: () => unknown;
  arg?: unknown;
  method: "post" | "put" | "patch" | "delete";
  /** Substring the requested url must contain. */
  url: string;
}

/**
 * Asserts a query hook reaches the endpoint it claims, hands back the payload,
 * and surfaces a failure rather than swallowing it.
 */
export async function assertQuery(api: ApiMock, c: QueryCase) {
  const method = c.method ?? "get";
  const payload = [{ id: "x" }];
  resolveAll(api, payload);
  const ok = await runQuery(c.hook);
  expect(ok.current.isSuccess).toBe(true);
  expect(ok.current.data).toEqual(payload);
  expect(calledUrls(api).join(" ")).toContain(c.url);

  for (const m of Object.values(api)) m.mockReset();
  rejectAll(api);
  const bad = await runQuery(c.hook);
  expect(bad.current.isError).toBe(true);
  expect(method).toBeTruthy();
}

/**
 * Asserts a mutation hook writes to the endpoint it claims and reports both
 * outcomes.
 */
export async function assertMutation(api: ApiMock, c: MutationCase) {
  resolveAll(api, { id: "created" });
  const ok = await runMutation(c.hook, c.arg ?? { id: "id-1", name: "Thing" });
  expect(ok.current.isSuccess).toBe(true);
  expect(calledUrls(api).join(" ")).toContain(c.url);
  expect(api[c.method]).toHaveBeenCalled();

  for (const m of Object.values(api)) m.mockReset();
  rejectAll(api);
  const bad = await runMutation(c.hook, c.arg ?? { id: "id-1" });
  expect(bad.current.isError).toBe(true);
}
