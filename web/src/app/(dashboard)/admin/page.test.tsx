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
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
// The chart library draws to a canvas jsdom does not have.
vi.mock("@/components/ui/echart", () => ({
  EChart: () => <div data-testid="chart" />,
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import AdminDashboard from "./page";

/**
 * The screen a head teacher opens first.
 *
 * The attendance figure is the one they act on. It comes from the admin
 * analytics endpoint rather than the register: the register is the Director
 * of Studies', and asking for it here was a guaranteed 403 that took the
 * whole page down with it.
 */

const attendance = (overall: Record<string, unknown> | null) => ({
  date: "2026-08-24",
  overall,
  sections: [],
});

const routes = {
  ...populatedRoutes,
  "/attendance/dashboard": attendance({
    totalStudents: 320,
    present: 280,
    late: 20,
    absent: 20,
    rate: 94,
  }),
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

function mount(over: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, ...over });
  renderPage(AdminDashboard, { role: "ADMIN" });
}

/**
 * The school's attendance, on the principal's dashboard.
 *
 * It used to come from the register, which is the Director of Studies'. The
 * guard refuses a principal that endpoint, and this page treated any failed
 * query as fatal - so the principal's own dashboard answered "Something went
 * wrong" and showed nothing at all. The figure now comes from the admin
 * analytics endpoint, which is theirs.
 */
describe("the school's attendance on the dashboard", () => {
  const withRate = (attendanceRate: unknown) => ({
    ...routes,
    "/analytics/admin/attendance": { attendanceRate, byDate: [] },
  });

  it("shows the rate the school actually has", async () => {
    mount(withRate(94));
    await waitFor(() =>
      expect(screen.getAllByText("94%").length).toBeGreaterThan(0),
    );
  });

  it("rounds it to a whole percent", async () => {
    mount(withRate(87.6));
    await waitFor(() =>
      expect(screen.getAllByText("88%").length).toBeGreaterThan(0),
    );
  });

  it("shows a dash before the figure arrives", async () => {
    mount({ "/analytics/admin/attendance": () => new Promise(() => {}) });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("shows a dash rather than NaN when nothing was recorded", async () => {
    mount(withRate(null));
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  /*
    The bug itself. The principal is refused the register by the API, and the
    dashboard used to treat that refusal as a reason to hide everything.
  */
  it("does not ask for the register at all", async () => {
    mount();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    const asked = h.api.get.mock.calls.map((c: unknown[]) => c[0]);
    expect(asked).not.toContain("/attendance/dashboard");
  });

  it("still shows the dashboard when a side panel is refused", async () => {
    mount({
      "/library/analytics": () => Promise.reject(new Error("Forbidden resource")),
    });
    await waitFor(() =>
      expect(document.body.textContent).not.toMatch(/Something went wrong/i),
    );
  });
});

describe("the headline counts", () => {
  it("draws a dash for a figure the API did not send", async () => {
    mount({ "/dashboard/stats": {} });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/undefined/);
  });
});

describe("a dashboard that will not load", () => {
  function fails() {
    const error = Object.assign(new Error("down"), {
      response: { status: 500, data: { message: "down" } },
    });
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      h.api[method].mockRejectedValue(error);
    }
  }

  it("says so and offers to try again", async () => {
    fails();
    renderPage(AdminDashboard, { role: "ADMIN" });

    expect(
      await screen.findByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it("asks the API again when Retry is pressed", async () => {
    fails();
    renderPage(AdminDashboard, { role: "ADMIN" });
    const retry = await screen.findByRole("button", { name: /retry/i });

    h.api.get.mockClear();
    await act(async () => {
      fireEvent.click(retry);
    });

    await waitFor(() => expect(h.api.get).toHaveBeenCalled());
  });
});
