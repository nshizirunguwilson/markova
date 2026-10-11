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
  usePathname: () => "/teacher",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { classSection, populatedRoutes, subject } from "@/test/fixtures";

import TeacherDashboard from "./page";

/**
 * A teacher's front page.
 *
 * It answers one question: what am I teaching. A teacher can hold the same
 * class for three subjects, so the classes list has to be deduplicated, and a
 * class recorded without its year level still has to be nameable.
 */

const assignment = (id: string, section: Record<string, unknown>) => ({
  id,
  teacherId: "teacher-1",
  subjectId: subject.id,
  subject,
  classSectionId: section.id,
  classSection: section,
});

const routes = {
  ...populatedRoutes,
  "/academic/assignments": [assignment("a-1", classSection)],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

function mount(over: Record<string, unknown> = {}, user: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, ...over });
  renderPage(TeacherDashboard, {
    role: "TEACHER",
    user: { id: "u-3", teacherId: "teacher-1", ...user } as never,
  });
}

describe("what a teacher is teaching", () => {
  /* By the teacher record, which assignments belong to, not the person. */
  it("asks only for their own assignments", async () => {
    mount();
    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("teacherId=teacher-1"),
      );
      expect(asked).toBe(true);
    });
    const urls = h.api.get.mock.calls.map(([u]: any[]) => String(u));
    expect(urls.some((u) => u.includes("teacherId=u-3"))).toBe(false);
  });

  it("asks for nothing before the account has resolved", async () => {
    mount({}, { id: "", teacherId: undefined });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const urls = h.api.get.mock.calls.map(([u]: any[]) => String(u));
    // No teacher id, so the request must not carry an empty filter that would
    // return the whole school's timetable.
    expect(urls.some((u) => u.includes("teacherId="))).toBe(false);
  });

  it("counts each class once however many subjects it holds", async () => {
    mount({
      "/academic/assignments": [
        assignment("a-1", classSection),
        assignment("a-2", classSection),
        assignment("a-3", { ...classSection, id: "section-2", name: "B" }),
      ],
    });

    // Three assignments, two classes, and the count is pluralised.
    await waitFor(() =>
      expect(screen.getByText(/2 classes/)).toBeInTheDocument(),
    );
  });

  it("says one class in the singular", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/1 class$/)).toBeInTheDocument());
  });

  it("names a class recorded without its year level", async () => {
    mount({
      "/academic/assignments": [
        assignment("a-1", { id: "section-9", name: "Level 4 A", classLevel: null }),
      ],
    });

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it("copes with a teacher who has been given nothing yet", async () => {
    mount({ "/academic/assignments": null });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(document.body.textContent).not.toMatch(/undefined|NaN/);
  });

  it("spins rather than claiming a teacher has no classes", async () => {
    mount({ "/academic/assignments": () => new Promise(() => {}) });

    expect(screen.queryByText(/Enter Marks/)).toBeNull();
  });
});

describe("a teacher with a very full timetable", () => {
  it("says how many more there are than it is showing", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      assignment(`a-${i}`, { ...classSection, id: `section-${i}`, name: `S${i}` }),
    );
    mount({ "/academic/assignments": many });

    await waitFor(() => expect(screen.getByText("+3 more")).toBeInTheDocument());
  });

  it("says nothing of the sort for a short list", async () => {
    mount();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(screen.queryByText(/more$/)).toBeNull();
  });
});
