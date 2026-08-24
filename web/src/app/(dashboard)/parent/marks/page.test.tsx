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
  usePathname: () => "/parent/marks",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { academicYear, classSection, populatedRoutes, term } from "@/test/fixtures";

import ParentMarksPage from "./page";

/**
 * A parent looking at one child's marks.
 *
 * Which child is the first decision on the page, and it behaves differently
 * for a family with one child than for a family with three: one child is
 * stated, several are chosen. Getting that wrong shows one parent another
 * parent's child, which is the worst thing this page could do.
 */

function mark(subjectId: string, subjectName: string, score: number, type = "Exam") {
  return {
    id: `m-${subjectId}-${type}`,
    subjectId,
    subject: { id: subjectId, name: subjectName },
    assessmentType: { id: "at-1", name: type },
    score,
    maxScore: 100,
  };
}

/** The `/users/:id` shape the page reads its children out of. */
function parentWith(...kids: { id: string; first: string; last: string; section?: unknown }[]) {
  return {
    id: "parent-1",
    parentStudents: kids.map((k) => ({
      student: {
        id: k.id,
        user: { firstName: k.first, lastName: k.last },
        classSection: "section" in k ? k.section : classSection,
      },
    })),
  };
}

const terms = [term, { ...term, id: "term-2", name: "Term 2", isCurrent: false }];

function routesWith(parent: unknown, result: unknown) {
  return {
    ...populatedRoutes,
    "/academic/years": [academicYear],
    "/academic/terms": terms,
    "/users/parent-1": parent,
    "/marks/term-results/student": result,
  };
}

const someMarks = {
  result: { average: 74.25, letterGrade: "B", rank: 3, teacherComment: "Works hard." },
  marks: [mark("s-1", "Mathematics", 85), mark("s-2", "Kinyarwanda", 63)],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

function mount(parent: unknown, result: unknown = someMarks) {
  serve(h.api, routesWith(parent, result));
  renderPage(ParentMarksPage, { role: "PARENT", user: { id: "parent-1" } });
}

describe("a family with one child", () => {
  const single = parentWith({ id: "student-1", first: "Keza", last: "Uwimana" });

  it("names the child rather than offering a pointless choice", async () => {
    mount(single);
    // Once in the "viewing marks for" line, once on the child card.
    await waitFor(() => expect(screen.getAllByText("Keza Uwimana").length).toBe(2));
    expect(screen.queryByLabelText("Child")).toBeNull();
  });

  it("shows which class that child is in", async () => {
    mount(single);
    await waitFor(() => expect(screen.getAllByText("Keza Uwimana").length).toBe(2));
    expect(screen.getByText(/Senior 1/)).toBeInTheDocument();
  });

  it("asks for that child's marks without being told to", async () => {
    mount(single);
    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("/marks/term-results/student/student-1"),
      );
      expect(asked).toBe(true);
    });
  });

  it("leaves the class blank when the child is not in one yet", async () => {
    mount(parentWith({ id: "student-1", first: "Keza", last: "Uwimana", section: null }));
    await waitFor(() => expect(screen.getAllByText("Keza Uwimana").length).toBe(2));
    expect(screen.queryByText(/Senior 1/)).toBeNull();
  });
});

describe("a family with more than one child", () => {
  const several = parentWith(
    { id: "student-1", first: "Keza", last: "Uwimana" },
    { id: "student-2", first: "Manzi", last: "Habimana" },
  );

  it("offers a choice between them", async () => {
    mount(several);
    const picker = await screen.findByLabelText("Child");
    expect(picker).toHaveValue("student-1");
    expect(screen.getByText(/Manzi Habimana/)).toBeInTheDocument();
  });

  it("fetches the other child's marks when the parent switches", async () => {
    mount(several);
    await screen.findByLabelText("Child");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Child"), {
        target: { value: "student-2" },
      });
    });

    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("/marks/term-results/student/student-2"),
      );
      expect(asked).toBe(true);
    });
  });
});

describe("a parent with no children linked to them", () => {
  it("shows no child card at all", async () => {
    mount({ id: "parent-1", parentStudents: [] });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByLabelText("Child")).toBeNull();
    expect(screen.queryByText(/Viewing marks for/)).toBeNull();
  });

  it("does not go blank when the link lookup fails", async () => {
    serve(h.api, { ...routesWith(null, someMarks), "/users/parent-1": undefined });
    h.api.get.mockImplementation(async (url: string) => {
      if (String(url).includes("/users/parent-1")) {
        throw Object.assign(new Error("nope"), { response: { status: 403 } });
      }
      return { data: [] };
    });
    renderPage(ParentMarksPage, { role: "PARENT", user: { id: "parent-1" } });

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.getByText(/Child.s Marks/)).toBeInTheDocument();
  });
});

describe("the marks themselves", () => {
  const single = parentWith({ id: "student-1", first: "Keza", last: "Uwimana" });

  it("shows the average, grade and position", async () => {
    mount(single);
    expect(await screen.findByText("74.3%")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  it("colours a strong subject differently from a weak one", async () => {
    mount(single);
    await screen.findByText("Mathematics");

    const bar = (name: string) =>
      screen
        .getByText(name)
        .closest("div")!
        .parentElement!.querySelector("[style*='width']")!.className;

    expect(bar("Mathematics")).not.toBe(bar("Kinyarwanda"));
  });

  it("draws em dashes for a result with no numbers on it", async () => {
    mount(single, { result: { average: null, letterGrade: null, rank: null }, marks: [] });
    expect(await screen.findByText("—%")).toBeInTheDocument();
  });

  it("says plainly when a term has no marks", async () => {
    mount(single, { result: null, marks: [] });
    expect(
      await screen.findByText("No marks found for this term."),
    ).toBeInTheDocument();
  });

  it("shows the head teacher's comment when there is one", async () => {
    mount(single, {
      result: { average: 74, letterGrade: "B", rank: 3, headmasterComment: "A pleasure to teach." },
      marks: [],
    });
    expect(await screen.findByText("A pleasure to teach.")).toBeInTheDocument();
    expect(screen.queryByText("Class Teacher")).toBeNull();
  });

  it("shows no comments card when nobody has written", async () => {
    mount(single, { result: { average: 74, letterGrade: "B", rank: 3 }, marks: [] });
    await screen.findByText("74.0%");
    expect(screen.queryByText("Comments")).toBeNull();
  });

  it("re-asks for a term the parent chooses", async () => {
    mount(single);
    await waitFor(() => expect(screen.getByLabelText("Term")).toHaveValue(term.id));

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Term"), { target: { value: "term-2" } });
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
});
