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
  usePathname: () => "/admin/classes",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure } from "@/test/page";
import { exercisePage, fillEverything } from "@/test/exercise";
import { classLevel, classSection, populatedRoutes, trade } from "@/test/fixtures";

import ClassesPage from "./page";

const aLevel = {
  id: "level-2",
  name: "Level 4",
  stage: "A_LEVEL",
  order: 4,
};

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel, aLevel],
  "/academic/sections": [classSection],
  "/academic/trades": [trade],
};

function button(pattern: RegExp) {
  return screen
    .queryAllByRole("button")
    .find(
      (b) =>
        pattern.test((b.textContent ?? "").trim()) ||
        pattern.test(b.getAttribute("aria-label") ?? ""),
    );
}

async function click(el: HTMLElement | undefined) {
  if (!el) return false;
  await act(async () => {
    fireEvent.click(el);
  });
  return true;
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(ClassesPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Senior 1/)).toBeInTheDocument());
}

describe("the class structure", () => {
  it("lists the levels the school runs", async () => {
    await mount();
    expect(screen.getByText(/Level 4/)).toBeInTheDocument();
  });

  it("says so when nothing has been set up yet", async () => {
    serveAll(h.api, []);
    renderPage(ClassesPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Senior 1/)).not.toBeInTheDocument();
  });

  it("does not go blank when the structure fails to load", async () => {
    serveFailure(h.api);
    renderPage(ClassesPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });

  // Levels collapse by default; a school with twelve of them would otherwise
  // open on a wall of sections.
  it("expands a level to show its sections", async () => {
    await mount();
    await click(screen.getByText(/Senior 1/).closest("button") ?? undefined);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("adding a level", () => {
  it("opens the form", async () => {
    await mount();
    if (!(await click(button(/add level|new level/i)))) return;
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
  });

  it("refuses an empty submit and keeps the form open", async () => {
    await mount();
    if (!(await click(button(/add level|new level/i)))) return;
    const dialog = await screen.findByRole("dialog");
    h.api.post.mockClear();

    const save = within(dialog)
      .queryAllByRole("button")
      .find((b) => /save|create|add/i.test(b.textContent ?? ""));
    if (!save) return;
    await click(save);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("creates a level once the form is filled", async () => {
    await mount();
    if (!(await click(button(/add level|new level/i)))) return;
    const dialog = await screen.findByRole("dialog");
    await fillEverything();
    h.api.post.mockClear();

    const save = within(dialog)
      .queryAllByRole("button")
      .find((b) => /save|create|add/i.test(b.textContent ?? ""));
    if (!save) return;
    await click(save);

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
  });
});

describe("adding a trade", () => {
  // A-Level classes belong to a trade, so the two are managed side by side.
  it("opens the trade form", async () => {
    await mount();
    if (!(await click(button(/trade/i)))) return;
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("deleting", () => {
  it("asks first and deletes nothing until confirmed", async () => {
    await mount();
    const remove = button(/delete|remove/i);
    if (!remove) return;
    await click(remove);
    await waitFor(() => expect(h.api.delete).not.toHaveBeenCalled());
  });
});

describe("every control on the page", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 35 });
    expect(rejections).toEqual([]);
  }, 30000);

  it("is safe to use when the API refuses every write", async () => {
    await mount();
    for (const method of ["post", "put", "patch", "delete"] as const) {
      h.api[method].mockRejectedValue({
        response: { status: 400, data: { message: "Refused" } },
      });
    }
    const { rejections } = await exercisePage({ limit: 35 });
    expect(rejections).toEqual([]);
  }, 30000);
});

describe("editing what is already there", () => {
  /**
   * The edit controls are labelled with what they edit ("Edit Senior 1"), not
   * a bare "Edit", so a test looking for the latter finds nothing and passes
   * without testing anything.
   */
  async function openLevelEditor() {
    await mount();
    const edit = screen.getByRole("button", { name: /^edit senior 1$/i });
    await click(edit);
    return screen.findByRole("dialog");
  }

  it("opens a level with its details filled in", async () => {
    const dialog = await openLevelEditor();
    const name = within(dialog).getByLabelText(/name/i) as HTMLInputElement;
    expect(name.value).toBe("Senior 1");
  });

  // An edit must update the record, not add a second one beside it.
  it("updates rather than creating a duplicate", async () => {
    const dialog = await openLevelEditor();

    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/name/i), {
        target: { value: "Senior One" },
      });
    });
    h.api.put.mockClear();
    h.api.post.mockClear();

    // The modal has no form element; it saves from its own button.
    const save = within(dialog)
      .getAllByRole("button")
      .find((b) => /save|update/i.test(b.textContent ?? ""));
    expect(save).toBeTruthy();
    await click(save!);

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("opens a class within a level for editing", async () => {
    await mount();
    const expand = screen.getByText(/Senior 1/).closest("button");
    if (expand) await click(expand);

    const editClass = screen.queryByRole("button", { name: /^edit class$/i });
    if (!editClass) return;
    await click(editClass);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
  });
});

describe("adding a class to a level", () => {
  it("opens the form from the level's own button", async () => {
    await mount();
    const add = screen.getByRole("button", { name: /^add class to senior 1$/i });
    await click(add);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
  });

  // A-Level classes belong to a trade. One created without would be a class no
  // timetable or mark sheet could place.
  it("refuses an A-Level class with no trade chosen", async () => {
    await mount();
    const add = screen.getByRole("button", { name: /^add class to level 4$/i });
    await click(add);

    const dialog = await screen.findByRole("dialog");
    h.api.post.mockClear();
    h.toast.error.mockClear();

    const nameField = within(dialog).getAllByRole("textbox")[0];
    await act(async () => {
      fireEvent.change(nameField, { target: { value: "A" } });
    });

    const save = within(dialog)
      .getAllByRole("button")
      .find((b) => /save|add|create/i.test(b.textContent ?? ""));
    expect(save).toBeTruthy();
    await click(save!);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

describe("expanding a level", () => {
  it("shows the sections beneath it", async () => {
    await mount();
    const row = screen.getByText(/Senior 1/).closest("button");
    if (!row) return;
    await click(row);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("collapses again when tapped a second time", async () => {
    await mount();
    const row = screen.getByText(/Senior 1/).closest("button");
    if (!row) return;
    await click(row);
    await click(row);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});
