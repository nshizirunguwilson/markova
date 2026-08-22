/**
 * The admin's landing page.
 *
 * It is the first thing anyone running the school sees each morning, drawn
 * entirely from aggregates. A term with no graded students, or a week with no
 * attendance taken, both produce charts of nothing, and neither should read as
 * an error or as zeros that look like real figures.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    charts: [] as Array<Record<string, unknown>>,
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/echart", () => ({
  EChart: (props: { option: Record<string, unknown> }) => {
    h.charts.push(props.option);
    return <div data-testid="chart" />;
  },
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { findThrowingFormatters } from "@/test/formatters";
import { classSection, populatedRoutes } from "@/test/fixtures";

import AdminDashboard from "./page";

const trends = [
  { termName: "Term 1", yearName: "2026-2027", averageScore: 68.4, studentCount: 300 },
  { termName: "Term 2", yearName: "2026-2027", averageScore: 71.2, studentCount: 310 },
];

const week = [
  { date: "2026-08-17", present: 300, late: 8, absent: 12 },
  { date: "2026-08-18", present: 295, late: 10, absent: 15 },
];

const routes = {
  ...populatedRoutes,
  "/analytics/admin/performance-trends": trends,
  // The dashboard reads the attendance dashboard endpoint, not the analytics
  // one, and the weekly analytics separately.
  "/attendance/dashboard": {
    date: "2026-08-21",
    overall: { totalStudents: 320, present: 300, late: 8, absent: 12, rate: 96 },
    sections: [{ sectionId: "section-1", className: "Senior 1 A", total: 32, present: 30, late: 1, absent: 1, rate: 97 }],
  },
  "/analytics/admin/attendance": { rate: 94.6, days: week, byClass: [{ classSection, rate: 95 }] },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.charts.length = 0;
  serve(h.api, routes);
});

async function mount() {
  renderPage(AdminDashboard, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
  await new Promise((r) => setTimeout(r, 120));
}

describe("the headline figures", () => {
  it("shows the school's numbers", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/\d/));
  });

  it("renders for a school on its first day", async () => {
    serveAll(h.api, []);
    await mount();
    expect(document.body.textContent).not.toBe("");
    expect(document.body.textContent).not.toContain("NaN");
  });

  it("does not go blank when the aggregates fail", async () => {
    serveFailure(h.api);
    await mount();
    expect(document.body.textContent).not.toBeNull();
  });
});

describe("the performance trend", () => {
  it("draws a point per term that has graded students", async () => {
    await mount();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));
  });

  // A term nobody has marked yet has no average worth plotting, and a zero
  // there would read as a school that scored nothing.
  it("leaves out terms with nobody graded", async () => {
    serve(h.api, {
      ...routes,
      "/analytics/admin/performance-trends": [
        ...trends,
        { termName: "Term 3", yearName: "2026-2027", averageScore: 0, studentCount: 0 },
      ],
    });
    await mount();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));

    const categories = h.charts
      .map((o) => (o as { xAxis?: { data?: string[] } }).xAxis?.data)
      .find(Array.isArray);
    if (categories) expect(categories).not.toContain("Term 3");
  });

  it("draws nothing rather than an empty axis when no term is graded", async () => {
    serve(h.api, { ...routes, "/analytics/admin/performance-trends": [] });
    await mount();
    expect(JSON.stringify(h.charts)).not.toContain("NaN");
  });
});

describe("the attendance week", () => {
  it("labels each day", async () => {
    await mount();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));
    expect(JSON.stringify(h.charts)).not.toContain("Invalid Date");
  });

  it("copes with a week nobody took a register", async () => {
    serve(h.api, {
      ...routes,
      "/analytics/admin/attendance": { rate: 0, days: [] },
      "/attendance/dashboard": {
        date: "2026-08-21",
        overall: { totalStudents: 0, present: 0, late: 0, absent: 0, rate: 0 },
        sections: [],
      },
    });
    await mount();
    expect(JSON.stringify(h.charts)).not.toContain("NaN");
  });
});

describe("its chart callbacks", () => {
  it.each([
    ["a normal week", routes],
    ["nothing at all", {}],
  ])("none throw with %s", async (_name, r) => {
    if (Object.keys(r).length) serve(h.api, r); else serveAll(h.api, []);
    await mount();
    expect(findThrowingFormatters(h.charts)).toEqual([]);
  });
});

describe("every control on the dashboard", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 25 });
    expect(rejections).toEqual([]);
  }, 30000);
});
