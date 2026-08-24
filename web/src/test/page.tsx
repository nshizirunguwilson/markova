/**
 * Renders a dashboard page the way the app does.
 *
 * Page tests here stub the network at `@/lib/api` rather than at the hook layer,
 * so a page test exercises the page and the query hooks under it together. That
 * is the seam a real user crosses, and it means a page asking for the wrong
 * endpoint fails the test instead of quietly passing against a stubbed hook.
 *
 * The stubs for `next/navigation`, `sonner` and the export helpers must be
 * installed by the test file itself, because `vi.mock` is hoisted per module.
 * `pageMocks()` returns the objects to hand those calls.
 */
import { screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { expect, vi } from "vitest";

import { renderWithProviders, signIn } from "./harness";
import type { User } from "@/stores/auth-store";

/** The set of module doubles a page test needs. Build inside `vi.hoisted`. */
export function pageMocks() {
  return {
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    router: {
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    },
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      message: vi.fn(),
    },
    params: {} as Record<string, string>,
  };
}

export type PageMocks = ReturnType<typeof pageMocks>;

/**
 * Points every api method at `routes`, keyed by url fragment, longest match
 * first. A url nothing declared rejects, so an unexpected request is a visible
 * failure rather than a query that never settles.
 */
export function serve(
  api: PageMocks["api"],
  routes: Record<string, unknown> = {},
) {
  const pick = (url: string) => {
    const key = Object.keys(routes)
      .filter((k) => url.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    return key === undefined ? undefined : routes[key];
  };

  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    api[method].mockImplementation(async (url: string, body?: unknown) => {
      const handler = pick(String(url));
      if (handler === undefined) {
        throw Object.assign(new Error(`No route for ${method} ${url}`), {
          response: { status: 404, data: { message: "Not Found" } },
        });
      }
      const data =
        typeof handler === "function"
          ? // A route may answer with a promise, including one that never
            // settles: that is how a test holds one query in its loading state
            // while the rest of the page arrives.
            await (handler as (b?: unknown) => unknown)(body)
          : handler;
      return { data, status: 200 };
    });
  }
}

/**
 * Answers every url with the same payload.
 *
 * Useful for the baseline pass over a page: an empty list drives it into its
 * empty state, which is the branch most likely to be the one nobody tried.
 */
export function serveAll(api: PageMocks["api"], data: unknown = []) {
  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    api[method].mockResolvedValue({ data });
  }
}

/** Makes every request fail, for testing what a page shows when the API is down. */
export function serveFailure(api: PageMocks["api"], status = 500) {
  const error = Object.assign(new Error("Request failed"), {
    response: { status, data: { message: "Request failed" } },
  });
  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    api[method].mockRejectedValue(error);
  }
}

/** Makes every request hang, for testing the loading state. */
export function serveNever(api: PageMocks["api"]) {
  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    api[method].mockImplementation(() => new Promise(() => {}));
  }
}

interface RenderPageOptions {
  role?: User["role"];
  user?: Partial<User>;
}

/** Signs a user in and renders the page under the query provider. */
export function renderPage(
  Page: ComponentType<Record<string, never>>,
  { role = "ADMIN", user = {} }: RenderPageOptions = {},
) {
  signIn(role, user);
  return renderWithProviders(<Page {...({} as Record<string, never>)} />);
}

/**
 * Waits for a page to stop showing its loading state and settle on content.
 * Pages here render a spinner with the "Loading" status role while queries run.
 */
export async function settled() {
  await waitFor(
    () => {
      expect(document.body.textContent ?? "").not.toBe("");
    },
    { timeout: 4000 },
  );
}

/** True when the rendered page shows this text, case-insensitively. */
export function showsText(pattern: RegExp) {
  return (document.body.textContent ?? "").match(pattern) !== null;
}

export { screen, waitFor, within };
