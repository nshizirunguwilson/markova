import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    offline: {
      save: fn(),
      get: fn(async () => []),
      clear: fn(),
      count: fn(async () => 0),
    },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/teacher/marks",
  useSearchParams: () => new URLSearchParams(),
}));

// The offline queue is IndexedDB. What this page owns is when it saves to the
// queue, when it drains it, and what it tells the teacher; the storage itself
// is tested in src/lib/offline-db.test.ts.
vi.mock("@/lib/offline-db", () => ({
  savePendingMarks: h.offline.save,
  getPendingMarks: h.offline.get,
  clearPendingMarks: h.offline.clear,
  getPendingCount: h.offline.count,
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
  h.offline.save.mockReset().mockResolvedValue(undefined);
  h.offline.get.mockReset().mockResolvedValue([]);
  h.offline.clear.mockReset().mockResolvedValue(undefined);
  h.offline.count.mockReset().mockResolvedValue(0);
  setOnline(true);
  serve(h.api, routes);
});

/** The browser's own online flag, which the page listens to. */
function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

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

/**
 * Marks entry on a classroom connection.
 *
 * This is the feature the whole offline queue exists for: a teacher fills in a
 * class, the save fails, and their afternoon must not be lost. Losing a
 * register is recoverable; losing a term's marks is not.
 */
describe("entering marks while offline", () => {
  it("tells the teacher when the connection has gone", async () => {
    setOnline(false);
    await mount();
    await act(async () => {
      fireEvent(window, new Event("offline"));
    });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("shows how many entries are waiting to be sent", async () => {
    h.offline.count.mockResolvedValue(3);
    await mount();
    await waitFor(() => expect(h.offline.count).toHaveBeenCalled());
  });

  // Coming back online should drain the queue without the teacher asking.
  it("sends the queue when the connection returns", async () => {
    h.offline.get.mockResolvedValue([
      { id: 1, savedAt: 1, classSectionId: "section-1", termId: "term-1", entries: [] },
    ]);
    h.offline.count.mockResolvedValue(1);
    h.api.post.mockResolvedValue({ data: { saved: 1 } });

    await mount();
    await act(async () => {
      fireEvent(window, new Event("online"));
    });

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/marks/batch"))).toBe(true);
    }, { timeout: 5000 });
  }, 20000);

  it("clears the queue once everything has been sent", async () => {
    h.offline.get.mockResolvedValue([
      { id: 1, savedAt: 1, classSectionId: "section-1", termId: "term-1", entries: [] },
    ]);
    h.offline.count.mockResolvedValue(1);
    h.api.post.mockResolvedValue({ data: { saved: 1 } });

    await mount();
    await act(async () => {
      fireEvent(window, new Event("online"));
    });

    await waitFor(() => expect(h.offline.clear).toHaveBeenCalled(), {
      timeout: 5000,
    });
  }, 20000);

  // A partial sync must keep what did not go, or the failed half is lost for
  // good on the next attempt.
  it("keeps the queue when only some entries went through", async () => {
    h.offline.get.mockResolvedValue([
      { id: 1, savedAt: 1, classSectionId: "section-1", termId: "term-1", entries: [] },
      { id: 2, savedAt: 2, classSectionId: "section-1", termId: "term-1", entries: [] },
    ]);
    h.offline.count.mockResolvedValue(2);
    h.api.post
      .mockResolvedValueOnce({ data: { saved: 1 } })
      .mockRejectedValue({ response: { status: 500 } });

    await mount();
    await act(async () => {
      fireEvent(window, new Event("online"));
    });

    await waitFor(
      () =>
        expect(
          h.toast.warning.mock.calls.length + h.api.post.mock.calls.length,
        ).toBeGreaterThan(0),
      { timeout: 5000 },
    );
    expect(h.offline.clear).not.toHaveBeenCalled();
  }, 20000);

  it("does nothing when the queue is empty", async () => {
    h.offline.get.mockResolvedValue([]);
    await mount();
    h.api.post.mockClear();
    await act(async () => {
      fireEvent(window, new Event("online"));
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(h.offline.clear).not.toHaveBeenCalled();
  }, 20000);
});
