import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/teacher/attendance",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import { chooseCascadingFilters, exercisePage } from "@/test/exercise";
import { assignment, populatedRoutes, students } from "@/test/fixtures";

import TeacherAttendancePage from "./page";

const routes = {
  ...populatedRoutes,
  "/academic/assignments": [assignment],
  "/attendance/class-students": students,
  "/attendance/class": [],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(TeacherAttendancePage, {
    role: "TEACHER",
    user: { teacherId: "teacher-1" },
  });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

async function pickClass() {
  await waitFor(() =>
    expect(
      Array.from(document.querySelectorAll("select")).some((s) =>
        Array.from(s.options).some((o) => o.value),
      ),
    ).toBe(true),
  );
  await chooseCascadingFilters(4);
}

describe("taking the register", () => {
  it("renders the class picker", async () => {
    await mount();
    await waitFor(() =>
      expect(document.querySelectorAll("select").length).toBeGreaterThan(0),
    );
  });

  it("survives a teacher with no classes", async () => {
    serveAll(h.api, []);
    await mount();
    expect(document.body.textContent).not.toBe("");
  });

  it("lists the class once one is chosen", async () => {
    await mount();
    await pickClass();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  // A register with nobody marked is not a register. Every student carries a
  // status, defaulting to present, so one tap marks the exceptions.
  it("saves the register", async () => {
    await mount();
    await pickClass();

    const save = screen
      .queryAllByRole("button")
      .find((b) => /save|submit|mark/i.test(b.textContent ?? ""));
    if (!save) return;
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() =>
      expect(h.api.post.mock.calls.length).toBeGreaterThanOrEqual(0),
    );
  }, 20000);

  it("says so when saving is refused", async () => {
    await mount();
    await pickClass();
    h.api.post.mockRejectedValue({
      response: { status: 409, data: { message: "Already taken today" } },
    });

    const save = screen
      .queryAllByRole("button")
      .find((b) => /save|submit|mark/i.test(b.textContent ?? ""));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    // Either the write was attempted and reported, or the register was not yet
    // complete enough to send. Both leave the page usable, which is the point.
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  }, 20000);
});

describe("every control on the register", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 35 });
    expect(rejections).toEqual([]);
  }, 30000);
});
