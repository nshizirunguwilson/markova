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
  usePathname: () => "/teacher/discipline",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classSection, populatedRoutes, students } from "@/test/fixtures";

import TeacherDisciplinePage from "./page";

/**
 * A teacher recording conduct.
 *
 * Narrower than the admin's view: a teacher writes incidents down, but never
 * deletes them and never rules on an appeal. What they record costs a student
 * points and reaches a parent, so the record has to carry the term and the
 * action honestly.
 */

const incident = (over: Record<string, unknown> = {}) => ({
  id: "inc-1",
  date: "2026-08-18T10:00:00Z",
  description: "Late to assembly three times this week",
  pointsDeducted: 5,
  actionTaken: "VERBAL_WARNING",
  parentAcknowledged: false,
  student: { ...students[0], classSection },
  ...over,
});

const routes = {
  ...populatedRoutes,
  "/discipline/incidents": [
    incident(),
    incident({
      id: "inc-2",
      description: "Fighting in the corridor",
      pointsDeducted: 20,
      actionTaken: "SUSPENSION",
      parentAcknowledged: true,
      student: { ...students[1], classSection },
    }),
  ],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(TeacherDisciplinePage, { role: "TEACHER", user: { teacherId: "teacher-1" } });
  await waitFor(() => expect(screen.getByText(/Late to assembly/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function button(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

describe("the incidents this term", () => {
  it("lists them", async () => {
    await mount();
    expect(screen.getByText(/Fighting in the corridor/)).toBeInTheDocument();
  });

  it("names the student each one is about", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Divine/);
  });

  // The raw enum is not something to put in front of a teacher.
  it("writes the action in words", async () => {
    await mount();
    expect(screen.getByText("Verbal Warning")).toBeInTheDocument();
    expect(screen.getByText("Suspension")).toBeInTheDocument();
  });

  it("shows the points as a deduction", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/-?5/);
  });

  it("asks only for the current term", async () => {
    await mount();
    await waitFor(() => {
      const call = [...h.api.get.mock.calls]
        .reverse()
        .find(([url]) => String(url).includes("/discipline/incidents"));
      expect(String(call![0])).toMatch(/termId=term-1/);
    });
  });

  it("says so when nothing has been recorded", async () => {
    serve(h.api, { ...routes, "/discipline/incidents": [] });
    renderPage(TeacherDisciplinePage, { role: "TEACHER", user: { teacherId: "teacher-1" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Late to assembly/)).toBeNull();
  });

  it("does not go blank when the register fails to load", async () => {
    serveFailure(h.api);
    renderPage(TeacherDisciplinePage, { role: "TEACHER", user: { teacherId: "teacher-1" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

// A teacher writes conduct down; ruling on it is the head teacher's job.
describe("what a teacher may not do", () => {
  it("offers no way to delete an incident", async () => {
    await mount();
    expect(button(/^delete$/i)).toBeUndefined();
  });

  it("offers no appeal decisions", async () => {
    await mount();
    expect(button(/^approve$/i)).toBeUndefined();
    expect(button(/^reject$/i)).toBeUndefined();
  });
});

describe("recording an incident", () => {
  async function openForm() {
    await mount();
    await click(button(/record incident/i));
    return screen.findByRole("dialog");
  }

  function save(dialog: HTMLElement) {
    return within(dialog)
      .getAllByRole("button")
      .find((b) => /^(record|save|add|create)/i.test((b.textContent ?? "").trim()));
  }

  it("opens a form", async () => {
    const dialog = await openForm();
    expect(dialog.textContent).toMatch(/description/i);
  });

  it("defaults the date to today", async () => {
    const dialog = await openForm();
    const date = dialog.querySelector<HTMLInputElement>('input[type="date"]');
    expect(date).toBeTruthy();
    expect(date!.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // The lightest action by default: a teacher reaching for this form is not
  // usually about to suspend somebody.
  it("defaults the action to a verbal warning", async () => {
    const dialog = await openForm();
    const action = within(dialog)
      .getAllByRole("combobox")
      .filter((el): el is HTMLSelectElement => el.tagName === "SELECT")
      .find((el) =>
        Array.from(el.options).some((o) => o.value === "SUSPENSION"),
      ) as HTMLSelectElement;
    expect(action.value).toBe("VERBAL_WARNING");
  });

  it("records it against the current term", async () => {
    const dialog = await openForm();
    for (const box of within(dialog).getAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "Shouting in the corridor" } });
      });
    }

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/incidents"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).termId).toBe("term-1");
    });
  });

  // Points and action have to travel together, or the register cannot be used
  // to spot a pattern.
  it("carries the points and the action chosen", async () => {
    const dialog = await openForm();

    const action = within(dialog)
      .getAllByRole("combobox")
      .filter((el): el is HTMLSelectElement => el.tagName === "SELECT")
      .find((el) =>
        Array.from(el.options).some((o) => o.value === "DETENTION"),
      )!;
    await act(async () => {
      fireEvent.change(action, { target: { value: "DETENTION" } });
    });

    const points = within(dialog).getAllByRole("spinbutton")[0];
    await act(async () => {
      fireEvent.change(points, { target: { value: "10" } });
    });
    for (const box of within(dialog).getAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "Repeated lateness" } });
      });
    }

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => {
      const body = h.api.post.mock.calls[0][1] as any;
      expect(body.actionTaken).toBe("DETENTION");
      expect(body.pointsDeducted).toBe(10);
    });
  });

  // A string here would make the running total a concatenation on the server.
  it("sends the points as a number", async () => {
    const dialog = await openForm();
    const points = within(dialog).getAllByRole("spinbutton")[0];
    await act(async () => {
      fireEvent.change(points, { target: { value: "15" } });
    });
    for (const box of within(dialog).getAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "Rudeness to staff" } });
      });
    }

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() =>
      expect(typeof (h.api.post.mock.calls[0][1] as any).pointsDeducted).toBe("number"),
    );
  });

  it("closes without recording anything when dismissed", async () => {
    const dialog = await openForm();
    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});
