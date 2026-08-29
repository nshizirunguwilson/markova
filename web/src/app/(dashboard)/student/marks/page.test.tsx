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
  usePathname: () => "/student/marks",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { academicYear, populatedRoutes, term } from "@/test/fixtures";

import StudentMarksPage from "./page";

/**
 * A student's own marks for one term.
 *
 * The page groups raw marks by subject and averages each group, so the numbers
 * on screen are computed here rather than handed over by the API. That makes
 * the arithmetic worth testing directly: a subject bar reading the wrong
 * percentage is a student being told they are failing when they are not.
 */

/** One raw mark row, the shape `/marks/term-results/student/:id` returns. */
function mark(
  subjectId: string,
  subjectName: string,
  score: number,
  maxScore = 100,
  type = "Exam",
) {
  return {
    id: `m-${subjectId}-${type}-${score}`,
    subjectId,
    subject: { id: subjectId, name: subjectName },
    assessmentType: { id: "at-1", name: type },
    score,
    maxScore,
  };
}

const terms = [term, { ...term, id: "term-2", name: "Term 2", isCurrent: false }];

function routesWith(payload: unknown) {
  return {
    ...populatedRoutes,
    "/academic/years": [academicYear],
    "/academic/terms": terms,
    "/marks/term-results/student": payload,
  };
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

function mount(payload: unknown) {
  serve(h.api, routesWith(payload));
  renderPage(StudentMarksPage, { role: "STUDENT", user: { studentId: "student-1" } });
}

describe("a term with marks in it", () => {
  const payload = {
    result: {
      average: 78.44,
      letterGrade: "B",
      rank: 4,
      teacherComment: "Steady work all term.",
      headmasterComment: "Keep it up.",
    },
    marks: [
      mark("s-1", "Mathematics", 90, 100, "Exam"),
      mark("s-1", "Mathematics", 80, 100, "Quiz"),
      mark("s-2", "Kinyarwanda", 65),
      mark("s-3", "Physics", 52),
      mark("s-4", "Chemistry", 30),
    ],
  };

  it("shows the overall average, grade and position", async () => {
    mount(payload);
    expect(await screen.findByText("78.4%")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("#4")).toBeInTheDocument();
  });

  it("counts the subjects it grouped", async () => {
    mount(payload);
    await screen.findByText("78.4%");
    // Four subjects out of five marks: maths was sat twice.
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("averages the two maths papers rather than listing them twice", async () => {
    mount(payload);
    // The subject appears twice: once in the breakdown, once in the chart.
    await waitFor(() => expect(screen.getAllByText("Mathematics").length).toBe(2));
    // 90 and 80 out of 100 each: 85, not 170 and not 90.
    expect(screen.getAllByText("85%").length).toBeGreaterThan(0);
    expect(screen.getByText("Exam: 90/100")).toBeInTheDocument();
    expect(screen.getByText("Quiz: 80/100")).toBeInTheDocument();
  });

  it("gives each pass band its own colour", async () => {
    mount(payload);
    await waitFor(() => expect(screen.getAllByText("Mathematics").length).toBe(2));

    const barFor = (name: string) => {
      const block = screen.getAllByText(name)[0].closest("div")!.parentElement!;
      return block.querySelector("[style*='width']")!.className;
    };

    // 85, 65, 52 and 30: distinction, pass, weak, fail.
    const bands = ["Mathematics", "Kinyarwanda", "Physics", "Chemistry"].map(barFor);
    expect(new Set(bands).size).toBe(4);
  });

  it("shows what both the teacher and the head teacher wrote", async () => {
    mount(payload);
    expect(await screen.findByText("Steady work all term.")).toBeInTheDocument();
    expect(screen.getByText("Keep it up.")).toBeInTheDocument();
  });
});

describe("a term the school has only half finished", () => {
  it("draws dashes where the result has no numbers yet", async () => {
    mount({ result: { average: null, letterGrade: null, rank: null }, marks: [] });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(await screen.findByText("-%")).toBeInTheDocument();
    // Grade and rank both blank as well.
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });

  it("shows only the teacher's comment when the head teacher has not written", async () => {
    mount({
      result: { average: 70, letterGrade: "B", rank: 2, teacherComment: "Good term." },
      marks: [mark("s-1", "Mathematics", 70)],
    });

    expect(await screen.findByText("Good term.")).toBeInTheDocument();
    expect(screen.queryByText("Headmaster")).toBeNull();
  });

  it("shows no comments card at all when neither has written", async () => {
    mount({
      result: { average: 70, letterGrade: "B", rank: 2 },
      marks: [mark("s-1", "Mathematics", 70)],
    });

    await waitFor(() => expect(screen.getAllByText("Mathematics").length).toBe(2));
    expect(screen.queryByText("Comments")).toBeNull();
  });

  it("says plainly that a chosen term has no marks", async () => {
    mount({ result: null, marks: [] });
    expect(
      await screen.findByText("No marks found for this term."),
    ).toBeInTheDocument();
  });
});

describe("choosing which term to look at", () => {
  it("opens on the current term without being asked", async () => {
    mount({ result: { average: 70, letterGrade: "B", rank: 1 }, marks: [] });
    await waitFor(() =>
      expect(screen.getByLabelText("Select term...")).toHaveValue(term.id),
    );
    expect(screen.getByText(/Term 1 \(Current\)/)).toBeInTheDocument();
  });

  it("asks the API again for a term the student picks", async () => {
    mount({ result: { average: 70, letterGrade: "B", rank: 1 }, marks: [] });
    await waitFor(() =>
      expect(screen.getByLabelText("Select term...")).toHaveValue(term.id),
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Select term..."), {
        target: { value: "term-2" },
      });
    });

    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(
        ([url, config]: any[]) =>
          String(url).includes("/marks/term-results/student") &&
          config?.params?.termId === "term-2",
      );
      expect(asked).toBe(true);
    });
  });

  it("asks for nothing at all before a term exists", async () => {
    serve(h.api, { ...routesWith(null), "/academic/terms": [] });
    renderPage(StudentMarksPage, { role: "STUDENT", user: { studentId: "student-1" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    // No term means no request, and no "nothing here" message either: an
    // empty state would read as a term with no marks.
    expect(
      h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("/marks/term-results/student"),
      ),
    ).toBe(false);
    expect(screen.queryByText("No marks found for this term.")).toBeNull();
  });
});

/**
 * Marks the school has not released yet.
 *
 * A term used to appear on this page the moment a teacher typed the marks in.
 * The API withholds them now and says so, and the page has to read as "not
 * out yet" rather than as an empty page that looks like the marks were lost.
 */
describe("results that are not out yet", () => {
  const withheld = { result: null, marks: [], published: false };

  it("says the results have not been released", async () => {
    mount(withheld);
    await waitFor(() =>
      expect(
        screen.getByText(/have not been released yet/i),
      ).toBeInTheDocument(),
    );
  });

  it("explains that teachers may still be checking them", async () => {
    mount(withheld);
    await waitFor(() =>
      expect(
        screen.getByText(/still be entering or checking marks/i),
      ).toBeInTheDocument(),
    );
  });

  // No average, grade or position either: those are the marks by another name.
  it("shows no average or position alongside it", async () => {
    mount(withheld);
    await waitFor(() =>
      expect(screen.getByText(/have not been released yet/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/class rank/i)).toBeNull();
  });

  // "No marks found" means the term is empty; being withheld is different.
  it("does not confuse it with a term that has no marks", async () => {
    mount(withheld);
    await waitFor(() =>
      expect(screen.getByText(/have not been released yet/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/no marks found/i)).toBeNull();
  });
});
