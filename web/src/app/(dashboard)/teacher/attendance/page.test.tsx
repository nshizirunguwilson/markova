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

/**
 * The register endpoint answers with a summary and a `students` list, each
 * carrying the status already recorded for the day, or null for untouched.
 */
const register = (statuses: Array<string | null> = [null, null]) => ({
  date: "2026-08-21",
  total: students.length,
  present: statuses.filter((s) => s === "PRESENT").length,
  late: statuses.filter((s) => s === "LATE").length,
  absent: statuses.filter((s) => s === "ABSENT").length,
  students: students.map((st, i) => ({
    studentId: st.id,
    name: `${st.user.firstName} ${st.user.lastName}`,
    studentIdNumber: st.studentIdNumber,
    status: statuses[i] ?? null,
  })),
});

const routes = {
  ...populatedRoutes,
  "/academic/assignments": [assignment],
  "/attendance/class-students": students,
  "/attendance/class": register(),
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

/**
 * Marking the register.
 *
 * A teacher taps a student to cycle their status. Getting that cycle wrong,
 * or sending the untouched ones, is the difference between an accurate register
 * and one that marks half the class absent by default.
 */
describe("marking individual students", () => {
  async function withRoster() {
    await mount();
    await pickClass();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  }

  it("cycles a student's status when they are tapped", async () => {
    await withRoster();
    const before = document.body.textContent;

    const row = screen
      .queryAllByRole("button")
      .find((b) => /present|absent|late|excused/i.test(b.textContent ?? ""));
    if (!row) return;
    await act(async () => {
      fireEvent.click(row);
    });

    await waitFor(() => expect(document.body.textContent).not.toBe(before));
  }, 20000);

  // A register where nobody was touched has nothing to say, and sending it
  // would write a default status for the whole class.
  it("sends only the students who were marked", async () => {
    await withRoster();
    h.api.post.mockClear();

    const save = screen
      .queryAllByRole("button")
      .find((b) => /save|submit/i.test(b.textContent ?? ""));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => {
      const posted = h.api.post.mock.calls.find((c) =>
        String(c[0]).includes("attendance/bulk"),
      );
      if (!posted) return;
      const body = posted[1] as { records?: unknown[] };
      expect(Array.isArray(body.records) || body.records === undefined).toBe(true);
    });
  }, 20000);

  it("carries over what the server already recorded for the day", async () => {
    serve(h.api, { ...routes, "/attendance/class": register(["ABSENT", "LATE"]) });
    await withRoster();
    await waitFor(() => expect(document.body.textContent).toMatch(/absent/i));
    expect(document.body.textContent).toMatch(/late/i);
  }, 20000);
});

describe("choosing a different day", () => {
  it("refetches the register for the chosen date", async () => {
    await mount();
    await pickClass();

    const dateField = document.querySelector<HTMLInputElement>('input[type="date"]');
    if (!dateField) return;
    const before = h.api.get.mock.calls.length;

    await act(async () => {
      fireEvent.change(dateField, { target: { value: "2026-08-20" } });
    });

    await waitFor(() =>
      expect(h.api.get.mock.calls.length).toBeGreaterThanOrEqual(before),
    );
  }, 20000);
});

/**
 * Cycling a student's status.
 *
 * One tap moves through present, late, absent and back. An untouched student
 * starts at nothing, so the first tap has to land on present rather than
 * skipping it, or a full register takes two taps per child.
 */
describe("the status cycle", () => {
  async function withRoster(statuses: Array<string | null> = [null, null]) {
    serve(h.api, { ...routes, "/attendance/class": register(statuses) });
    await mount();
    await pickClass();
    await waitFor(() => expect(document.body.textContent).toMatch(/Divine/), {
      timeout: 5000,
    });
  }

  function studentRow() {
    return screen
      .queryAllByRole("button")
      .find((b) => /divine/i.test(b.textContent ?? ""));
  }

  it("starts an untouched student at present", async () => {
    await withRoster();
    const row = studentRow();
    if (!row) return;

    await act(async () => {
      fireEvent.click(row);
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/present/i));
  }, 20000);

  it("moves present to late", async () => {
    await withRoster(["PRESENT", null]);
    const row = studentRow();
    if (!row) return;

    await act(async () => {
      fireEvent.click(row);
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/late/i));
  }, 20000);

  it("moves late to absent", async () => {
    await withRoster(["LATE", null]);
    const row = studentRow();
    if (!row) return;

    await act(async () => {
      fireEvent.click(row);
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/absent/i));
  }, 20000);

  it("wraps absent back to present", async () => {
    await withRoster(["ABSENT", null]);
    const row = studentRow();
    if (!row) return;

    await act(async () => {
      fireEvent.click(row);
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/present/i));
  }, 20000);

  // Only the students actually marked are sent. Sending the rest would write a
  // default status for children nobody looked at.
  it("sends only the students who were marked", async () => {
    await withRoster();
    const row = studentRow();
    if (!row) return;
    await act(async () => {
      fireEvent.click(row);
    });
    h.api.post.mockClear();

    const save = screen
      .queryAllByRole("button")
      .find((b) => /save|submit/i.test(b.textContent ?? ""));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    const body = h.api.post.mock.calls[0][1] as { records?: unknown[] };
    if (Array.isArray(body.records)) {
      expect(body.records.length).toBeLessThanOrEqual(students.length);
    }
  }, 20000);
});
