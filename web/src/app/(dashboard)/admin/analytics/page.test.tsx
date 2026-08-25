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
  usePathname: () => "/admin/analytics",
  useSearchParams: () => new URLSearchParams(),
}));

// The chart library draws to a canvas jsdom does not have. The option object
// the page builds is the part worth checking, so it is recorded instead.
vi.mock("@/components/ui/echart", () => ({
  EChart: (props: { option: Record<string, unknown> }) => {
    h.charts.push(props.option);
    return <div data-testid="chart" />;
  },
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure } from "@/test/page";
import { chooseCascadingFilters, exercisePage } from "@/test/exercise";
import { populatedRoutes } from "@/test/fixtures";

import AnalyticsPage from "./page";

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.charts.length = 0;
  serve(h.api, populatedRoutes);
});

async function mount() {
  renderPage(AnalyticsPage, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

describe("the analytics dashboard", () => {
  it("shows the headline figures", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/\d/));
  });

  it("draws its charts once the data arrives", async () => {
    await mount();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));
  });

  // A school in its first week has no marks, no attendance history and no
  // trends. Charts of nothing must not be charts of NaN.
  it("draws nothing rather than nonsense for a school with no history", async () => {
    serveAll(h.api, []);
    await mount();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    const serialised = JSON.stringify(h.charts);
    expect(serialised).not.toContain("NaN");
    expect(serialised).not.toContain("null,null");
  });

  it("does not go blank when analytics fail to load", async () => {
    serveFailure(h.api);
    await mount();
    expect(document.body.textContent).not.toBeNull();
  });
});

describe("the grade heatmap", () => {
  // Each row is a class level and each column a letter grade. A level with no
  // results for a grade has no entry at all, which used to throw.
  it("copes with a level missing some grades entirely", async () => {
    serve(h.api, {
      ...populatedRoutes,
      "/analytics/admin/grade-distribution": [
        { level: "Senior 1", total: 10, counts: { A: 10 } },
        { level: "Senior 2", total: 5, counts: {} },
        { level: "Senior 3", total: 0 },
      ],
    });
    await mount();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(JSON.stringify(h.charts)).not.toContain("NaN");
  });
});

describe("changing the year and term", () => {
  it("refetches for the chosen period", async () => {
    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((s) =>
          Array.from(s.options).some((o) => o.value),
        ),
      ).toBe(true),
    );
    const before = h.api.get.mock.calls.length;
    await chooseCascadingFilters(4);
    await waitFor(() =>
      expect(h.api.get.mock.calls.length).toBeGreaterThanOrEqual(before),
    );
  });
});

describe("every control on the dashboard", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});

/**
 * The chart tooltips.
 *
 * ECharts calls these back with its own params object when someone hovers a
 * point. They never run during a render, so nothing else in the suite reaches
 * them, and a tooltip that throws breaks the chart it belongs to.
 */
describe("tooltip formatters", () => {
  /** Every formatter function this page handed to a chart. */
  function formatters() {
    const found: Array<(p: unknown) => string> = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "formatter" && typeof value === "function") {
          found.push(value as (p: unknown) => string);
        } else if (typeof value === "object") {
          walk(value);
        }
      }
    };
    h.charts.forEach(walk);
    return found;
  }

  it("every chart offers one", async () => {
    await mount();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));
    expect(formatters().length).toBeGreaterThan(0);
  });

  it("none of them throws on a normal hover", async () => {
    await mount();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));

    const params = {
      name: "Senior 1 A",
      value: 73.1,
      data: [0, 0, 42],
      seriesName: "Average",
      axisValue: "Term 1",
      dataIndex: 0,
    };

    // Reported together so a failure names every formatter that broke, not
    // just the first one.
    const failures: string[] = [];
    formatters().forEach((format, i) => {
      for (const shape of [params, [params]]) {
        try {
          format(shape);
        } catch (e) {
          failures.push(`formatter #${i}: ${(e as Error).message}`);
        }
      }
    });
    expect(failures).toEqual([]);
  });

  // ECharts hands an array for a shared-axis tooltip and a bare object
  // otherwise, and a point it does not recognise should produce nothing rather
  // than an exception.
  it("none of them throws on a point it does not recognise", async () => {
    await mount();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));

    for (const format of formatters()) {
      expect(() => format({ name: "Nowhere", value: 0, data: [0, 0, 0] })).not.toThrow();
      expect(() => format([])).not.toThrow();
      expect(() => format({})).not.toThrow();
    }
  });

  it("none of them throws when the school has no data", async () => {
    serveAll(h.api, []);
    await mount();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    for (const format of formatters()) {
      expect(() => format({ name: "x", value: 0, data: [0, 0, 0] })).not.toThrow();
    }
  });
});

describe("axis labels", () => {
  /** Formatters attached to an axis rather than a tooltip. */
  function axisFormatters() {
    const found: Array<(v: unknown) => string> = [];
    for (const option of h.charts) {
      for (const axis of ["xAxis", "yAxis"] as const) {
        const a = (option as Record<string, unknown>)[axis] as
          | { axisLabel?: { formatter?: unknown } }
          | undefined;
        const f = a?.axisLabel?.formatter;
        if (typeof f === "function") found.push(f as (v: unknown) => string);
      }
    }
    return found;
  }

  it("survive the values an axis actually passes", async () => {
    await mount();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));

    for (const format of axisFormatters()) {
      expect(() => format("2026-08-21")).not.toThrow();
      expect(() => format(0)).not.toThrow();
      expect(() => format("")).not.toThrow();
    }
  });
});

/**
 * The same charts drawn from records with the labels missing.
 *
 * Every tooltip on this page reads a name off the row it is hovering: a class
 * name, a term name, a book's author. The analytics endpoints join across
 * several tables and any of those joins can come back short, at which point a
 * tooltip either says "undefined" to a head teacher or throws and takes the
 * chart down.
 */
describe("charts drawn from rows with no labels", () => {
  // The class name has to survive: the tooltip finds its row by it, and a
  // row nobody can find is a tooltip that returns nothing at all.
  const unlabelled = {
    ...populatedRoutes,
    "/analytics/admin/class-comparisons": [
      {
        classSectionId: "s-1",
        className: "Senior 1 A",
        averageScore: null,
        studentCount: null,
        lowest: null,
        highest: null,
      },
    ],
    "/analytics/admin/grade-distribution": [
      { classLevelId: "l-1", levelName: null, grades: { A: null, B: 2 } },
    ],
    "/analytics/admin/performance-trends": [
      { termId: "t-1", termName: "Term 1", averageScore: null, studentCount: null },
    ],
    "/analytics/admin/library": {
      totalBooks: null,
      popularBooks: [{ id: "b-1", title: "Ubumenyi", author: null, loanCount: null }],
    },
  };

  async function mountUnlabelled() {
    serve(h.api, unlabelled);
    renderPage(AnalyticsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));
  }

  it("no tooltip throws", async () => {
    const { findThrowingFormatters } = await import("@/test/formatters");
    await mountUnlabelled();

    expect(findThrowingFormatters(h.charts)).toEqual([]);
  });

  it("no tooltip prints the word undefined", async () => {
    const { collectFormatters, HOVER_SHAPES } = await import("@/test/formatters");
    await mountUnlabelled();

    for (const format of collectFormatters(h.charts)) {
      for (const shape of HOVER_SHAPES) {
        let out = "";
        try {
          out = String(format(shape) ?? "");
        } catch {
          continue;
        }
        expect(out).not.toMatch(/\bundefined\b/);
      }
    }
  });

  it("still gives the class chart a height", async () => {
    serve(h.api, { ...unlabelled, "/analytics/admin/class-comparisons": [] });
    renderPage(AnalyticsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    // No classes at all: the chart is still laid out rather than collapsing
    // to nothing or throwing on a length of undefined.
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});

/**
 * The class chart when its own call fails.
 *
 * Each panel on this dashboard loads separately, so one endpoint being down
 * must not take the others with it, and the chart it belongs to still has to
 * be given a height rather than collapsing to nothing.
 */
describe("when the class comparison call fails on its own", () => {
  it("still draws the rest of the dashboard", async () => {
    serve(h.api, populatedRoutes);
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/analytics/admin/class-comparisons")) {
        throw Object.assign(new Error("down"), { response: { status: 500 } });
      }
      return real(url, config);
    });

    renderPage(AnalyticsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });
});
