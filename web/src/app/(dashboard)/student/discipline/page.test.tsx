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
  usePathname: () => "/student/discipline",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import StudentDisciplinePage from "./page";

/**
 * A student's own conduct record.
 *
 * This is the page a fifteen year old reads about themselves. A record that
 * shows only what went wrong teaches them that being unnoticed is the best
 * outcome available, so what these tests protect is that the good side is
 * shown, and that the way back is a number rather than a feeling.
 */

const discipline = {
  student: { currentPoints: 88, startingPoints: 100, percentage: 88 },
  totalIncidents: 2,
  incidents: [
    {
      id: "inc-1",
      date: "2026-08-18T00:00:00Z",
      time: "08:10",
      location: "Assembly ground",
      description: "Late to assembly three times this week",
      pointsDeducted: 5,
      actionTaken: "VERBAL_WARNING",
      recordedBy: { firstName: "Aline", lastName: "Uwase" },
      appeals: [],
    },
  ],
};

const standing = {
  student: {
    id: "student-1",
    studentIdNumber: "STD-2026-001",
    disciplinePoints: 88,
    user: { firstName: "Divine", lastName: "Niyonkuru" },
  },
  points: 88,
  ceiling: 100,
  pointsToCleanSheet: 12,
  meritCount: 1,
  incidentCount: 2,
  byCategory: { HELPING_OTHERS: 1 },
  merits: [
    {
      id: "merit-1",
      category: "HELPING_OTHERS",
      description: "Stayed behind to help clear the science lab",
      points: 5,
      date: "2026-08-20T00:00:00Z",
      awardedBy: { firstName: "Aline", lastName: "Uwase" },
    },
  ],
  incidents: [],
};

const routes: Record<string, unknown> = {
  ...populatedRoutes,
  "/discipline/standing/student-1": standing,
  "/discipline/student/student-1": discipline,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(over: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, ...over });
  renderPage(StudentDisciplinePage, {
    role: "STUDENT",
    user: { studentId: "student-1" },
  });
  await waitFor(() =>
    expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
  );
}

describe("what a student sees about themselves", () => {
  it("shows the conduct score against the clean sheet", async () => {
    await mount();
    expect(screen.getByText("88 / 100")).toBeInTheDocument();
  });

  it("lists the incidents with what each one cost", async () => {
    await mount();
    expect(screen.getByText("-5")).toBeInTheDocument();
    expect(screen.getByText("Verbal Warning")).toBeInTheDocument();
  });

  // The point of showing this at all. A student who can only see what they
  // lost has nothing to aim at.
  it("says how many points back to a clean sheet, as a number", async () => {
    await mount();
    expect(screen.getByText("12 points")).toBeInTheDocument();
    expect(screen.getByText(/from a clean sheet/i)).toBeInTheDocument();
  });

  it("says plainly when nothing is held against them", async () => {
    await mount({
      "/discipline/standing/student-1": {
        ...standing,
        pointsToCleanSheet: 0,
        points: 100,
      },
    });
    expect(screen.getByText(/nothing is held against you/i)).toBeInTheDocument();
    expect(screen.queryByText(/from a clean sheet/i)).not.toBeInTheDocument();
  });

  // Deliberately above the incidents: a record that opens with what went wrong
  // teaches a student that being unnoticed is the best they can do.
  it("shows what they have been recognised for", async () => {
    await mount();
    expect(
      screen.getByText(/Stayed behind to help clear the science lab/),
    ).toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("Helping others")).toBeInTheDocument();
  });

  it("puts the recognition above the incidents on the page", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text.indexOf("recognised for")).toBeLessThan(
      text.indexOf("Late to assembly"),
    );
  });

  it("shows no recognition block when there is none yet", async () => {
    await mount({
      "/discipline/standing/student-1": { ...standing, merits: [] },
    });
    expect(screen.queryByText(/recognised for/i)).not.toBeInTheDocument();
  });

  it("still shows the incidents when the standing call fails", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/standing/student-1": undefined as never,
    });
    renderPage(StudentDisciplinePage, {
      role: "STUDENT",
      user: { studentId: "student-1" },
    });
    await waitFor(() =>
      expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
    );
  });

  it("survives the API being down", async () => {
    serveFailure(h.api);
    renderPage(StudentDisciplinePage, {
      role: "STUDENT",
      user: { studentId: "student-1" },
    });
    await waitFor(() =>
      expect(screen.getByText("My conduct")).toBeInTheDocument(),
    );
  });
});
