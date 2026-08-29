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
  usePathname: () => "/grading",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import GradingPage from "./page";

/**
 * How marks are graded.
 *
 * This used to be a legend at the foot of every report card, and moving it to
 * a page is not only about the room it freed. A legend has space for a grid
 * of numbers; the question a family actually arrives with is "why is 68% a
 * B", and answering that needs the weights, both scales, and the reason there
 * are two of them.
 *
 * So what is tested here is that the page answers the question rather than
 * merely reprinting the table: the weights are drawn as the proportions they
 * are, the stricter scale says out loud that it is stricter, and the two
 * words a Rwandan report card uses and nowhere else explains - competence and
 * aggregate - are explained.
 */

const scale = {
  scales: [
    {
      name: "Core scale",
      appliesTo: "Ordinary Level core subjects, and every Advanced Level module.",
      rows: [
        { range: "70-100", letter: "A", points: 6, remark: "Excellent" },
        { range: "0-19", letter: "F", points: 0, remark: "Fail" },
      ],
    },
    {
      name: "Elective scale",
      appliesTo:
        "Ordinary Level elective subjects only. It is the stricter of the two.",
      rows: [
        { range: "80-100", letter: "A", points: 6, remark: "Excellent" },
        { range: "0-49", letter: "F", points: 0, remark: "Fail" },
      ],
    },
  ],
  weights: [
    {
      scope: "O_CORE",
      name: "Ordinary Level, core subjects",
      parts: [
        { assessment: "CAT 1", percent: 20 },
        { assessment: "CAT 2", percent: 20 },
        { assessment: "End of Term Exam", percent: 60 },
      ],
    },
    {
      scope: "A_SPECIFIC",
      name: "Advanced Level, trade modules",
      parts: [
        { assessment: "CAT 1", percent: 15 },
        { assessment: "CAT 2", percent: 15 },
        { assessment: "Practical", percent: 30 },
        { assessment: "End of Term Exam", percent: 40 },
      ],
    },
  ],
  competence: {
    threshold: 70,
    competent: "A mark of 70% or above in a subject is Competent.",
    notYet: "Below 70% is Not Yet Competent, which says the work is unfinished rather than failed.",
    certificate:
      "A trade certificate requires at least grade E in the practical modules.",
  },
  aggregate: {
    maxPerSubject: 6,
    oLevel: "Ordinary Level aggregate is the sum of points from the 9 core subjects only. The maximum is 54.",
    aLevel: "Advanced Level aggregate is the sum of points over every module taken in the term.",
  },
  conduct: {
    outOf: 40,
    explanation:
      "Conduct is marked out of 40 each term. Every student starts the term on full marks.",
    bands: [
      { from: 95, remark: "Excellent" },
      { from: 0, remark: "Poor" },
    ],
  },
};

const routes = { ...populatedRoutes, "/academic/grading-scale": scale };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(role: "ADMIN" | "STUDENT" | "PARENT" = "STUDENT") {
  renderPage(GradingPage, { role });
  await waitFor(() =>
    expect(screen.getByText(/Core scale/)).toBeInTheDocument(),
  );
}

describe("what a term mark is made of", () => {
  /**
   * A family who can see that the exam is 60% of the total reads a poor CAT
   * differently from one who cannot, and a bar says the proportions faster
   * than a list of numbers does.
   */
  it("draws the weights as the proportions they are", async () => {
    await mount();
    const bar = screen.getByTitle("End of Term Exam: 60%");
    expect(bar).toHaveStyle({ width: "60%" });
  });

  it("names every kind of subject the school teaches", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Ordinary Level, core subjects");
    expect(text).toContain("Advanced Level, trade modules");
  });

  // The practical is the fact a TVET student most needs off this page.
  it("shows the practical where there is one", async () => {
    await mount();
    expect(screen.getByTitle("Practical: 30%")).toBeInTheDocument();
  });
});

describe("the scales", () => {
  it("gives both, and says who each is for", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Core scale");
    expect(text).toContain("Elective scale");
    expect(text).toMatch(/stricter of the two/);
  });

  /*
    The range as a reader recognises it. "70-100%" is the thing somebody
    checks their own mark against; a floor of 70 is not.
  */
  it("writes each band as the range it is", async () => {
    await mount();
    expect(document.body.textContent).toContain("70-100%");
    expect(document.body.textContent).toContain("80-100%");
  });

  it("says what each letter means rather than only naming it", async () => {
    await mount();
    expect(screen.getAllByText("Excellent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fail").length).toBeGreaterThan(0);
  });
});

/**
 * The two words a Rwandan report card uses and nowhere else explains.
 */
describe("the words on a report card", () => {
  it("explains competence as a different question from a grade", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/whether the learner can do the thing/i);
    expect(text).toMatch(/unfinished rather than failed/);
  });

  it("says what a trade certificate needs", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/at least grade E/);
  });

  it("explains the aggregate for both levels", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/9 core subjects/);
    expect(text).toMatch(/every module taken in the term/);
  });

  it("says how conduct is marked and where the marks go", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/starts the term on full marks/);
    expect(text).toContain("Excellent");
    expect(text).toContain("Poor");
  });
});

/**
 * Reference material every role reads, so it is open to every role. A family
 * asking why 68% is a B is the commonest reason anybody opens it at all.
 */
describe("who can read it", () => {
  it.each(["STUDENT", "PARENT", "ADMIN"] as const)(
    "renders for a %s",
    async (role) => {
      await mount(role);
      expect(screen.getByText(/Core scale/)).toBeInTheDocument();
    },
  );

  it("says so plainly when it cannot be loaded", async () => {
    serveFailure(h.api);
    renderPage(GradingPage, { role: "STUDENT" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/could not be loaded/i),
    );
  });
});
