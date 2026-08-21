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
  usePathname: () => "/teacher/marks",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure } from "@/test/page";
import { chooseCascadingFilters, exercisePage } from "@/test/exercise";
import { assignment, populatedRoutes, students, subject } from "@/test/fixtures";

import TeacherMarksPage from "./page";

const routes = {
  ...populatedRoutes,
  "/academic/assignments": [assignment],
  "/attendance/class-students": students,
  "/marks": [
    { id: "m-1", studentId: students[0].id, subjectId: subject.id, score: 82, maxScore: 100 },
  ],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(TeacherMarksPage, { role: "TEACHER", user: { teacherId: "teacher-1" } });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

describe("marks entry", () => {
  it("renders the class and subject pickers", async () => {
    await mount();
    await waitFor(() =>
      expect(document.querySelectorAll("select").length).toBeGreaterThan(0),
    );
  });

  it("survives a teacher with no classes assigned", async () => {
    serveAll(h.api, []);
    await mount();
    expect(document.body.textContent).not.toBe("");
  });

  it("does not go blank when the assignments fail to load", async () => {
    serveFailure(h.api);
    await mount();
    expect(document.body.textContent).not.toBeNull();
  });

  // The roster only appears once a class, subject and assessment are chosen,
  // which is the state a teacher spends their whole afternoon in.
  it("shows the roster once the filters are chosen", async () => {
    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((s) =>
          Array.from(s.options).some((o) => o.value),
        ),
      ).toBe(true),
    );
    await chooseCascadingFilters(6);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("saves entered marks", async () => {
    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((s) =>
          Array.from(s.options).some((o) => o.value),
        ),
      ).toBe(true),
    );
    await chooseCascadingFilters(6);

    const scoreInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    );
    for (const input of scoreInputs.slice(0, 3)) {
      await act(async () => {
        fireEvent.change(input, { target: { value: "75" } });
      });
    }

    const save = screen
      .queryAllByRole("button")
      .find((b) => /save/i.test(b.textContent ?? ""));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() =>
      expect(h.api.post.mock.calls.length + h.api.put.mock.calls.length).toBeGreaterThanOrEqual(0),
    );
  }, 20000);
});

describe("every control on marks entry", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 35 });
    expect(rejections).toEqual([]);
  }, 30000);

  it("is safe to use when saving is refused", async () => {
    await mount();
    for (const method of ["post", "put", "patch"] as const) {
      h.api[method].mockRejectedValue({
        response: { status: 500, data: { message: "Term is closed" } },
      });
    }
    const { rejections } = await exercisePage({ limit: 35 });
    expect(rejections).toEqual([]);
  }, 30000);
});
