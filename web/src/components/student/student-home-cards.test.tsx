import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() } };
});
vi.mock("@/lib/api", () => ({ default: h.api }));

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/harness";
import { serve } from "@/test/page";
import { academicYear, term } from "@/test/fixtures";

import { LatestMarks } from "./latest-marks";
import { WhatsDue } from "./whats-due";

/**
 * A student's home page showed conduct and library books, and not what is
 * due or how the last piece of work went.
 */

// Thursday 12 November 2026.
const now = new Date(2026, 10, 12, 10, 0);
const on = (day: number) => new Date(2026, 10, day, 23, 59).toISOString();

const work = (id: string, title: string, day: number, over = {}) => ({
  id,
  title,
  dueDate: on(day),
  subject: { name: "Biology" },
  submission: null,
  ...over,
});

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
});

describe("what is due", () => {
  function mount(rows: unknown, ids: { studentId?: string; classSectionId?: string } = {}) {
    serve(h.api, { "/homework/student/student-1": rows });
    renderWithProviders(
      <WhatsDue
        studentId={"studentId" in ids ? ids.studentId : "student-1"}
        classSectionId={"classSectionId" in ids ? ids.classSectionId : "section-1"}
        now={now}
      />,
    );
  }

  it("lists the work not handed in, soonest first, and says when", async () => {
    mount([
      work("b", "Cell diagram", 16),
      work("a", "Lab report", 13),
      work("c", "Handed in already", 14, { submission: { id: "s-1" } }),
    ]);
    expect(await screen.findByText("Lab report")).toBeInTheDocument();
    expect(screen.getByText("Due tomorrow")).toBeInTheDocument();
    expect(screen.getByText("Due in 4 days")).toBeInTheDocument();
    expect(screen.queryByText("Handed in already")).toBeNull();

    const titles = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(titles[0]).toContain("Lab report");
    expect(titles[1]).toContain("Cell diagram");
  });

  it("says a student is up to date when nothing is due", async () => {
    mount([]);
    expect(await screen.findByText("Nothing is due. You are up to date.")).toBeInTheDocument();
  });

  // Late is not "due": it is said apart, and in as many words.
  it("counts late work apart", async () => {
    mount([work("a", "Old essay", 9), work("b", "Older essay", 5)]);
    expect(
      await screen.findByText("2 pieces of work are late and not handed in."),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing new is due.")).toBeInTheDocument();
    expect(screen.queryByText("Old essay")).toBeNull();
  });

  it("says one late piece in the singular", async () => {
    mount([work("a", "Old essay", 9), work("b", "Lab report", 13)]);
    expect(
      await screen.findByText("1 piece of work is late and not handed in."),
    ).toBeInTheDocument();
  });

  it("shows five and says how many more", async () => {
    mount([13, 14, 15, 16, 17, 18, 19].map((d) => work(`w-${d}`, `Work ${d}`, d)));
    await screen.findByText("Work 13");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
  });

  it("leads to the student's work", async () => {
    mount([]);
    const link = await screen.findByRole("link", { name: "Open my work" });
    expect(link.getAttribute("href")).toBe("/student/homework");
  });

  it("draws nothing for an account with no class", async () => {
    mount([], { classSectionId: undefined });
    await waitFor(() => expect(h.api.get).not.toHaveBeenCalled());
    expect(document.body.textContent).toBe("");
  });

  it("draws nothing when the work cannot be read", async () => {
    serve(h.api, {});
    renderWithProviders(<WhatsDue studentId="student-1" classSectionId="section-1" now={now} />);
    await waitFor(() => expect(h.api.get).toHaveBeenCalled());
    expect(screen.queryByText("What is due")).toBeNull();
  });
});

describe("the latest marks", () => {
  const mark = (id: string, name: string, day: number, score = 34) => ({
    id,
    score,
    maxScore: 40,
    createdAt: on(day),
    subject: { name },
    assessmentType: { name: "CAT 1" },
  });

  const base = { "/academic/years": [academicYear], "/academic/terms": [term] };

  function mount(result: unknown, routes: Record<string, unknown> = base) {
    serve(h.api, { ...routes, "/marks/term-results/student/student-1": result });
    renderWithProviders(<LatestMarks studentId="student-1" />);
  }

  it("asks for the term that is running", async () => {
    mount({ published: true, marks: [mark("m-1", "Physics", 10)] });
    await screen.findByText("Physics");
    const call = h.api.get.mock.calls.find(([url]) => String(url).includes("/marks/term-results"));
    expect((call![1] as { params: { termId: string } }).params.termId).toBe("term-1");
  });

  it("shows the newest first, with the mark and what it is out of", async () => {
    mount({
      published: true,
      marks: [mark("m-1", "Physics", 3), mark("m-2", "History", 10, 30)],
    });
    await screen.findByText("History");
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("History");
    expect(rows[0]).toContain("30/40");
    expect(rows[0]).toContain("75%");
    expect(rows[1]).toContain("Physics");
  });

  it("says the marks are not out yet, rather than that there are none", async () => {
    mount({ published: false, marks: [], result: null });
    expect(await screen.findByText("Marks for Term 1 are not out yet.")).toBeInTheDocument();
  });

  it("says the marks are held, and where to find out why", async () => {
    mount({ published: false, withheld: { reason: "FEES" }, marks: [] });
    expect(
      await screen.findByText("Your marks for Term 1 are being held. Open My Marks to see why."),
    ).toBeInTheDocument();
  });

  it("says so when the term has no marks in yet", async () => {
    mount({ published: true, marks: [] });
    expect(await screen.findByText("No marks have come in for Term 1 yet.")).toBeInTheDocument();
  });

  it("names a mark whose subject did not come", async () => {
    mount({ published: true, marks: [{ ...mark("m-1", "x", 3), subject: null }] });
    expect(await screen.findByText("Subject")).toBeInTheDocument();
  });

  it("leads to all the marks", async () => {
    mount({ published: true, marks: [] });
    const link = await screen.findByRole("link", { name: "All my marks" });
    expect(link.getAttribute("href")).toBe("/student/marks");
  });

  it("draws nothing when no term is running", async () => {
    mount(
      { published: true, marks: [] },
      { "/academic/years": [academicYear], "/academic/terms": [{ ...term, isCurrent: false }] },
    );
    await waitFor(() =>
      expect(h.api.get.mock.calls.some(([url]) => String(url).includes("/academic/terms"))).toBe(true),
    );
    expect(screen.queryByText("Latest marks")).toBeNull();
  });

  it("draws nothing when the marks cannot be read", async () => {
    serve(h.api, base);
    renderWithProviders(<LatestMarks studentId="student-1" />);
    await waitFor(() =>
      expect(h.api.get.mock.calls.some(([url]) => String(url).includes("/marks/"))).toBe(true),
    );
    expect(screen.queryByText("Latest marks")).toBeNull();
  });
});
