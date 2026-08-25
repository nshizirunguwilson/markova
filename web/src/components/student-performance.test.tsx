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
    studentIdNumber: "STD-2026-001",
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
    expect(screen.getByText(/STD-2026-001/)).toBeInTheDocument();
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

/**
 * A record that is not neat.
 *
 * This component is shared by three pages, and the data behind it comes from
 * an analytics endpoint that joins several tables. Every one of those joins
 * can come back short: a term with no year attached, a student with no email,
 * a subject that appears in one term and not the next. A parent-teacher
 * meeting is not the moment for a white screen.
 */
describe("a profile with pieces missing", () => {
  it("says so when the student cannot be found at all", async () => {
    serve(h.api, { "/analytics/student": null });
    render();
    expect(await screen.findByText("Student not found.")).toBeInTheDocument();
  });

  it("shows the email beside the ID only when there is one", async () => {
    serve(h.api, {
      "/analytics/student": {
        ...profile([term("2026-2027", "Term 1", 82, 68)]),
        student: {
          ...profile([]).student,
          email: "d.niyonkuru@markova.edu",
        },
      },
    });
    render();
    await screen.findByRole("heading", { name: /Divine/ });
    expect(screen.getByText(/STD-2026-001 · d\.niyonkuru@markova\.edu/)).toBeInTheDocument();
  });

  it("names the trade for a TVET student", async () => {
    serve(h.api, {
      "/analytics/student": {
        ...profile([term("2026-2027", "Term 1", 82, 68)]),
        student: {
          ...profile([]).student,
          trade: { code: "SWD", name: "Software Development" },
        },
      },
    });
    render();
    expect(await screen.findByText("Software Development")).toBeInTheDocument();
  });

  it("draws an en dash for attendance nobody has recorded", async () => {
    serve(h.api, {
      "/analytics/student": profile([
        { ...term("2026-2027", "Term 1", 82, 68), attendancePct: null },
      ]),
    });
    render();
    await screen.findByRole("heading", { name: /Divine/ });

    const chip = screen.getByText("Attendance").closest("div")!;
    expect(chip.textContent).toContain("–");
  });

  it("shows the attendance percentage when there is one", async () => {
    serve(h.api, {
      "/analytics/student": profile([
        { ...term("2026-2027", "Term 1", 82, 68), attendancePct: 93 },
      ]),
    });
    render();
    await screen.findByRole("heading", { name: /Divine/ });
    expect(screen.getByText("93%")).toBeInTheDocument();
  });

  it("labels the subjects card without a year when the term carries none", async () => {
    serve(h.api, {
      "/analytics/student": profile([
        { ...term("2026-2027", "Term 1", 82, 68), yearName: null },
      ]),
    });
    render();
    const title = await screen.findByText(/Subjects this term/);
    expect(title.textContent).toContain("Term 1");
    expect(title.textContent).not.toContain(",");
  });

  it("keeps building the axis when a term has no name", async () => {
    serve(h.api, {
      "/analytics/student": profile([
        { ...term("2026-2027", "Term 1", 60, 60), termName: null },
        term("2026-2027", "Term 2", 70, 65),
      ]),
    });
    render();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));

    const { findThrowingFormatters } = await import("@/test/formatters");
    expect(findThrowingFormatters(h.charts)).toEqual([]);
  });

  it("orders a subject that only appears in an earlier term after the current ones", async () => {
    const withDropped = [
      {
        ...term("2026-2027", "Term 1", 60, 60),
        subjects: [
          { name: "Mathematics", total: 60, grade: "B" },
          { name: "Art", total: 55, grade: "C" },
        ],
      },
      {
        ...term("2026-2027", "Term 2", 70, 65),
        subjects: [{ name: "Mathematics", total: 70, grade: "A" }],
      },
    ];
    serve(h.api, { "/analytics/student": profile(withDropped) });
    render();
    await waitFor(() => expect(h.charts.length).toBeGreaterThan(0));

    const heatmap = h.charts.find(
      (c: any) => c?.series?.[0]?.type === "heatmap",
    ) as any;
    expect(heatmap).toBeTruthy();
    // Art was dropped, so it is not in the latest term's ordering and sorts
    // to the end rather than disappearing from the chart.
    expect(heatmap.yAxis.data).toEqual(["Mathematics", "Art"]);
  });
});

/**
 * The same charts drawn from a record with the labels missing.
 *
 * Every tooltip on this page names a term, a year or a subject, and the
 * analytics profile joins across several tables. When one of those joins comes
 * back short a parent must not be shown the word "undefined" about their own
 * child.
 */
describe("charts drawn from a record with no labels", () => {
  const unlabelled = [
    {
      yearName: null,
      termName: null,
      average: null,
      classAverage: null,
      rank: null,
      classSize: null,
      letterGrade: null,
      aggregate: null,
      aggregateMax: null,
      attendancePct: null,
      className: null,
      subjects: [{ name: null, total: null, grade: null }],
    },
    {
      yearName: null,
      termName: null,
      average: 60,
      classAverage: 58,
      rank: 3,
      classSize: 30,
      letterGrade: "C",
      aggregate: 20,
      aggregateMax: 30,
      attendancePct: 80,
      className: "Senior 1 A",
      subjects: [{ name: "Mathematics", total: 60, grade: "C" }],
    },
  ];

  async function mountUnlabelled() {
    serve(h.api, { "/analytics/student": profile(unlabelled) });
    render();
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

  it("still lays out the subjects chart for a term with no subjects", async () => {
    serve(h.api, {
      "/analytics/student": profile([
        { ...unlabelled[1], subjects: [] },
        { ...unlabelled[1], termName: "Term 2", subjects: [] },
      ]),
    });
    render();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});
