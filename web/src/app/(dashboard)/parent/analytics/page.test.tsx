import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/parent/analytics",
  useSearchParams: () => new URLSearchParams(),
}));

// The chart component draws to a canvas and is covered on its own. What this
// page owns is which child it is asked about.
vi.mock("@/components/student-performance", () => ({
  StudentPerformance: ({ studentId }: { studentId: string }) => (
    <div data-testid="performance">{studentId}</div>
  ),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import ParentAnalyticsPage from "./page";

/**
 * A parent looking at how their child is doing.
 *
 * The whole page hangs on one thing: which child. A parent with two children
 * must be able to switch, and a parent whose account was created without any
 * children linked has to be told that, rather than shown an empty chart.
 */

function link(id: string, first: string, last: string) {
  return { id: `ps-${id}`, student: { id, user: { firstName: first, lastName: last } } };
}

function routesFor(parentStudents: unknown[]) {
  return {
    ...populatedRoutes,
    "/users/user-1": { id: "user-1", role: "PARENT", parentStudents },
  };
}

const asParent = { role: "PARENT" as const, user: { id: "user-1" } };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

describe("a parent with one child", () => {
  beforeEach(() => {
    serve(h.api, routesFor([link("student-1", "Divine", "Niyonkuru")]));
  });

  it("opens on that child without asking", async () => {
    renderPage(ParentAnalyticsPage, asParent);
    await waitFor(() =>
      expect(screen.getByTestId("performance")).toHaveTextContent("student-1"),
    );
  });

  // One child means nothing to choose between.
  it("offers no child picker", async () => {
    renderPage(ParentAnalyticsPage, asParent);
    await waitFor(() => expect(screen.getByTestId("performance")).toBeInTheDocument());
    expect(screen.queryByLabelText(/child/i)).toBeNull();
  });

  it("asks for the parent's own record", async () => {
    renderPage(ParentAnalyticsPage, asParent);
    await waitFor(() =>
      expect(
        h.api.get.mock.calls.some(([url]) => String(url) === "/users/user-1"),
      ).toBe(true),
    );
  });
});

describe("a parent with more than one child", () => {
  beforeEach(() => {
    serve(
      h.api,
      routesFor([
        link("student-1", "Divine", "Niyonkuru"),
        link("student-2", "Keza", "Mutesi"),
      ]),
    );
  });

  it("offers a picker naming each child", async () => {
    renderPage(ParentAnalyticsPage, asParent);
    const picker = await waitFor(
      () => screen.getByLabelText(/child/i) as HTMLSelectElement,
    );
    const names = Array.from(picker.options).map((o) => o.textContent);
    expect(names).toContain("Divine Niyonkuru");
    expect(names).toContain("Keza Mutesi");
  });

  it("opens on the first child", async () => {
    renderPage(ParentAnalyticsPage, asParent);
    await waitFor(() =>
      expect(screen.getByTestId("performance")).toHaveTextContent("student-1"),
    );
  });

  // Switching has to change whose marks are shown, not just the label.
  it("switches to the other child", async () => {
    renderPage(ParentAnalyticsPage, asParent);
    const picker = await waitFor(
      () => screen.getByLabelText(/child/i) as HTMLSelectElement,
    );

    await act(async () => {
      fireEvent.change(picker, { target: { value: "student-2" } });
    });

    await waitFor(() =>
      expect(screen.getByTestId("performance")).toHaveTextContent("student-2"),
    );
  });
});

describe("a parent with nothing linked", () => {
  // This is the account that signs in to an empty dashboard. Saying so is the
  // difference between a bug report and a phone call to the school.
  it("says no children are linked", async () => {
    serve(h.api, routesFor([]));
    renderPage(ParentAnalyticsPage, asParent);

    await waitFor(() =>
      expect(screen.getByText(/no linked children/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("performance")).toBeNull();
  });

  it("says the same when the record cannot be loaded", async () => {
    serveFailure(h.api);
    renderPage(ParentAnalyticsPage, asParent);

    await waitFor(() =>
      expect(screen.getByText(/no linked children/i)).toBeInTheDocument(),
    );
  });

  it("does not go blank when the record comes back empty", async () => {
    serve(h.api, { ...populatedRoutes, "/users/user-1": {} });
    renderPage(ParentAnalyticsPage, asParent);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});
