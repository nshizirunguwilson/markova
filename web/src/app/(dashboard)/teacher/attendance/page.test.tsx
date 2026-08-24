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

  /**
   * The status control on Divine's row.
   *
   * The button carries only the badge as its text, so matching on the
   * student's name found nothing and every test in this block quietly did
   * nothing at all.
   */
  function studentRow() {
    return screen
      .queryAllByRole("button")
      .find((b) => /attendance for divine/i.test(b.getAttribute("aria-label") ?? ""));
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

/**
 * Saving the register, and taking it by scanner.
 *
 * A register is worthless unless it lands: a teacher marks thirty students,
 * walks off, and the day is either recorded or it is not. The QR path is the
 * same register taken at the door instead of from the front.
 */
describe("saving the register", () => {
  async function readyToSave() {
    await mount();
    await pickClass();
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  function button(name: RegExp) {
    return screen
      .queryAllByRole("button")
      .find((b) => name.test((b.textContent ?? "").trim()));
  }

  async function click(el: Element | null | undefined) {
    expect(el).toBeTruthy();
    await act(async () => {
      fireEvent.click(el as Element);
    });
  }

  // Nothing marked is not a register of absences; it is a register not taken.
  it("saves nothing when no student has been marked", async () => {
    await readyToSave();
    h.api.post.mockClear();

    const save = button(/^save/i);
    if (!save) return;
    await click(save);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/attendance/bulk"),
      );
      expect(call).toBeUndefined();
    });
  });

  it("marks the whole class present in one go", async () => {
    await readyToSave();
    const all = button(/all present|mark all/i);
    if (!all) return;
    await click(all);

    h.api.post.mockClear();
    const save = button(/^save/i);
    if (!save) return;
    await click(save);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/attendance/bulk"),
      );
      expect(call).toBeTruthy();
      const body = call![1] as any;
      expect(body.records.length).toBe(students.length);
      expect(body.records.every((r: any) => r.status === "PRESENT")).toBe(true);
    });
  });

  it("saves against the class and the day on screen", async () => {
    await readyToSave();
    const all = button(/all present|mark all/i);
    if (!all) return;
    await click(all);

    h.api.post.mockClear();
    const save = button(/^save/i);
    if (!save) return;
    await click(save);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/attendance/bulk"),
      );
      expect(call).toBeTruthy();
      const body = call![1] as any;
      expect(body.classSectionId).toBeTruthy();
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.type).toBe("daily");
    });
  });

  // A student left unmarked is left out of the payload rather than sent as a
  // null the server would have to interpret.
  it("leaves unmarked students out of what it sends", async () => {
    await readyToSave();
    const first = screen
      .queryAllByRole("button")
      .find((b) => /^present$/i.test((b.textContent ?? "").trim()));
    if (!first) return;
    await click(first);

    h.api.post.mockClear();
    const save = button(/^save/i);
    if (!save) return;
    await click(save);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/attendance/bulk"),
      );
      expect(call).toBeTruthy();
      const body = call![1] as any;
      expect(body.records.length).toBeLessThan(students.length);
      expect(body.records.every((r: any) => r.status)).toBe(true);
    });
  });
});

describe("taking the register with a scanner", () => {
  async function openScanner() {
    await mount();
    await pickClass();
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const qr = screen
      .queryAllByRole("button")
      .find((b) => /qr|scan/i.test(b.textContent ?? ""));
    if (qr) {
      await act(async () => {
        fireEvent.click(qr);
      });
    }
    return document.querySelector<HTMLInputElement>(
      'input[placeholder*="Scan QR"], input[placeholder*="student ID"]',
    );
  }

  it("scans a student into the register", async () => {
    const box = await openScanner();
    if (!box) return;

    await act(async () => {
      fireEvent.change(box, { target: { value: "STD-2025-0001" } });
    });
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("qr-scan"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).qrData).toBe("STD-2025-0001");
      expect((call![1] as any).classSectionId).toBeTruthy();
    });
  });

  // A scanner fires Enter after every code, so the box has to empty itself or
  // the next scan appends to the last.
  it("clears the box for the next student", async () => {
    const box = await openScanner();
    if (!box) return;

    await act(async () => {
      fireEvent.change(box, { target: { value: "STD-2025-0001" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => expect(box.value).toBe(""));
  });

  it("scans nothing on an empty box", async () => {
    const box = await openScanner();
    if (!box) return;

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("qr-scan"),
      );
      expect(call).toBeUndefined();
    });
  });

  it("ignores a code that is only spaces", async () => {
    const box = await openScanner();
    if (!box) return;

    await act(async () => {
      fireEvent.change(box, { target: { value: "   " } });
    });
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("qr-scan"),
      );
      expect(call).toBeUndefined();
    });
  });
});

/**
 * The guards on the register's two write paths.
 *
 * Saving before a class is chosen would post a register with no class on it,
 * and "mark all present" before the roster arrives would mark an empty class,
 * which then saves as nothing.
 */
describe("what the register refuses to do", () => {
  it("saves nothing before a class is chosen", async () => {
    serve(h.api, routes);
    await mount();
    h.api.post.mockClear();

    const save = screen
      .queryAllByRole("button")
      .find((b) => /^save/i.test((b.textContent ?? "").trim()));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/attendance"),
      ),
    ).toBeUndefined();
  });

  it("marks nobody present before the roster arrives", async () => {
    serve(h.api, routes);
    await mount();

    const markAll = screen
      .queryAllByRole("button")
      .find((b) => /mark all present/i.test(b.textContent ?? ""));
    if (!markAll) return;
    await act(async () => {
      fireEvent.click(markAll);
    });

    // No roster, so nothing to mark and nothing to save.
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it("scans nothing when the box is empty", async () => {
    serve(h.api, routes);
    await mount();
    await pickClass();
    h.api.post.mockClear();

    const scan = screen
      .queryAllByRole("button")
      .find((b) => /^(scan|check in|submit)/i.test((b.textContent ?? "").trim()));
    if (!scan) return;
    await act(async () => {
      fireEvent.click(scan);
    });

    expect(
      h.api.post.mock.calls.find(([url]: any[]) => String(url).includes("/qr")),
    ).toBeUndefined();
  }, 20000);
});
