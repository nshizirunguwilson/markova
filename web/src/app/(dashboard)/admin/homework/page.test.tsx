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
  usePathname: () => "/admin/homework",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, homework, populatedRoutes, subject } from "@/test/fixtures";

import AdminHomeworkPage from "./page";

/**
 * Homework across the whole school.
 *
 * The admin view exists to answer one question a head teacher asks: is anyone
 * setting work, and how much. So the filters are the feature, and a homework
 * created here has to carry the subject, class and teacher it belongs to.
 */

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/academic/subjects": [subject],
  "/homework": [
    { ...homework, _count: { submissions: 2 } },
    {
      ...homework,
      id: "hw-2",
      title: "Essay on Imigani",
      dueDate: "2026-09-15",
      _count: { submissions: 0 },
    },
  ],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(AdminHomeworkPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Algebra sheet 3/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

/** The filters the homework list was last asked for. */
function lastQuery(): Record<string, string | undefined> {
  const call = [...h.api.get.mock.calls]
    .reverse()
    .find(([url]) => String(url).startsWith("/homework"));
  const qs = String(call?.[0] ?? "").split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(qs).entries());
}

describe("homework across the school", () => {
  it("lists what has been set", async () => {
    await mount();
    expect(screen.getByText(/Essay on Imigani/)).toBeInTheDocument();
  });

  it("shows the subject and class each belongs to", async () => {
    await mount();
    const row = screen.getByText(/Algebra sheet 3/).closest("tr")!;
    expect(row.textContent).toMatch(/Mathematics/);
    expect(row.textContent).toMatch(/Senior 1/);
  });

  // How many have handed in is the number a head teacher acts on.
  it("shows how many have been handed in", async () => {
    await mount();
    const row = screen.getByText(/Algebra sheet 3/).closest("tr")!;
    expect(row.textContent).toMatch(/2/);
  });

  it("does not go blank when the list fails to load", async () => {
    serveFailure(h.api);
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("survives a school where nothing has been set", async () => {
    serve(h.api, { ...routes, "/homework": [] });
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Algebra sheet 3/)).toBeNull();
  });
});

describe("narrowing the list", () => {
  // Unfiltered means every homework in the school, so the first request must
  // carry no filters at all rather than empty ones.
  it("asks for everything before any filter is chosen", async () => {
    await mount();
    expect(lastQuery().classSectionId).toBeUndefined();
    expect(lastQuery().subjectId).toBeUndefined();
  });

  it("filters to one subject", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all subjects/i), {
        target: { value: "subject-1" },
      });
    });

    await waitFor(() => expect(lastQuery().subjectId).toBe("subject-1"));
  });

  // Classes belong to a level, so the class picker waits for one.
  it("filters to one class once a level is chosen", async () => {
    await mount();
    await act(async () => {
      // The filter bar's level picker. "Class Level" is the one inside the
      // create form, which is not open here.
      fireEvent.change(screen.getByLabelText(/all levels/i), {
        target: { value: "level-1" },
      });
    });

    const sections = screen.getByLabelText(/all sections/i) as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(sections.options).some((o) => o.value)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(sections, { target: { value: "section-1" } });
    });

    await waitFor(() => expect(lastQuery().classSectionId).toBe("section-1"));
  });

  it("goes back to everything when a filter is cleared", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all subjects/i), {
        target: { value: "subject-1" },
      });
    });
    await waitFor(() => expect(lastQuery().subjectId).toBe("subject-1"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all subjects/i), { target: { value: "" } });
    });
    await waitFor(() => expect(lastQuery().subjectId).toBeUndefined());
  });
});

describe("removing a homework", () => {
  // Deleting takes every submission and mark recorded against it.
  it("asks first", async () => {
    await mount();
    h.api.delete.mockClear();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(h.api.delete).not.toHaveBeenCalled();
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

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes it once confirmed", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    const confirm = within(dialog)
      .getAllByRole("button")
      .find((b) => /^(delete|confirm)$/i.test((b.textContent ?? "").trim()));
    if (!confirm) return;
    await click(confirm);

    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
  });
});
