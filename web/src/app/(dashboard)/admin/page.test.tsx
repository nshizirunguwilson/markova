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
 * "Attendance Today" is the number they act on, and it is computed here from
 * what the attendance endpoint returns. Reading the wrong field made it show
 * 0% every day of the year, which is why every arm of it is pinned below.
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

describe("today's attendance on the dashboard", () => {
  it("shows the rate the school actually has", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getAllByText("94%").length).toBeGreaterThan(0),
    );
  });

  it("counts late students as in school", async () => {
    // No rate from the server, so it is worked out here: 300 of 320.
    mount({
      "/attendance/dashboard": attendance({
        totalStudents: 320,
        present: 280,
        late: 20,
        absent: 20,
      }),
    });

    await waitFor(() =>
      expect(screen.getAllByText("94%").length).toBeGreaterThan(0),
    );
  });

  it("counts a school where nobody was late", async () => {
    mount({
      "/attendance/dashboard": attendance({
        totalStudents: 100,
        present: 90,
        absent: 10,
      }),
    });

    await waitFor(() =>
      expect(screen.getAllByText("90%").length).toBeGreaterThan(0),
    );
  });

  it("counts a school where the present figure never arrived", async () => {
    mount({
      "/attendance/dashboard": attendance({ totalStudents: 100, late: 5 }),
    });

    // Only the latecomers are accounted for, and the sum is still a number.
    await waitFor(() =>
      expect(screen.getAllByText("5%").length).toBeGreaterThan(0),
    );
  });

  it("shows an em dash before the figures arrive", async () => {
    mount({ "/attendance/dashboard": () => new Promise(() => {}) });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows an em dash when nothing was recorded today", async () => {
    mount({ "/attendance/dashboard": attendance(null) });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows nought rather than dividing by nothing on an empty school", async () => {
    mount({
      "/attendance/dashboard": attendance({
        totalStudents: 0,
        present: 0,
        late: 0,
        absent: 0,
      }),
    });

    await waitFor(() =>
      expect(screen.getAllByText("0%").length).toBeGreaterThan(0),
    );
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});

describe("the headline counts", () => {
  it("draws an em dash for a figure the API did not send", async () => {
    mount({ "/dashboard/stats": {} });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
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
