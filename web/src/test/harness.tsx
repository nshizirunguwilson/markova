/**
 * The shared rig for component and page tests.
 *
 * Pages here are client components that pull data through TanStack Query and a
 * shared axios instance, and read the signed-in user from a Zustand store.
 * Testing one in isolation therefore means standing up three things every time.
 * Doing that per file drifted immediately, so it lives here once.
 *
 * Nothing in here talks to a network. `mockApi` replaces the axios instance and
 * every test declares the responses it expects to need.
 */
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { vi, type Mock } from "vitest";

import { useAuthStore, type User } from "@/stores/auth-store";

/** A query client that fails fast and never retries, so tests stay quick. */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Providers, ...options });
}

// ─── Users ──────────────────────────────────────────────────────────────────

const BASE_USER: User = {
  id: "user-1",
  email: "aline.uwase@markova.edu",
  phone: null,
  role: "ADMIN",
  firstName: "Aline",
  lastName: "Uwase",
  photoUrl: null,
  forcePasswordChange: false,
};

/** A signed-in user of the given role, already in the auth store. */
export function signIn(role: User["role"] = "ADMIN", overrides: Partial<User> = {}) {
  const user: User = { ...BASE_USER, role, ...overrides };
  useAuthStore.setState({ user, isAuthenticated: true, isLoading: false });
  return user;
}

export function signOut() {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
}

// ─── API ────────────────────────────────────────────────────────────────────

type Handler = unknown | ((config?: unknown) => unknown);

/**
 * Routes a request to the first handler whose key is a substring of the url.
 * Keys are matched longest-first so `/marks/term-results` wins over `/marks`.
 */
function resolve(routes: Record<string, Handler>, url: string) {
  const key = Object.keys(routes)
    .filter((k) => url.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return key === undefined ? undefined : routes[key];
}

type ApiCall = (url: string, body?: unknown) => Promise<{ data: unknown; status: number }>;

export interface MockApi {
  get: Mock<ApiCall>;
  post: Mock<ApiCall>;
  patch: Mock<ApiCall>;
  put: Mock<ApiCall>;
  delete: Mock<ApiCall>;
}

/**
 * Builds a stand-in for `@/lib/api`.
 *
 * `routes` maps a url fragment to the `data` the call should resolve with, or
 * to a function for anything dynamic. A url with no matching route rejects the
 * way axios does, so a page asking for something the test did not anticipate
 * fails loudly instead of hanging on a pending promise.
 */
export function mockApi(routes: Record<string, Handler> = {}): MockApi {
  const respond = (method: string) =>
    vi.fn(async (url: string, body?: unknown) => {
      const handler = resolve(routes, url);
      if (handler === undefined) {
        const error = Object.assign(
          new Error(`No mock route for ${method.toUpperCase()} ${url}`),
          { response: { status: 404, data: { message: "Not Found" } } },
        );
        throw error;
      }
      const data =
        typeof handler === "function"
          ? (handler as (b?: unknown) => unknown)(body)
          : handler;
      return { data, status: 200 };
    });

  return {
    get: respond("get"),
    post: respond("post"),
    patch: respond("patch"),
    put: respond("put"),
    delete: respond("delete"),
  };
}

/** An axios-shaped rejection, for testing the unhappy path. */
export function apiError(status = 500, message = "Something went wrong") {
  return Object.assign(new Error(message), {
    response: { status, data: { message } },
    isAxiosError: true,
  });
}

// ─── Fixtures ───────────────────────────────────────────────────────────────
//
// Rwandan, matching the demo seed. Shared so a name change lands everywhere.

export const fixtures = {
  academicYear: { id: "year-1", name: "2026-2027", isActive: true },
  term: { id: "term-1", name: "Term 1", academicYearId: "year-1", isActive: true },
  level: { id: "level-1", name: "Senior 1", stage: "O_LEVEL" },
  section: { id: "section-1", name: "Senior 1 A", levelId: "level-1", capacity: 40 },
  subject: { id: "subject-1", name: "Mathematics", code: "MATH", credits: 4 },
  student: {
    id: "student-1",
    userId: "user-2",
    studentIdNumber: "STD-2026-001",
    classSectionId: "section-1",
    user: {
      id: "user-2",
      firstName: "Divine",
      lastName: "Niyonkuru",
      email: "student1@markova.edu",
      photoUrl: null,
    },
  },
  teacher: {
    id: "teacher-1",
    userId: "user-3",
    user: {
      id: "user-3",
      firstName: "Aline",
      lastName: "Uwase",
      email: "aline.uwase@markova.edu",
      photoUrl: null,
    },
  },
};
