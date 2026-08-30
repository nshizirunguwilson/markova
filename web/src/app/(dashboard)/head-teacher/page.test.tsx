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
  usePathname: () => "/head-teacher",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import HeadTeacherPage from "./page";

/**
 * What the Director of Studies opens in the morning.
 *
 * Their day is spent unblocking a pipeline they do not run themselves, so the
 * question that starts it is "what is stuck, and on whom". What these tests
 * hold is that the page answers exactly that: every class names the one thing
 * holding it up and the person it falls to, and the rows that need the head
 * teacher come first.
 */

const klass = (over: Record<string, unknown> = {}) => ({
  classSectionId: "section-1",
  name: "Senior 1 A",
  students: 30,
  marksReleased: 30,
  commentsWritten: 30,
  confirmed: 0,
  issued: 0,
  subjectsMarked: 11,
  subjectsTaught: 11,
  average: 68.4,
  blocker: "AWAITING_CONFIRMATION",
  owner: "You",
  ...over,
});

const overview = (over: Record<string, unknown> = {}) => ({
  term: { id: "term-1", name: "Term 2", academicYear: "2026-2027" },
  classes: [klass()],
  staff: { total: 46, present: 45, absent: 0, absentToday: [], taken: true },
  ...over,
});

const routes = {
  ...populatedRoutes,
  "/marks/head-teacher/overview": overview(),
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(data?: Record<string, unknown>) {
  if (data) serve(h.api, { ...routes, "/marks/head-teacher/overview": data });
  renderPage(HeadTeacherPage, { role: "HEAD_TEACHER" });
  await waitFor(() =>
    expect(screen.getByText(/Academic overview/)).toBeInTheDocument(),
  );
}

describe("the two things with a deadline", () => {
  it("leads with how much is waiting on the head teacher", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Waiting on your check/);
    expect(document.body.textContent).toMatch(/need reading before the principal/);
  });

  /* Nothing waiting is a real answer and should read like one, not like an
     empty page. */
  it("says so plainly when nothing is waiting on them", async () => {
    await mount(
      overview({ classes: [klass({ blocker: "DONE", owner: "", issued: 30, confirmed: 30 })] }),
    );
    expect(document.body.textContent).toMatch(/Nothing is waiting on you/);
  });

  it("offers the way to act on it only when there is something", async () => {
    await mount();
    expect(screen.getByText(/Open the report cards/)).toBeInTheDocument();
  });

  it("names the term the figures are for", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Term 2, 2026-2027/);
  });

  it("copes with a school between terms", async () => {
    await mount(overview({ term: null, classes: [] }));
    expect(document.body.textContent).toMatch(/No term is running/);
  });
});

/**
 * The one figure with a deadline in minutes rather than days: a class whose
 * teacher is absent needs cover before the first lesson.
 */
describe("who is in today", () => {
  it("names who is away rather than only counting them", async () => {
    await mount(
      overview({
        staff: {
          total: 46,
          present: 44,
          absent: 2,
          taken: true,
          absentToday: [
            { id: "t1", name: "Aline Uwase", status: "ABSENT" },
            { id: "t2", name: "Jean Bosco", status: "LATE" },
          ],
        },
      }),
    );
    expect(document.body.textContent).toMatch(/Aline Uwase \(absent\)/);
    expect(document.body.textContent).toMatch(/Jean Bosco \(late\)/);
  });

  it("says everybody is in when they are", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/No cover needed/);
  });

  /**
   * A register nobody has taken is not a school with nobody absent, and the
   * difference matters at half past eight.
   */
  it("says when nobody has taken the register", async () => {
    await mount(
      overview({
        staff: { total: 46, present: 0, absent: 0, absentToday: [], taken: false },
      }),
    );
    expect(document.body.textContent).toMatch(/Register not taken/);
    expect(document.body.textContent).not.toMatch(/No cover needed/);
  });
});

/**
 * Every class names the one thing holding it up. Not a list of everything
 * outstanding: a class teacher cannot write a comment on marks nobody
 * entered, so two of the three would be things nobody can do yet.
 */
describe("where each class is", () => {
  it("says what is holding a class up, in words", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Waiting on your check/);
  });

  it("names whose move it is", async () => {
    await mount(
      overview({
        classes: [
          klass({ blocker: "COMMENTS_NOT_WRITTEN", owner: "Class teacher" }),
        ],
      }),
    );
    expect(document.body.textContent).toMatch(/Class teacher/);
  });

  it("shows how far the class has got towards that one step", async () => {
    await mount(
      overview({
        classes: [
          klass({
            blocker: "COMMENTS_NOT_WRITTEN",
            owner: "Class teacher",
            commentsWritten: 18,
          }),
        ],
      }),
    );
    expect(document.body.textContent).toMatch(/18 of 30/);
  });

  it("measures marks entry against the subjects taught", async () => {
    await mount(
      overview({
        classes: [
          klass({
            blocker: "MARKS_NOT_ENTERED",
            owner: "Subject teachers",
            subjectsMarked: 7,
            subjectsTaught: 11,
          }),
        ],
      }),
    );
    expect(document.body.textContent).toMatch(/7 of 11/);
  });

  /**
   * Ordered by what needs doing rather than by name. Sorted alphabetically
   * this is a list; sorted by what is waiting, it is a queue.
   */
  it("puts the rows that need the head teacher first", async () => {
    await mount(
      overview({
        classes: [
          klass({ classSectionId: "a", name: "A Class", blocker: "DONE", owner: "" }),
          klass({
            classSectionId: "b",
            name: "Z Class",
            blocker: "AWAITING_CONFIRMATION",
            owner: "You",
          }),
        ],
      }),
    );
    const rows = [...document.querySelectorAll("li")].map((li) => li.textContent);
    const zed = rows.findIndex((t) => t?.includes("Z Class"));
    const ay = rows.findIndex((t) => t?.includes("A Class"));
    expect(zed).toBeLessThan(ay);
  });

  it("marks a finished class as issued rather than as somebody's job", async () => {
    await mount(
      overview({
        classes: [klass({ blocker: "DONE", owner: "", confirmed: 30, issued: 30 })],
      }),
    );
    expect(document.body.textContent).toMatch(/Issued/);
  });

  it("carries the class average where one has been worked out", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/68\.4% average/);
  });

  it("says nothing about an average that has not been worked out", async () => {
    await mount(overview({ classes: [klass({ average: null })] }));
    expect(document.body.textContent).not.toMatch(/average/);
  });

  it("says so when the school has no classes yet", async () => {
    await mount(overview({ classes: [] }));
    expect(document.body.textContent).toMatch(/No classes have been set up/);
  });

  it("does not go blank when the overview fails to load", async () => {
    serveFailure(h.api);
    renderPage(HeadTeacherPage, { role: "HEAD_TEACHER" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/could not be loaded/i),
    );
  });
});
