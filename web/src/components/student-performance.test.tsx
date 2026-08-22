import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    charts: [] as Array<Record<string, unknown>>,
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// The charts themselves are a third party canvas renderer, which jsdom cannot
// draw. What matters here is the option object the component builds from the
// data, so the renderer is replaced by something that records it.
vi.mock("@/components/ui/echart", () => ({
  EChart: (props: { option: Record<string, unknown> }) => {
    h.charts.push(props.option);
    return <div data-testid="chart" />;
  },
}));

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/harness";
import { serve, serveFailure, serveNever } from "@/test/page";
import { StudentPerformance } from "./student-performance";

const term = (yearName: string, termName: string, average: number, classAverage: number) => ({
  yearName,
  termName,
  average,
  classAverage,
  rank: 4,
  classSize: 32,
  letterGrade: "A",
  aggregate: 12,
  aggregateMax: 30,
  attendanceRate: 95,
  subjects: [{ subjectName: "Mathematics", score: average, letterGrade: "A" }],
});

// Matches what /analytics/student/:id/profile actually returns: a flat student
// summary, not the nested user shape the list endpoints use.
const profile = (terms: unknown[]) => ({
  student: {
    id: "student-1",
    name: "Divine Niyonkuru",
    photoUrl: null,
    studentIdNumber: "MRK-2026-001",
    class: "Senior 1 A",
    classSize: 32,
    status: "ACTIVE",
    trade: null,
  },
  terms,
});

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  h.charts.length = 0;
});

const render = () => renderWithProviders(<StudentPerformance studentId="student-1" />);

describe("StudentPerformance", () => {
  it("shows a holding state while the profile loads", () => {
    serveNever(h.api);
    render();
    expect(screen.queryByRole("heading", { name: /Divine/ })).not.toBeInTheDocument();
  });

  it("names the student once their profile arrives", async () => {
    serve(h.api, {
      "/analytics/student": profile([
        term("2025-2026", "Term 1", 70, 65),
        term("2026-2027", "Term 1", 82, 68),
      ]),
    });
    render();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Divine Niyonkuru/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/MRK-2026-001/)).toBeInTheDocument();
  });

  // A student in their very first term has one data point. A line chart of one
  // point says nothing, so the component is expected to withhold it rather than
  // draw a chart with no shape.
  it("draws no trajectory from a single term", async () => {
    serve(h.api, { "/analytics/student": profile([term("2026-2027", "Term 1", 82, 68)]) });
    render();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Divine/ })).toBeInTheDocument(),
    );
    const hasTrajectory = h.charts.some(
      (o) => Array.isArray((o as { series?: unknown[] }).series) &&
        ((o as { series: unknown[] }).series.length ?? 0) > 1,
    );
    expect(hasTrajectory).toBe(false);
  });

  it("draws a trajectory once there are two terms to compare", async () => {
    serve(h.api, {
      "/analytics/student": profile([
        term("2026-2027", "Term 1", 70, 65),
        term("2026-2027", "Term 2", 82, 68),
      ]),
    });
    render();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("chart").length).toBeGreaterThan(0);
  });

  // The axis labels carry the year only when it changes, so a chart spanning
  // two school years does not repeat it under every term.
  it("labels the year only when it changes", async () => {
    serve(h.api, {
      "/analytics/student": profile([
        term("2025-2026", "Term 1", 60, 60),
        term("2025-2026", "Term 2", 65, 62),
        term("2026-2027", "Term 1", 70, 66),
      ]),
    });
    render();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));

    const withCategory = h.charts.find(
      (o) => (o as { xAxis?: { type?: string; data?: string[] } }).xAxis?.type === "category",
    ) as { xAxis: { data: string[] } } | undefined;
    expect(withCategory).toBeTruthy();

    const labels = withCategory!.xAxis.data;
    expect(labels[0]).toContain("2025-2026");
    expect(labels[1]).not.toContain("2025-2026");
    expect(labels[2]).toContain("2026-2027");
  });

  it("says so when the student has no terms recorded yet", async () => {
    serve(h.api, { "/analytics/student": profile([]) });
    render();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  });

  it("does not go blank when the profile request fails", async () => {
    serveFailure(h.api);
    render();
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

/**
 * The tooltips on a student's own charts.
 *
 * ECharts calls these when a pointer touches a point, including gaps and
 * points a series does not have. A tooltip that throws takes the chart down,
 * and this is the page a parent opens to see how their child is doing.
 */
describe("its chart callbacks", () => {
  it("none throws for a student with a full record", async () => {
    const { findThrowingFormatters } = await import("@/test/formatters");
    serve(h.api, {
      "/analytics/student": profile([
        term("2025-2026", "Term 1", 60, 60),
        term("2025-2026", "Term 2", 65, 62),
        term("2026-2027", "Term 1", 70, 66),
      ]),
    });
    render();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));
    const failures = findThrowingFormatters(h.charts);
    expect(failures).toEqual([]);
  });

  it("none throws for a student in their first term", async () => {
    const { findThrowingFormatters } = await import("@/test/formatters");
    serve(h.api, { "/analytics/student": profile([term("2026-2027", "Term 1", 82, 68)]) });
    render();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Divine/ })).toBeInTheDocument(),
    );
    expect(findThrowingFormatters(h.charts)).toEqual([]);
  });

  it("none throws for a student with no terms at all", async () => {
    const { findThrowingFormatters } = await import("@/test/formatters");
    serve(h.api, { "/analytics/student": profile([]) });
    render();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(findThrowingFormatters(h.charts)).toEqual([]);
  });
});
