import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    exportData: fn(),
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/export", () => ({ exportData: h.exportData }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/subjects",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";

import SubjectsPage from "./page";

/**
 * The subjects a school teaches.
 *
 * `maxMarks` is the one that matters: every mark entered against a subject is
 * scored out of it, so a subject created with a nonsense ceiling makes every
 * percentage on every report card wrong.
 */

const trade = { id: "trade-1", code: "SWD", name: "Software Development", sector: "ICT" };
const level = { id: "level-1", name: "Senior 1", order: 1, sections: [] };

const subjects = [
  {
    id: "subject-1",
    name: "Mathematics",
    code: "MATH",
    category: "SCIENCE",
    maxMarks: 100,
    scope: "O_CORE",
    isActive: true,
    tradeId: null,
    trade: null,
    classLevelId: null,
    classLevel: null,
    _count: { teacherSubjectClasses: 3, timetables: 6, marks: 240 },
  },
  {
    id: "subject-2",
    name: "Kinyarwanda",
    code: "KIN",
    category: "LANGUAGES",
    maxMarks: 50,
    scope: "O_ELECTIVE",
    isActive: true,
    tradeId: null,
    trade: null,
    classLevelId: "level-1",
    classLevel: { id: "level-1", name: "Senior 1", stage: "O_LEVEL" },
    _count: { teacherSubjectClasses: 1, timetables: 2, marks: 0 },
  },
  {
    id: "subject-3",
    name: "Backend Application Development",
    category: "ICT",
    maxMarks: 100,
    scope: "A_SPECIFIC",
    isActive: false,
    tradeId: "trade-1",
    trade,
    classLevelId: null,
    classLevel: null,
    _count: { teacherSubjectClasses: 2, timetables: 4, marks: 0 },
  },
];

const routes = {
  "/academic/subjects": subjects,
  "/academic/trades": [trade],
  "/academic/class-levels": [level],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.exportData.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(SubjectsPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Mathematics/)).toBeInTheDocument());
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

describe("the subject list", () => {
  it("lists what the school teaches", async () => {
    await mount();
    expect(screen.getByText(/Kinyarwanda/)).toBeInTheDocument();
  });

  /**
   * The page used to show name, category and max marks and nothing else,
   * which left out everything that decides what a mark is worth: the scope
   * that sets the weighting and the grading scale, the trade a module belongs
   * to, and whether it counts toward the aggregate a student is certified on.
   */
  it("names each subject's scope", async () => {
    await mount();
    const row = screen.getByText(/^Mathematics$/).closest("tr")!;
    expect(row.textContent).toMatch(/O-Level core/);
  });

  it("says how the term mark is put together", async () => {
    await mount();
    const row = screen
      .getByText(/Backend Application Development/)
      .closest("tr")!;
    expect(row.textContent).toMatch(/Practical 30%/);
  });

  it("says which subjects stay out of the aggregate", async () => {
    await mount();
    const elective = screen.getByText(/Kinyarwanda/).closest("tr")!;
    const core = screen.getByText(/^Mathematics$/).closest("tr")!;
    expect(elective.textContent).toMatch(/Outside the aggregate/);
    expect(core.textContent).toMatch(/Counts toward the aggregate/);
  });

  it("names the trade a module belongs to", async () => {
    await mount();
    const row = screen
      .getByText(/Backend Application Development/)
      .closest("tr")!;
    expect(row.textContent).toMatch(/SWD/);
  });

  it("says which level a subject is pinned to", async () => {
    await mount();
    expect(
      screen.getByText(/Kinyarwanda/).closest("tr")!.textContent,
    ).toMatch(/Senior 1/);
    expect(
      screen.getByText(/^Mathematics$/).closest("tr")!.textContent,
    ).toMatch(/All levels/);
  });

  // A subject nobody teaches is one the timetable will never reach, and a
  // subject with marks against it cannot be deleted at all.
  it("says whether anyone is teaching it", async () => {
    await mount();
    const row = screen.getByText(/^Mathematics$/).closest("tr")!;
    expect(row.textContent).toMatch(/3 teachers/);
    expect(row.textContent).toMatch(/240 marks recorded/);
  });

  it("marks a deactivated subject as such", async () => {
    await mount();
    const row = screen
      .getByText(/Backend Application Development/)
      .closest("tr")!;
    expect(row.textContent).toMatch(/Inactive/);
  });

  // The label appears on the summary card, in the filter and in the form, so
  // the count is read off the card specifically.
  it("counts the curriculum by scope", async () => {
    await mount();
    const card = screen
      .getAllByText("Trade module")
      .map((el) => el.parentElement)
      .find((el) => /Practical 30%/.test(el?.textContent ?? ""));
    expect(card?.textContent).toMatch(/Trade module1/);
  });
});

describe("finding one subject among ninety", () => {
  it("searches by name", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search subjects/i), {
        target: { value: "kinya" },
      });
    });
    expect(screen.getByText(/Kinyarwanda/)).toBeInTheDocument();
    expect(screen.queryByText(/^Mathematics$/)).toBeNull();
  });

  it("searches by the trade code too", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search subjects/i), {
        target: { value: "swd" },
      });
    });
    expect(screen.getByText(/Backend Application Development/)).toBeInTheDocument();
    expect(screen.queryByText(/Kinyarwanda/)).toBeNull();
  });

  it("narrows to one scope", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/filter by scope/i), {
        target: { value: "O_ELECTIVE" },
      });
    });
    expect(screen.getByText(/Kinyarwanda/)).toBeInTheDocument();
    expect(screen.queryByText(/^Mathematics$/)).toBeNull();
  });

  it("narrows to one trade", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/filter by trade/i), {
        target: { value: "trade-1" },
      });
    });
    expect(screen.getByText(/Backend Application Development/)).toBeInTheDocument();
    expect(screen.queryByText(/^Mathematics$/)).toBeNull();
  });

  it("says so when nothing matches rather than showing an empty table", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search subjects/i), {
        target: { value: "astrophysics" },
      });
    });
    expect(screen.getByText(/no subject matches that/i)).toBeInTheDocument();
  });
});

describe("what the list has to survive", () => {
  it("shows what each is marked out of", async () => {
    await mount();
    const row = screen.getByText(/Kinyarwanda/).closest("tr")!;
    expect(row.textContent).toMatch(/50/);
  });

  it("does not go blank when the list fails to load", async () => {
    serveFailure(h.api);
    renderPage(SubjectsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("survives a school with no subjects yet", async () => {
    serve(h.api, { "/academic/subjects": [] });
    renderPage(SubjectsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Mathematics/)).toBeNull();
  });
});

describe("adding a subject", () => {
  async function openForm() {
    await mount();
    await click(button(/add subject/i));
    return screen.findByRole("dialog");
  }

  function save(dialog: HTMLElement) {
    return within(dialog)
      .getAllByRole("button")
      .find((b) => /^(create|update)$/i.test((b.textContent ?? "").trim()));
  }

  it("opens an empty form", async () => {
    const dialog = await openForm();
    expect((within(dialog).getByLabelText(/^name$/i) as HTMLInputElement).value).toBe("");
  });

  it("starts at a hundred marks, the usual ceiling", async () => {
    const dialog = await openForm();
    expect((within(dialog).getByLabelText(/max marks/i) as HTMLInputElement).value).toBe("100");
  });

  // A subject with no name would sit unnamed in every mark sheet.
  it("refuses one with no name", async () => {
    const dialog = await openForm();
    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("creates it with what was filled in", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Physics" },
      });
      fireEvent.change(within(dialog).getByLabelText(/category/i), {
        target: { value: "SCIENCE" },
      });
    });

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/academic/subjects"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).name).toBe("Physics");
    });
  });

  // Sent as a string, every percentage computed from it would be wrong.
  it("sends the mark ceiling as a number", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Physics" },
      });
      fireEvent.change(within(dialog).getByLabelText(/max marks/i), {
        target: { value: "40" },
      });
    });

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/academic/subjects"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).maxMarks).toBe(40);
    });
  });

  it("refuses a ceiling of zero", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Physics" },
      });
      fireEvent.change(within(dialog).getByLabelText(/max marks/i), {
        target: { value: "0" },
      });
    });

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("refuses an absurd ceiling", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Physics" },
      });
      fireEvent.change(within(dialog).getByLabelText(/max marks/i), {
        target: { value: "5000" },
      });
    });

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("closes without creating anything when dismissed", async () => {
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

/**
 * Creating a subject.
 *
 * The form used to offer name, category and max marks. Scope was never asked
 * for, so every subject was created as an O-Level core paper whatever it
 * really was - and a trade module, which needs a trade, could not be created
 * from this page at all.
 */
describe("what the form can actually set", () => {
  async function openForm() {
    await mount();
    await click(button(/add subject/i));
    return screen.findByRole("dialog");
  }

  it("offers every scope the school grades on", async () => {
    const dialog = await openForm();
    const select = within(dialog).getByLabelText(/^scope$/i) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "O_CORE",
      "O_ELECTIVE",
      "A_GENERAL",
      "A_SPECIFIC",
    ]);
  });

  // Choosing a scope silently changes how every mark against the subject is
  // weighted, so the form says what it is choosing.
  it("says what the chosen scope does to the marks", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^scope$/i), {
        target: { value: "A_SPECIFIC" },
      });
    });
    expect(dialog.textContent).toMatch(/Practical 30%/);
    expect(dialog.textContent).toMatch(/counted toward the aggregate/i);
  });

  it("keeps the trade shut unless the scope is a trade module", async () => {
    const dialog = await openForm();
    expect(within(dialog).getByLabelText(/^trade$/i)).toBeDisabled();

    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^scope$/i), {
        target: { value: "A_SPECIFIC" },
      });
    });
    expect(within(dialog).getByLabelText(/^trade$/i)).not.toBeDisabled();
  });

  // The server refuses a trade module with no trade. Catching it here names
  // the field instead of failing the whole save with a 400.
  it("refuses to save a trade module with no trade", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Database Development" },
      });
      fireEvent.change(within(dialog).getByLabelText(/^scope$/i), {
        target: { value: "A_SPECIFIC" },
      });
    });

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() =>
      expect(dialog.textContent).toMatch(/has to belong to a trade/i),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("sends the scope, trade and level it was given", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Database Development" },
      });
      fireEvent.change(within(dialog).getByLabelText(/^scope$/i), {
        target: { value: "A_SPECIFIC" },
      });
    });
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^trade$/i), {
        target: { value: "trade-1" },
      });
    });

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => {
      const body = h.api.post.mock.calls[0]?.[1] as any;
      expect(body.scope).toBe("A_SPECIFIC");
      expect(body.tradeId).toBe("trade-1");
    });
  });

  /**
   * An unset relation goes as absent, not as "". The API validates these as
   * uuids, so an empty string is a 400 on a field the admin never touched.
   */
  it("leaves an unset level out rather than sending an empty one", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Physics" },
      });
    });

    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => {
      const body = h.api.post.mock.calls[0]?.[1] as any;
      expect(body).not.toHaveProperty("classLevelId");
      expect(body).not.toHaveProperty("tradeId");
    });
  });

  function save(dialog: HTMLElement) {
    return within(dialog)
      .getAllByRole("button")
      .find((b) => /^(create|update)$/i.test((b.textContent ?? "").trim()));
  }
});

describe("editing a subject", () => {
  /**
   * A subject with marks against it cannot be deleted, only deactivated, so
   * the Active tick is the only way to retire one - and it only makes sense
   * on something that already exists.
   */
  it("offers Active on an edit but not on a new subject", async () => {
    await mount();
    await click(button(/add subject/i));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/^Active$/)).toBeNull();

    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );
    await click(screen.getByRole("button", { name: /^edit mathematics$/i }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/^Active$/)).toBeInTheDocument();
  });

  it("opens a trade module with its trade already chosen", async () => {
    await mount();
    await click(
      screen.getByRole("button", {
        name: /^edit backend application development$/i,
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      (within(dialog).getByLabelText(/^scope$/i) as HTMLSelectElement).value,
    ).toBe("A_SPECIFIC");
    expect(
      (within(dialog).getByLabelText(/^trade$/i) as HTMLSelectElement).value,
    ).toBe("trade-1");
  });

  async function openEditor() {
    await mount();
    // Each button names the subject it acts on, so a row's Edit is
    // distinguishable from every other row's in a screen reader.
    await click(screen.getAllByRole("button", { name: /^edit /i })[0]);
    return screen.findByRole("dialog");
  }

  it("opens with the subject already in it", async () => {
    const dialog = await openEditor();
    expect((within(dialog).getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      "Mathematics",
    );
  });

  // An edit updates the subject; a duplicate would split its marks in two.
  it("updates rather than creating a second one", async () => {
    const dialog = await openEditor();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
        target: { value: "Further Mathematics" },
      });
    });

    h.api.put.mockClear();
    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^update$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith("/academic/subjects/subject-1", expect.anything()),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // Opening the editor and then "Add" must not carry the edited subject over.
  it("does not leak the edited subject into a new one", async () => {
    const dialog = await openEditor();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await click(button(/add subject/i));
    const fresh = await screen.findByRole("dialog");
    expect((within(fresh).getByLabelText(/^name$/i) as HTMLInputElement).value).toBe("");
  });
});

describe("removing a subject", () => {
  // Deleting takes every mark recorded against it.
  it("asks first", async () => {
    await mount();
    h.api.delete.mockClear();
    await click(screen.getAllByRole("button", { name: /^delete /i })[0]);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("names the subject it is about to remove", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete /i })[0]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Mathematics/);
  });

  it("deletes nothing when the ask is dismissed", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete /i })[0]);
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

  it("deletes it once confirmed", async () => {
    await mount();
    // Kinyarwanda: no marks recorded, so it can actually be removed.
    await click(screen.getByRole("button", { name: /^delete kinyarwanda$/i }));
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^delete$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith("/academic/subjects/subject-2"),
    );
  });

  /**
   * Subject → Mark is a cascade delete, so the server refuses to remove a
   * subject that has marks against it. The page used to offer the button
   * anyway and only reported the refusal after it was pressed on something
   * irreversible-looking.
   */
  it("refuses up front to delete a subject that carries marks", async () => {
    await mount();
    await click(screen.getByRole("button", { name: /^delete mathematics$/i }));
    const dialog = await screen.findByRole("dialog");

    expect(dialog.textContent).toMatch(/240 marks have been recorded/);
    const confirm = within(dialog)
      .getAllByRole("button")
      .find((b) => /^delete$/i.test((b.textContent ?? "").trim()));
    expect(confirm).toBeDisabled();
  });
});

describe("exporting the subjects", () => {
  it("writes a row per subject", async () => {
    await mount();
    await click(button(/export/i));

    const csv = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => /^csv$/i.test((b.textContent ?? "").trim()));
      expect(found).toBeTruthy();
      return found!;
    });
    await click(csv);

    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    expect((h.exportData.mock.calls[0][1] as any).data).toHaveLength(3);
  });
});

/**
 * Paging the subject list.
 *
 * A school with trade modules runs to ninety subjects. Twenty to a page keeps
 * the table readable; the list itself is small enough to hold in the browser,
 * so `/academic/subjects` keeps answering with a plain array.
 */
describe("paging a long subject list", () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    id: `subject-${i}`,
    name: `Subject ${String(i).padStart(2, "0")}`,
    code: `S${i}`,
    category: "SCIENCE",
    maxMarks: 100,
  }));

  async function mountMany() {
    serve(h.api, { "/academic/subjects": many });
    renderPage(SubjectsPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText("Subject 00")).toBeInTheDocument());
  }

  it("shows nothing to page through on a short list", async () => {
    await mount();
    expect(screen.queryByRole("button", { name: /next page/i })).toBeNull();
  });

  it("shows only the first page", async () => {
    await mountMany();
    expect(screen.getByText("Subject 19")).toBeInTheDocument();
    expect(screen.queryByText("Subject 20")).toBeNull();
  });

  it("says how many there are in total", async () => {
    await mountMany();
    expect(document.body.textContent).toMatch(/of 45/);
    expect(document.body.textContent).toMatch(/Page 1 of 3/);
  });

  it("cannot go back from the first page", async () => {
    await mountMany();
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("goes forward to the next twenty", async () => {
    await mountMany();
    await click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => expect(screen.getByText("Subject 20")).toBeInTheDocument());
    expect(screen.queryByText("Subject 00")).toBeNull();
  });

  it("comes back again", async () => {
    await mountMany();
    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(screen.getByText("Subject 20")).toBeInTheDocument());

    await click(screen.getByRole("button", { name: /previous page/i }));
    await waitFor(() => expect(screen.getByText("Subject 00")).toBeInTheDocument());
  });

  it("cannot go past the last page", async () => {
    await mountMany();
    await click(screen.getByRole("button", { name: /next page/i }));
    await click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled(),
    );
    expect(screen.getByText("Subject 44")).toBeInTheDocument();
  });

  // Every subject still goes into the file, not just the page on screen.
  it("exports the whole list, not just this page", async () => {
    await mountMany();
    await click(button(/export/i));
    const csv = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => /^csv$/i.test((b.textContent ?? "").trim()));
      expect(found).toBeTruthy();
      return found!;
    });
    await click(csv);

    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    expect((h.exportData.mock.calls[0][1] as any).data).toHaveLength(45);
  });
});

/**
 * Subjects a school added in a hurry.
 *
 * A subject typed in during setup week carries a name and nothing else, and it
 * still has to list, open for editing and export. The empty list is the very
 * first screen a new school sees.
 */
describe("a school that has entered no subjects", () => {
  it("says so rather than showing an empty table", async () => {
    serve(h.api, { "/academic/subjects": [] });
    renderPage(SubjectsPage, { role: "ADMIN" });
    expect(await screen.findByText("No subjects yet")).toBeInTheDocument();
  });

  it("will not let an empty list be exported", async () => {
    serve(h.api, { "/academic/subjects": [] });
    renderPage(SubjectsPage, { role: "ADMIN" });
    await screen.findByText("No subjects yet");

    // Nothing to write, so the control is refused rather than producing an
    // empty file the office then has to explain.
    expect(button(/export/i)).toBeDisabled();
  });
});

describe("a subject with only a name", () => {
  const bare = [{ id: "subject-9", name: "Entrepreneurship" }];

  it("draws a dash for the category", async () => {
    serve(h.api, { "/academic/subjects": bare });
    renderPage(SubjectsPage, { role: "ADMIN" });

    const row = (await screen.findByText("Entrepreneurship")).closest("tr")!;
    expect(row.textContent).toContain("-");
  });

  it("shows the usual hundred as the ceiling", async () => {
    serve(h.api, { "/academic/subjects": bare });
    renderPage(SubjectsPage, { role: "ADMIN" });

    const row = (await screen.findByText("Entrepreneurship")).closest("tr")!;
    expect(row.textContent).toContain("100");
  });

  it("opens for editing with the category blank and marks at a hundred", async () => {
    serve(h.api, { "/academic/subjects": bare });
    renderPage(SubjectsPage, { role: "ADMIN" });
    await screen.findByText("Entrepreneurship");

    // Each button names the subject it acts on, so a row's Edit is
    // distinguishable from every other row's in a screen reader.
    await click(screen.getAllByRole("button", { name: /^edit /i })[0]);

    expect(await screen.findByLabelText("Name")).toHaveValue("Entrepreneurship");
    expect(screen.getByLabelText("Category")).toHaveValue("");
    expect(screen.getByLabelText("Max Marks")).toHaveValue(100);
  });
});

describe("the ceiling a subject is marked out of", () => {
  async function openNew() {
    await mount();
    await click(button(/add subject|new subject/i));
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
  }

  it("refuses a subject marked out of nothing", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Art" } });
      fireEvent.change(screen.getByLabelText("Max Marks"), { target: { value: "0" } });
    });
    await click(button(/^create$|^save$|^add$/i));

    expect(await screen.findByText("Must be at least 1")).toBeInTheDocument();
  });

  it("refuses a ceiling no paper could carry", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Art" } });
      fireEvent.change(screen.getByLabelText("Max Marks"), { target: { value: "5000" } });
    });
    await click(button(/^create$|^save$|^add$/i));

    expect(await screen.findByText("Must be at most 1000")).toBeInTheDocument();
  });
});
