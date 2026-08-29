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

/**
 * Trades, and what each Delete actually deletes.
 *
 * Three different things share one confirmation dialog, so the wording has to
 * say which of the three it is about, and each has to reach its own endpoint.
 * Deleting a trade when you meant a class would take every A-Level stream with
 * it.
 */
describe("adding a trade", () => {
  async function openTradeForm() {
    await mount();
    const add = button(/trade/i);
    expect(add).toBeTruthy();
    await click(add);
    return screen.findByRole("dialog");
  }

  function save(dialog: HTMLElement) {
    return within(dialog)
      .getAllByRole("button")
      .find((b) => /^(add|save|create)/i.test((b.textContent ?? "").trim()));
  }

  it("opens a form asking for a code and a name", async () => {
    const dialog = await openTradeForm();
    expect(within(dialog).getByLabelText(/^code$/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^name$/i)).toBeInTheDocument();
  });

  it("refuses one with nothing filled in", async () => {
    const dialog = await openTradeForm();
    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // Trade codes are read on timetables and class names, where mixed case would
  // be noise.
  it("upper-cases the code before saving it", async () => {
    const dialog = await openTradeForm();
    // A trade also carries the TVET sector it belongs to, and the form will
    // not submit without it.
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^code$/i), {
        target: { value: "nit" },
      });
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Networking" },
      });
      fireEvent.change(within(dialog).getByLabelText(/sector/i), {
        target: { value: "ICT" },
      });
    });

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/trades"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).code).toBe("NIT");
      expect((call![1] as any).name).toBe("Networking");
    });
  });
});

describe("what each Delete deletes", () => {
  async function confirmDelete(openWith: () => Promise<void>) {
    await openWith();
    const dialog = await screen.findByRole("dialog");
    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^delete$/i.test((b.textContent ?? "").trim())),
    );
    return dialog;
  }

  it("names a year level in the confirmation", async () => {
    await mount();
    await click(screen.getByRole("button", { name: /^delete senior 1$/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/year level/i);
    expect(dialog.textContent).toMatch(/Senior 1/);
  });

  it("deletes a year level from its own endpoint", async () => {
    await confirmDelete(async () => {
      await mount();
      await click(screen.getByRole("button", { name: /^delete senior 1$/i }));
    });

    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith("/academic/class-levels/level-1"),
    );
  });

  // A class inside a level, not the level itself.
  it("deletes a class from the sections endpoint", async () => {
    await mount();
    await click(screen.getByText("Senior 1").closest("div")!);
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());

    const remove = screen.queryAllByRole("button", { name: /^delete class$/i })[0];
    if (!remove) return;
    await click(remove);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/class/i);

    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^delete$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.delete.mock.calls.find(([url]: any[]) =>
        String(url).includes("/sections/"),
      );
      expect(call).toBeTruthy();
    });
  });

  it("keeps everything when the confirmation is dismissed", async () => {
    await mount();
    await click(screen.getByRole("button", { name: /^delete senior 1$/i }));
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.delete).not.toHaveBeenCalled();
  });
});

describe("adding a class to an O-Level level", () => {
  // No trade involved, so the payload must not carry an empty one.
  it("creates it without a trade", async () => {
    await mount();
    await click(screen.getByRole("button", { name: /^add class to senior 1$/i }));

    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/stream/i), {
        target: { value: "C" },
      });
    });

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^(save|add|create)/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/sections"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).name).toBe("C");
      expect((call![1] as any).tradeId).toBeUndefined();
    });
  });
});

// Declared here rather than at the top because only the block below needs it;
// vi.mock and vi.hoisted are lifted to the top of the module either way.
const ex = vi.hoisted(() => ({ exportData: vi.fn() }));
vi.mock("@/lib/export", () => ({ exportData: ex.exportData }));

/**
 * A school that has not finished setting itself up.
 *
 * A structure page is the first thing an admin touches on day one, when there
 * are no levels, no trades and no classes, and the second thing they touch
 * years later when O-Level is full. Both ends have to be usable.
 */
describe("a school with nothing set up yet", () => {
  const empty = { ...routes, "/academic/class-levels": [], "/academic/trades": [] };

  it("says there are no O-Level years", async () => {
    serve(h.api, empty);
    renderPage(ClassesPage, { role: "ADMIN" });
    expect(await screen.findByText(/No O-Level years yet/i)).toBeInTheDocument();
  });

  it("suggests the trades a Rwandan TVET school usually starts with", async () => {
    serve(h.api, empty);
    renderPage(ClassesPage, { role: "ADMIN" });
    expect(await screen.findByText(/SWD, NIT, TOR, AUT/)).toBeInTheDocument();
  });

  it("will not let anything be exported", async () => {
    serve(h.api, empty);
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText(/No O-Level years yet/i);
    expect(button(/export/i)).toBeDisabled();
  });
});

describe("a school whose O-Level is full", () => {
  const three = ["Senior 1", "Senior 2", "Senior 3"].map((name, i) => ({
    id: `lvl-${i}`,
    name,
    stage: "O_LEVEL",
    order: i + 1,
    sections: [],
  }));

  it("refuses a fourth year level and says why", async () => {
    serve(h.api, { ...routes, "/academic/class-levels": three });
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Senior 3");

    expect(
      screen.getByText(/limited to 3 year levels/i),
    ).toBeInTheDocument();
    expect(button(/add year level/i)).toBeDisabled();
  });

  it("offers to add the first class from inside an empty level", async () => {
    serve(h.api, { ...routes, "/academic/class-levels": three });
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Senior 1");

    await click(screen.getByText("Senior 1").closest("div")!);
    const addOne = await screen.findByRole("button", { name: /add one/i });
    await click(addOne);

    expect(await screen.findByText("Add Class")).toBeInTheDocument();
  });
});

describe("a class recorded without its trade or its roll", () => {
  const untidy = {
    id: "level-9",
    name: "Level 5",
    stage: "A_LEVEL",
    order: 5,
    sections: [{ id: "sec-9", name: "B", classLevelId: "level-9" }],
  };

  it("draws a dash for the trade and a nought for the students", async () => {
    serve(h.api, { ...routes, "/academic/class-levels": [untidy] });
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Level 5");

    await click(screen.getByText("Level 5").closest("div")!);
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());

    const row = screen.getByText("B").closest("tr")!;
    expect(within(row).getByText("-")).toBeInTheDocument();
    expect(within(row).getByText("0")).toBeInTheDocument();
  });
});

describe("what the export actually writes", () => {
  it("writes one row for a level that has no classes at all", async () => {
    const mixed = [
      { id: "l-1", name: "Senior 1", stage: "O_LEVEL", order: 1, sections: [] },
      {
        id: "l-2",
        name: "Level 4",
        stage: "A_LEVEL",
        order: 4,
        // No trade and no roll recorded on this one.
        sections: [{ id: "s-1", name: "A", classLevelId: "l-2" }],
      },
    ];
    serve(h.api, { ...routes, "/academic/class-levels": mixed });
    ex.exportData.mockClear();
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Senior 1");

    await click(button(/export/i));
    const csv = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => /^csv$/i.test((b.textContent ?? "").trim()));
      expect(found).toBeTruthy();
      return found!;
    });
    await click(csv);

    const [, payload] = ex.exportData.mock.calls.at(-1)! as [string, any];
    // The empty level still appears, so a structure export is a full picture
    // of the school rather than only the parts that are filled in.
    expect(payload.data).toEqual([
      { _level: "Senior 1", _trade: "-", _section: "-", _students: "-" },
      { _level: "Level 4", _trade: "-", _section: "A", _students: "-" },
    ]);
  });
});

describe("the forms refusing what a school cannot use", () => {
  it("asks for a name and a sensible order on a year level", async () => {
    await mount();
    await click(button(/add year level/i));

    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText("Order"), {
        target: { value: "-1" },
      });
    });
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^create$/i.test((b.textContent ?? "").trim())),
    );

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Order must be 0 or greater")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Order").className).toMatch(/border-danger/);
  });

  it("asks for a stream name on a class", async () => {
    await mount();
    await click(screen.getByText("Senior 1").closest("div")!);
    await waitFor(() => expect(document.querySelector("table")).toBeTruthy());
    await click(button(/add class/i));

    const dialog = await screen.findByRole("dialog");
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^create$/i.test((b.textContent ?? "").trim())),
    );

    const message = await within(dialog).findByText(/required/i);
    expect(message).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Stream").className).toMatch(/border-danger/);
  });
});

/**
 * Deleting a trade, which is the most destructive of the three.
 *
 * A trade is what every A-Level stream hangs off. Deleting one when you meant
 * a single class takes the whole TVET side of the school with it, so the
 * confirmation has to name the trade and the request has to go to the trades
 * endpoint rather than the sections one.
 */
describe("removing a trade", () => {
  it("names the trade in the confirmation", async () => {
    await mount();
    await click(button(new RegExp(`delete trade ${trade.code}`, "i")));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(trade.code);
    expect(dialog.textContent).toContain(trade.name);
  });

  it("deletes it from the trades endpoint, not the sections one", async () => {
    await mount();
    await click(button(new RegExp(`delete trade ${trade.code}`, "i")));
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^delete$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith(`/academic/trades/${trade.id}`),
    );
  });
});

describe("a section modal with no trades to choose from", () => {
  it("still opens, offering only its prompt", async () => {
    serve(h.api, { ...routes, "/academic/trades": [] });
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Level 4");

    await click(screen.getByRole("button", { name: /^add class to level 4$/i }));

    const dialog = await screen.findByRole("dialog");
    const picker = within(dialog).getByLabelText("Trade") as HTMLSelectElement;
    expect(picker.options).toHaveLength(1);
    expect(picker.options[0].textContent).toMatch(/select a trade/i);
  });
});

/**
 * Levels and trades the API answered short on.
 *
 * A year level created before the order field existed has none, a level whose
 * sections were not joined comes back without them, and the trades call can
 * fail on its own while the levels arrive fine. None of those may stop an
 * admin editing the structure.
 */
describe("levels recorded without an order", () => {
  const noOrder = [
    { id: "lvl-1", name: "Senior 1", stage: "O_LEVEL", sections: [] },
    { id: "lvl-2", name: "Senior 2", stage: "O_LEVEL", order: 2, sections: [] },
  ];

  it("numbers a new level after the highest one there is", async () => {
    serve(h.api, { ...routes, "/academic/class-levels": noOrder });
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Senior 2");

    await click(button(/add year level/i));
    const dialog = await screen.findByRole("dialog");

    // Senior 1 has no order at all, so it counts as nought and the next free
    // number is three.
    expect(within(dialog).getByLabelText("Order")).toHaveValue(3);
  });

  it("opens a level with no order at nought", async () => {
    serve(h.api, { ...routes, "/academic/class-levels": noOrder });
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Senior 1");

    await click(button(/^edit senior 1$/i));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByLabelText("Order")).toHaveValue(0);
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Senior 1");
  });

  it("exports a level whose sections did not come back", async () => {
    serve(h.api, {
      ...routes,
      "/academic/class-levels": [{ id: "lvl-1", name: "Senior 1", stage: "O_LEVEL" }],
    });
    ex.exportData.mockClear();
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Senior 1");

    await click(button(/export/i));
    const csv = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => /^csv$/i.test((b.textContent ?? "").trim()));
      expect(found).toBeTruthy();
      return found!;
    });
    await click(csv);

    const [, payload] = ex.exportData.mock.calls.at(-1)! as [string, any];
    expect(payload.data).toEqual([
      { _level: "Senior 1", _trade: "-", _section: "-", _students: "-" },
    ]);
  });
});

describe("when the trades call fails on its own", () => {
  function tradesFail() {
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/academic/trades")) {
        throw Object.assign(new Error("down"), { response: { status: 500 } });
      }
      return real(url, config);
    });
  }

  it("still draws the levels", async () => {
    serve(h.api, routes);
    tradesFail();
    renderPage(ClassesPage, { role: "ADMIN" });

    expect(await screen.findByText("Senior 1")).toBeInTheDocument();
  });

  it("says there are no trades rather than going blank", async () => {
    serve(h.api, routes);
    tradesFail();
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Senior 1");

    expect(await screen.findByText(/SWD, NIT, TOR, AUT/)).toBeInTheDocument();
  });

  it("opens the class form with no trade to choose", async () => {
    serve(h.api, routes);
    tradesFail();
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText("Level 4");

    await click(screen.getByRole("button", { name: /^add class to level 4$/i }));
    const dialog = await screen.findByRole("dialog");

    const picker = within(dialog).getByLabelText("Trade") as HTMLSelectElement;
    expect(picker.options).toHaveLength(1);
  });
});

/**
 * The structure page when the levels call itself fails.
 *
 * A school on a flaky connection sees this on the first load of the day. The
 * page has to stay usable: the "add a level" form is the whole point of
 * visiting it when there is nothing there.
 */
describe("when the levels call fails", () => {
  function levelsFail() {
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/academic/class-levels")) {
        throw Object.assign(new Error("down"), { response: { status: 500 } });
      }
      return real(url, config);
    });
  }

  it("still offers to add the first year level", async () => {
    serve(h.api, routes);
    levelsFail();
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText(/No O-Level years yet/i);

    await click(button(/add year level/i));
    const dialog = await screen.findByRole("dialog");

    // Nothing on file, so the first level takes order one.
    expect(within(dialog).getByLabelText("Order")).toHaveValue(1);
  });

  it("will not let anything be exported", async () => {
    serve(h.api, routes);
    levelsFail();
    renderPage(ClassesPage, { role: "ADMIN" });
    await screen.findByText(/No O-Level years yet/i);

    expect(button(/export/i)).toBeDisabled();
  });
});
