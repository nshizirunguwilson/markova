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
  usePathname: () => "/student",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { book, populatedRoutes } from "@/test/fixtures";

import StudentDashboard from "./page";

/**
 * A student's own front page.
 *
 * The conduct bar is the one thing on it that reads as a judgement, so its
 * three bands have to be right: a student on ninety and a student on twenty
 * must not see the same colour. The loans list beside it is what stops a fine.
 */

const loan = (over: Record<string, unknown> = {}) => ({
  id: "loan-1",
  book,
  dueDate: "2026-09-30T00:00:00Z",
  returnedAt: null,
  ...over,
});

const routes = { ...populatedRoutes, "/library/loans/my": [loan()] };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

function mount(user: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, ...over });
  renderPage(StudentDashboard, {
    role: "STUDENT",
    user: { studentId: "student-1", ...user } as never,
  });
}

const bar = () => document.querySelector("[style*='width']")!.className;

/**
 * Conduct is marked out of forty for the term, not out of a hundred for the
 * year — a student who lost points in September should not still be carrying
 * them in July. See src/lib/conduct.ts.
 */
describe("the conduct bar", () => {
  it("assumes a clean sheet when nothing is on record", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("40")).toBeInTheDocument());
    expect(bar()).toMatch(/success/);
  });

  it("reads the points off the student record", async () => {
    mount({ student: { disciplinePoints: 22 } });
    await waitFor(() => expect(screen.getByText("22")).toBeInTheDocument());
  });

  it("falls back to points on the account itself", async () => {
    mount({ disciplinePoints: 33 });
    await waitFor(() => expect(screen.getByText("33")).toBeInTheDocument());
  });

  // The raw mark alone does not say whether thirty-two is good.
  it("says the percentage and the word beside it", async () => {
    mount({ student: { disciplinePoints: 32 } });
    await waitFor(() => expect(screen.getByText("32")).toBeInTheDocument());
    expect(screen.getByText(/80% · Good/)).toBeInTheDocument();
  });

  it("says it is out of forty, not out of a hundred", async () => {
    mount({ student: { disciplinePoints: 32 } });
    await waitFor(() => expect(screen.getByText("32")).toBeInTheDocument());
    expect(screen.getByText(/\/ 40/)).toBeInTheDocument();
  });

  it("warns in the middle of the scale", async () => {
    mount({ student: { disciplinePoints: 22 } });
    await waitFor(() => expect(screen.getByText("22")).toBeInTheDocument());
    expect(bar()).toMatch(/warning/);
  });

  it("paints a record in real trouble differently again", async () => {
    mount({ student: { disciplinePoints: 9 } });
    await waitFor(() => expect(screen.getByText("9")).toBeInTheDocument());
    expect(bar()).toMatch(/danger/);
  });

  it("never draws the bar past the end of its track", async () => {
    // A merit-heavy term can take a student above the ceiling.
    mount({ student: { disciplinePoints: 52 } });
    await waitFor(() => expect(screen.getByText("52")).toBeInTheDocument());

    const width = document
      .querySelector("[style*='width']")!
      .getAttribute("style")!;
    expect(width).toContain("100%");
  });
});

describe("the books a student has out", () => {
  it("counts only the ones not yet returned", async () => {
    mount(
      {},
      {
        "/library/loans/my": [
          loan(),
          loan({ id: "loan-2", returnedAt: "2026-08-01T00:00:00Z" }),
        ],
      },
    );

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("copes with a student who has never borrowed anything", async () => {
    mount({}, { "/library/loans/my": null });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(document.body.textContent).not.toMatch(/undefined|NaN/);
  });

  it("spins rather than claiming nothing is out", async () => {
    mount({}, { "/library/loans/my": () => new Promise(() => {}) });

    // Nothing of the dashboard is drawn until the loans arrive: a count of
    // nought would read as "you have nothing out" while it is still loading.
    expect(screen.queryByText("Discipline Points")).toBeNull();
  });
});
