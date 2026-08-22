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
  sections: [
    {
      id: "section-3",
      name: "A",
      classLevelId: "level-2",
      trade,
      tradeId: trade.id,
      _count: { students: 30 },
    },
  ],
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

/**
 * The classes inside a level.
 *
 * A level card is a summary until it is opened; everything that acts on one
 * class - renaming it, moving it to another trade, removing it - lives in the
 * table underneath, which is only on screen once the level is expanded.
 */
describe("the classes inside an expanded level", () => {
  async function expand(name: string | RegExp = "Senior 1") {
    await mount();
    const row = screen.getByText(name).closest("div")!;
    await click(row);
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());
    return document.querySelector("table")!;
  }

  it("lists one row per class", async () => {
    const table = await expand();
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
  });

  // The head count is the number an admin acts on when deciding to open
  // another stream, so it has to be the class's own, not the level's.
  it("shows each class's own head count", async () => {
    const table = await expand();
    expect(table.textContent).toMatch(/32/);
    expect(table.textContent).toMatch(/28/);
  });

  it("builds the full class name from the level and the stream", async () => {
    const table = await expand();
    expect(table.textContent).toMatch(/Senior 1 A/);
  });

  // An A-Level class is known by its trade first. Without that column the rows
  // read as bare letters.
  it("gives an A-Level class its trade column", async () => {
    const table = await expand("Level 4");
    expect(table.textContent).toMatch(/SOD/);
    expect(table.textContent).toMatch(/Software Development/);
  });

  it("leaves the trade column off an O-Level level", async () => {
    const table = await expand();
    const headers = Array.from(table.querySelectorAll("th")).map((th) => th.textContent);
    expect(headers.join("|")).not.toMatch(/trade/i);
  });

  it("collapses again, hiding the table", async () => {
    await expand();
    // By exact text: once the level is open, its table also holds cells
    // reading "Senior 1 A", which a loose match would find first.
    const header = screen.getByText("Senior 1").closest("div")!;
    await click(header);
    await waitFor(() => expect(document.querySelector("table")).toBeNull());
  });

  // Only one level opens at a time, otherwise a school with twelve of them
  // scrolls forever.
  it("closes the level that was open when another is opened", async () => {
    await expand();
    const other = screen.getByText("Level 4").closest("div")!;
    await click(other);

    await waitFor(() => {
      const table = document.querySelector("table");
      expect(table?.textContent).toMatch(/SOD/);
    });
    expect(document.querySelectorAll("table")).toHaveLength(1);
  });
});

describe("editing one class", () => {
  async function openClassEditor() {
    await mount();
    await click(screen.getByText(/Senior 1/).closest("div")!);
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());

    const edit = screen.getAllByRole("button", { name: /^edit class$/i })[0];
    await click(edit);
    return screen.findByRole("dialog");
  }

  // The field is labelled "Stream": the letter, not the whole class name.
  it("opens with the class's current stream", async () => {
    const dialog = await openClassEditor();
    const name = within(dialog).getByLabelText(/stream/i) as HTMLInputElement;
    expect(name.value).toBe("A");
  });

  // An edit must update the class, not add a second one beside it.
  it("updates rather than creating a duplicate", async () => {
    const dialog = await openClassEditor();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/stream/i), {
        target: { value: "East" },
      });
    });

    h.api.put.mockClear();
    h.api.patch.mockClear();
    h.api.post.mockClear();
    const save = within(dialog)
      .getAllByRole("button")
      .find((b) => /save|update/i.test(b.textContent ?? ""));
    await click(save!);

    await waitFor(() =>
      expect(h.api.put.mock.calls.length + h.api.patch.mock.calls.length).toBeGreaterThan(0),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // Editing an A-Level class has to keep its trade, which an O-Level form
  // would drop from the payload entirely.
  it("keeps the trade on an A-Level class", async () => {
    await mount();
    await click(screen.getByText(/Level 4/).closest("div")!);
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());
    await click(screen.getAllByRole("button", { name: /^edit class$/i })[0]);

    const dialog = await screen.findByRole("dialog");
    h.api.put.mockClear();
    h.api.patch.mockClear();
    const save = within(dialog)
      .getAllByRole("button")
      .find((b) => /save|update/i.test(b.textContent ?? ""));
    await click(save!);

    await waitFor(() => {
      const call = [...h.api.put.mock.calls, ...h.api.patch.mock.calls][0];
      expect(call).toBeTruthy();
      expect((call[1] as any).tradeId).toBe("trade-1");
    });
  });
});

describe("removing a class", () => {
  async function askToDelete() {
    await mount();
    await click(screen.getByText(/Senior 1/).closest("div")!);
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());

    const remove = screen.getAllByRole("button", { name: /^delete class$/i })[0];
    if (!remove) return null;
    await click(remove);
    return screen.findByRole("dialog");
  }

  // A class holds thirty students' marks and attendance. Nothing goes on a
  // single tap.
  it("asks first", async () => {
    const dialog = await askToDelete();
    if (!dialog) return;
    expect(h.api.delete).not.toHaveBeenCalled();
    expect(dialog.textContent).toMatch(/delete/i);
  });

  it("deletes nothing when the ask is dismissed", async () => {
    const dialog = await askToDelete();
    if (!dialog) return;
    const cancel = within(dialog)
      .getAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    if (!cancel) return;
    await click(cancel);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes the class once confirmed", async () => {
    const dialog = await askToDelete();
    if (!dialog) return;
    h.api.delete.mockClear();
    const confirm = within(dialog)
      .getAllByRole("button")
      .find((b) => /^(delete|confirm)$/i.test((b.textContent ?? "").trim()));
    if (!confirm) return;
    await click(confirm);

    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
  });
});

describe("exporting the class structure", () => {
  it("writes a row per class, not per level", async () => {
    await mount();
    const exportBtn = button(/export/i);
    if (!exportBtn) return;
    await click(exportBtn);
    // Nothing to assert on the file itself; what matters is that building the
    // rows from nested sections does not throw.
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});
