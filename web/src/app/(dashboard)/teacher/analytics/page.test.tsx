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
// The chart library draws to a canvas jsdom does not have.
vi.mock("@/components/ui/echart", () => ({
  EChart: () => <div data-testid="chart" />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/teacher/analytics",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { academicYear, classLevel, classSection, populatedRoutes, term } from "@/test/fixtures";

import TeacherAnalyticsPage from "./page";

/**
 * How a class is doing, for the teacher who teaches it.
 *
 * Nothing loads until a class and a term are both chosen, and the two panels
 * appear separately: a class can have subject figures with nobody
 * underperforming, and the reverse. Showing an empty card in either case would
 * read as "no data" when there is plenty.
 */

const analytics = {
  subjectAnalytics: [
    { subjectName: "Mathematics", averageScore: 68, highestScore: 91, lowestScore: 34 },
  ],
  underperforming: [
    { studentId: "student-1", name: "Divine Niyonkuru", average: 38, letterGrade: "F" },
  ],
};

const routes = {
  ...populatedRoutes,
  "/academic/years": [academicYear],
  "/academic/terms": [term],
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/analytics/teacher/class": analytics,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

/** Chooses a year, a term, a level and a class, in that order. */
async function chooseClass() {
  for (const [label, value] of [
    ["Year", academicYear.id],
    ["Term", term.id],
    ["Level", classLevel.id],
    ["Section", classSection.id],
  ] as const) {
    const picker = await screen.findByLabelText(label);
    await waitFor(() =>
      expect(
        Array.from((picker as HTMLSelectElement).options).some((o) => o.value === value),
      ).toBe(true),
    );
    await act(async () => {
      fireEvent.change(picker, { target: { value } });
    });
  }
}

function mount(over: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, ...over });
  renderPage(TeacherAnalyticsPage, { role: "TEACHER", user: { teacherId: "teacher-1" } });
}

describe("before a class is chosen", () => {
  it("asks the API for nothing", async () => {
    mount();
    await screen.findByLabelText("Year");

    expect(
      h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("/analytics/teacher/class"),
      ),
    ).toBe(false);
  });

  it("says nothing about there being no data", async () => {
    mount();
    await screen.findByLabelText("Year");

    expect(screen.queryByText("No analytics data available")).toBeNull();
  });
});

describe("once a class and a term are chosen", () => {
  it("asks for that class and term", async () => {
    mount();
    await chooseClass();

    await waitFor(() => {
      const call = h.api.get.mock.calls.find(([url]: any[]) =>
        String(url).includes(`/analytics/teacher/class/${classSection.id}`),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).params.termId).toBe(term.id);
    });
  });

  it("names the students who need help", async () => {
    mount();
    await chooseClass();

    expect(await screen.findByText("Divine Niyonkuru")).toBeInTheDocument();
    expect(screen.getByText("38%")).toBeInTheDocument();
  });

  it("shows the subject panel", async () => {
    mount();
    await chooseClass();

    expect(await screen.findByText("Subject Performance")).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });
});

describe("a class where only half the picture exists", () => {
  it("hides the subject panel when there are no subject figures", async () => {
    mount({
      "/analytics/teacher/class": { ...analytics, subjectAnalytics: [] },
    });
    await chooseClass();

    await waitFor(() =>
      expect(screen.getByText("Divine Niyonkuru")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Subject Performance")).toBeNull();
  });

  it("hides the warning panel when nobody is behind", async () => {
    mount({ "/analytics/teacher/class": { ...analytics, underperforming: [] } });
    await chooseClass();

    await waitFor(() =>
      expect(screen.getByText("Subject Performance")).toBeInTheDocument(),
    );
    // An empty "Underperforming Students" card would read as a warning.
    expect(screen.queryByText("Underperforming Students")).toBeNull();
  });

  it("says so when there is nothing for the class at all", async () => {
    mount({ "/analytics/teacher/class": null });
    await chooseClass();

    expect(
      await screen.findByText("No analytics data available"),
    ).toBeInTheDocument();
  });

  it("spins rather than claiming there is nothing", async () => {
    mount({ "/analytics/teacher/class": () => new Promise(() => {}) });
    await chooseClass();

    expect(screen.queryByText("No analytics data available")).toBeNull();
  });
});
