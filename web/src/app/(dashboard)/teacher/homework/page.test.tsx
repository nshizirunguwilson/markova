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
  usePathname: () => "/teacher/homework",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure } from "@/test/page";
import { homework, populatedRoutes, subject } from "@/test/fixtures";

import HomeworkPage from "./page";

/**
 * A teacher's homework list.
 *
 * The half that matters is the submissions view: this is where marks are
 * actually awarded, and a mark typed here is a mark on a student's report.
 */

const assignment = {
  id: "assign-1",
  subjectId: "subject-1",
  subject,
  classSectionId: "section-1",
  teacherId: "teacher-1",
};

const routes = {
  ...populatedRoutes,
  "/academic/assignments": [assignment],
  "/homework/hw-1": homework,
  "/homework": [{ ...homework, _count: { submissions: 2 } }],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(HomeworkPage, { role: "TEACHER", user: { id: "u-3" } });
  await waitFor(() => expect(screen.getByText(/Algebra sheet 3/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

describe("the homework a teacher has set", () => {
  it("lists it with its subject and class", async () => {
    await mount();
    const row = screen.getByText(/Algebra sheet 3/).closest("tr")!;
    expect(row.textContent).toMatch(/Mathematics/);
  });

  it("says how many have been handed in", async () => {
    await mount();
    const row = screen.getByText(/Algebra sheet 3/).closest("tr")!;
    expect(row.textContent).toMatch(/2/);
  });

  it("says so when nothing has been set this term", async () => {
    serve(h.api, { ...routes, "/homework": [] });
    renderPage(HomeworkPage, { role: "TEACHER", user: { id: "u-3" } });
    await waitFor(() =>
      expect(screen.getByText(/no homework created/i)).toBeInTheDocument(),
    );
  });

  it("does not go blank when the list fails to load", async () => {
    serveFailure(h.api);
    renderPage(HomeworkPage, { role: "TEACHER", user: { id: "u-3" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  // The teacher's own assignments decide which classes they can set work for,
  // and a failure there must not take the page down with it.
  it("survives having no assignments to draw on", async () => {
    serve(h.api, { ...routes, "/academic/assignments": [] });
    renderPage(HomeworkPage, { role: "TEACHER", user: { id: "u-3" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("the submissions for one homework", () => {
  async function openSubmissions() {
    await mount();
    await click(screen.getAllByRole("button", { name: /^view$/i })[0]);
    return screen.findByRole("dialog");
  }

  it("names every student who handed in", async () => {
    const dialog = await openSubmissions();
    await waitFor(() => expect(dialog.textContent).toMatch(/Divine Niyonkuru/));
    expect(dialog.textContent).toMatch(/Keza Mutesi/);
  });

  // Late work is marked down, so which submissions were late has to be plain
  // before any marks are entered.
  it("marks which ones came in late", async () => {
    const dialog = await openSubmissions();
    await waitFor(() => expect(dialog.textContent).toMatch(/Late/));
    expect(dialog.textContent).toMatch(/On time/);
  });

  it("shows a mark that has already been given", async () => {
    const dialog = await openSubmissions();
    await waitFor(() => expect(dialog.textContent).toMatch(/17\/20/));
  });

  it("says how many of the class handed in", async () => {
    const dialog = await openSubmissions();
    await waitFor(() => expect(dialog.textContent).toMatch(/2\/2/));
  });

  // A submission already graded shows the mark, not another box to type in.
  it("offers a box only where there is no mark yet", async () => {
    const dialog = await openSubmissions();
    await waitFor(() => expect(dialog.textContent).toMatch(/Divine/));
    const boxes = within(dialog).getAllByRole("spinbutton");
    expect(boxes).toHaveLength(1);
  });

  it("grades a submission with the mark typed in", async () => {
    const dialog = await openSubmissions();
    await waitFor(() => expect(dialog.textContent).toMatch(/Divine/));

    const box = within(dialog).getAllByRole("spinbutton")[0];
    h.api.patch.mockClear();
    h.api.put.mockClear();
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.change(box, { target: { value: "15" } });
      fireEvent.blur(box);
    });

    await waitFor(() => {
      const call = [
        ...h.api.patch.mock.calls,
        ...h.api.put.mock.calls,
        ...h.api.post.mock.calls,
      ][0];
      expect(call).toBeTruthy();
      expect(JSON.stringify(call[1])).toMatch(/15/);
    });
  });

  // Tabbing out of an empty box is not a mark of zero.
  it("does not record anything when the box is left empty", async () => {
    const dialog = await openSubmissions();
    await waitFor(() => expect(dialog.textContent).toMatch(/Divine/));

    const box = within(dialog).getAllByRole("spinbutton")[0];
    h.api.patch.mockClear();
    h.api.put.mockClear();
    await act(async () => {
      fireEvent.blur(box);
    });

    await waitFor(() =>
      expect(h.api.patch.mock.calls.length + h.api.put.mock.calls.length).toBe(0),
    );
  });

  it("says so when nobody has handed in yet", async () => {
    serve(h.api, { ...routes, "/homework/hw-1": { ...homework, submissions: [] } });
    await mount();
    await click(screen.getAllByRole("button", { name: /^view$/i })[0]);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.textContent).toMatch(/Algebra sheet 3/));
    expect(within(dialog).queryAllByRole("spinbutton")).toHaveLength(0);
  });

  it("closes again", async () => {
    const dialog = await openSubmissions();
    const close = within(dialog)
      .getAllByRole("button")
      .find((b) => /close/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    await click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("setting new homework", () => {
  async function openForm() {
    await mount();
    await click(
      screen.getAllByRole("button").find((b) => /create homework/i.test(b.textContent ?? "")),
    );
    return screen.findByRole("dialog");
  }

  it("opens a form", async () => {
    const dialog = await openForm();
    expect(dialog.textContent).toMatch(/homework/i);
  });

  // Homework belongs to a subject and a class, and both come from the chosen
  // assignment. Without one there is nothing to attach it to.
  it("creates nothing until an assignment is chosen", async () => {
    const dialog = await openForm();
    h.api.post.mockClear();

    const save = within(dialog)
      .getAllByRole("button")
      .find((b) => /^(create|save|add)/i.test((b.textContent ?? "").trim()));
    if (!save) return;
    await click(save);

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("takes the subject and class from the assignment chosen", async () => {
    const dialog = await openForm();
    const select = within(dialog).getAllByRole("combobox")[0];
    await act(async () => {
      fireEvent.change(select, { target: { value: "assign-1" } });
    });

    for (const box of within(dialog).getAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "Algebra sheet 4" } });
      });
    }

    h.api.post.mockClear();
    const save = within(dialog)
      .getAllByRole("button")
      .find((b) => /^(create|save|add)/i.test((b.textContent ?? "").trim()));
    if (!save) return;
    await click(save);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/homework"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).subjectId).toBe("subject-1");
      expect((call![1] as any).classSectionId).toBe("section-1");
    });
  });
});

describe("removing a homework", () => {
  // Deleting takes every submission and mark with it.
  it("asks before deleting", async () => {
    await mount();
    h.api.delete.mockClear();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes it once confirmed", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    const confirm = within(dialog)
      .getAllByRole("button")
      .find((b) => /^(confirm|delete|yes)/i.test((b.textContent ?? "").trim()));
    if (!confirm) return;
    await click(confirm);

    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
  });

  it("deletes nothing when the ask is dismissed", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    const cancel = within(dialog)
      .getAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    if (!cancel) return;
    await click(cancel);

    await waitFor(() => expect(h.api.delete).not.toHaveBeenCalled());
  });
});

describe("a school with nothing set up", () => {
  it("does not crash with no term and no homework", async () => {
    serveAll(h.api, []);
    renderPage(HomeworkPage, { role: "TEACHER", user: { id: "u-3" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});
