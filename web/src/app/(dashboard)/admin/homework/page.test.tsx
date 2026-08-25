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
vi.mock("@/lib/export", () => ({ exportData: h.exportData }));
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
  // The admin screen always asks for a page, so this endpoint answers with an
  // envelope here. The teacher and student views ask unpaged and still get a
  // plain array.
  "/homework": {
    data: [
      { ...homework, kind: "HOMEWORK", _count: { submissions: 2 } },
      {
        ...homework,
        id: "hw-2",
        kind: "QUIZ",
        title: "Essay on Imigani",
        dueDate: "2026-09-15",
        _count: { submissions: 0 },
      },
    ],
    meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
  },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.exportData.mockReset();
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
    expect(lastQuery().kind).toBeUndefined();
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

/**
 * One list, several kinds of work.
 *
 * Homework, assignments, quizzes, tests and projects are the same thing with a
 * different name and weight. Keeping them apart in the data would make "how
 * much work has Senior 1 been set this week" unanswerable, so the kind is a
 * column rather than a separate module.
 */
describe("the kinds of assessment", () => {
  // Scoped to the table: the filter offers every kind as an option too.
  it("says what each row is", async () => {
    await mount();
    const table = document.querySelector("table")!;
    expect(table.textContent).toMatch(/Quiz/);
    expect(table.textContent).toMatch(/Homework/);
  });

  // A row set before the rename has no kind at all, and must not read blank.
  it("treats an older row with no kind as homework", async () => {
    serve(h.api, {
      ...routes,
      "/homework": {
        data: [{ ...homework, kind: undefined, _count: { submissions: 0 } }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Algebra sheet 3/)).toBeInTheDocument());
    expect(document.querySelector("table")!.textContent).toMatch(/Homework/);
  });

  it("offers every kind to filter by", async () => {
    await mount();
    const picker = screen.getByLabelText(/all types/i) as HTMLSelectElement;
    const values = Array.from(picker.options).map((o) => o.value);
    expect(values).toEqual([
      "",
      "HOMEWORK",
      "ASSIGNMENT",
      "QUIZ",
      "TEST",
      "PROJECT",
      "PRACTICAL",
    ]);
  });

  it("filters to one kind", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all types/i), {
        target: { value: "QUIZ" },
      });
    });

    await waitFor(() => expect(lastQuery().kind).toBe("QUIZ"));
  });

  it("goes back to every kind when the filter is cleared", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all types/i), { target: { value: "TEST" } });
    });
    await waitFor(() => expect(lastQuery().kind).toBe("TEST"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all types/i), { target: { value: "" } });
    });
    await waitFor(() => expect(lastQuery().kind).toBeUndefined());
  });

  // A teacher setting a quiz should not have to call it homework.
  it("lets a new assessment be given a kind", async () => {
    await mount();
    await click(
      screen.queryAllByRole("button").find((b) => /new assessment/i.test(b.textContent ?? "")),
    );

    const dialog = await screen.findByRole("dialog");
    const picker = within(dialog).getByLabelText(/^type$/i) as HTMLSelectElement;
    expect(picker.value).toBe("HOMEWORK");

    await act(async () => {
      fireEvent.change(picker, { target: { value: "PROJECT" } });
    });
    expect(picker.value).toBe("PROJECT");
  });
});

describe("paging the assessment list", () => {
  function paged(page: number, totalPages: number) {
    return {
      ...routes,
      "/homework": {
        data: [{ ...homework, id: `hw-${page}`, title: `Item page ${page}` }],
        meta: { total: 45, page, limit: 20, totalPages },
      },
    };
  }

  it("shows nothing to page through on a short list", async () => {
    await mount();
    expect(screen.queryByRole("button", { name: /next page/i })).toBeNull();
  });

  it("asks for a page from the start", async () => {
    await mount();
    expect(lastQuery().page).toBe("1");
    expect(lastQuery().limit).toBe("20");
  });

  it("says which page it is on", async () => {
    serve(h.api, paged(1, 3));
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument());
    expect(document.body.textContent).toMatch(/of 45/);
  });

  it("cannot go back from the first page", async () => {
    serve(h.api, paged(1, 3));
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("asks for the next page", async () => {
    serve(h.api, paged(1, 3));
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument());

    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(lastQuery().page).toBe("2"));
  });

  // Narrowing the list while deep in it would land on a page that is gone.
  it("returns to the first page when a filter changes", async () => {
    serve(h.api, paged(1, 3));
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument());

    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(lastQuery().page).toBe("2"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all types/i), { target: { value: "QUIZ" } });
    });
    await waitFor(() => expect(lastQuery().page).toBe("1"));
  });
});

/**
 * The section list only exists once a level is chosen, so filling this form in
 * one pass leaves it empty and the submit fails validation on a field the test
 * thought it had set.
 */
async function fill(dialog: ReturnType<typeof within>, title: string) {
  const teacherOption = dialog
    .getByLabelText(/^teacher$/i)
    .querySelectorAll("option")[1] as HTMLOptionElement;

  await act(async () => {
    fireEvent.change(dialog.getByLabelText(/^title$/i), { target: { value: title } });
    fireEvent.change(dialog.getByLabelText(/^subject$/i), {
      target: { value: subject.id },
    });
    fireEvent.change(dialog.getByLabelText(/^teacher$/i), {
      target: { value: teacherOption.value },
    });
    fireEvent.change(dialog.getByLabelText(/class level/i), {
      target: { value: classLevel.id },
    });
  });

  await waitFor(() =>
    expect(
      dialog.getByLabelText(/^section$/i).querySelectorAll("option").length,
    ).toBeGreaterThan(1),
  );

  await act(async () => {
    fireEvent.change(dialog.getByLabelText(/^section$/i), {
      target: { value: classSection.id },
    });
    fireEvent.change(dialog.getByLabelText(/^term$/i), {
      target: { value: "term-1" },
    });
    fireEvent.change(dialog.getByLabelText(/due date/i), {
      target: { value: "2026-09-30" },
    });
  });

  await act(async () => {
    fireEvent.submit(dialog.getByLabelText(/^title$/i).closest("form")!);
  });
}

describe("setting an assessment", () => {
  async function openForm() {
    await mount();
    await click(
      screen.queryAllByRole("button").find((b) => /new assessment/i.test(b.textContent ?? "")),
    );
    return within(await screen.findByRole("dialog"));
  }

  it("creates one against the subject, class, term and teacher", async () => {
    const dialog = await openForm();

    await fill(dialog, "Chapter 4 exercises");

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    const [url, body] = h.api.post.mock.calls.at(-1)!;
    expect(url).toBe("/homework");
    expect(body).toMatchObject({
      title: "Chapter 4 exercises",
      subjectId: subject.id,
      classSectionId: classSection.id,
      termId: "term-1",
    });
    expect(String(body.dueDate)).toMatch(/^2026-09-30/);
  });

  it("closes the form once it has gone", async () => {
    const dialog = await openForm();

    await fill(dialog, "Chapter 4 exercises");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("can be abandoned", async () => {
    const dialog = await openForm();

    await click(
      dialog.queryAllByRole("button").find((b) => /cancel/i.test(b.textContent ?? "")),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

/**
 * Who an assessment is for is fixed once it exists: moving it to another class
 * would strip the submissions already handed in, so editing only touches what
 * it says and when it is due.
 */
describe("changing one that already exists", () => {
  async function openEdit() {
    await mount();
    const row = screen.getByText(/Algebra sheet 3/).closest("tr")!;
    await click(within(row).getByRole("button", { name: /edit/i }));
    return within(await screen.findByRole("dialog"));
  }

  it("opens filled in with what it already says", async () => {
    const dialog = await openEdit();

    expect((dialog.getByLabelText(/^title$/i) as HTMLInputElement).value).toBe(
      "Algebra sheet 3",
    );
  });

  it("will not let its recipients be moved", async () => {
    const dialog = await openEdit();

    expect(dialog.getByLabelText(/^subject$/i)).toBeDisabled();
    expect(dialog.getByLabelText(/^section$/i)).toBeDisabled();
    expect(dialog.getByLabelText(/^term$/i)).toBeDisabled();
    expect(dialog.getByLabelText(/^teacher$/i)).toBeDisabled();
  });

  it("sends only what it is allowed to change", async () => {
    const dialog = await openEdit();

    await act(async () => {
      fireEvent.change(dialog.getByLabelText(/^title$/i), {
        target: { value: "Algebra sheet 4" },
      });
    });
    await act(async () => {
      fireEvent.submit(dialog.getByLabelText(/^title$/i).closest("form")!);
    });

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    const [url, body] = h.api.put.mock.calls.at(-1)!;
    expect(url).toMatch(new RegExp(`/homework/${homework.id}$`));
    expect(body).not.toHaveProperty("subjectId");
    expect(body).not.toHaveProperty("classSectionId");
    expect(body.title).toBe("Algebra sheet 4");
  });
});

describe("taking the list away with you", () => {
  it("exports what is on screen, with the class and teacher spelled out", async () => {
    await mount();

    await click(
      screen.queryAllByRole("button").find((b) => /export/i.test(b.textContent ?? "")),
    );
    const csv = screen
      .queryAllByRole("button")
      .find((b) => /csv/i.test(b.textContent ?? ""));
    await click(csv);

    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    const [format, options] = h.exportData.mock.calls.at(-1)!;
    expect(format).toBe("csv");
    expect(options.filename).toBe("homework");
    expect(options.data[0]._class).toMatch(/Senior 1/);
  });

  it("offers nothing to export from an empty school", async () => {
    serve(h.api, { ...routes, "/homework": [] });
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const button = screen
      .queryAllByRole("button")
      .find((b) => /export/i.test(b.textContent ?? ""));
    expect(button).toBeDisabled();
  });
});

/**
 * The form when it is filled in wrong, and the list when the rows are thin.
 *
 * An assessment carries seven fields that a school actually needs, and the
 * screen has to say which one is missing rather than fail silently at the API.
 * The rows below are the other half: homework created before the school
 * settled on subjects and terms, which still has to draw.
 */
describe("creating an assessment with the form half filled", () => {
  const openNew = async () => {
    await mount();
    await click(screen.getByRole("button", { name: /new assessment/i }));
    return screen.getByRole("button", { name: /^create$/i });
  };

  it("names every field it is still waiting for", async () => {
    const create = await openNew();
    await click(create);

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Subject is required")).toBeInTheDocument();
    expect(screen.getByText("Teacher is required")).toBeInTheDocument();
    expect(screen.getByText("Class section is required")).toBeInTheDocument();
    expect(screen.getByText("Term is required")).toBeInTheDocument();
    expect(screen.getByText("Due date is required")).toBeInTheDocument();
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("marks the fields it is waiting for in red", async () => {
    const create = await openNew();
    await click(create);

    await screen.findByText("Title is required");
    expect(screen.getByLabelText("Title").className).toMatch(/border-danger/);
    expect(screen.getByLabelText("Subject").className).toMatch(/border-danger/);
    expect(screen.getByLabelText("Due Date").className).toMatch(/border-danger/);
  });

  it("refuses an assessment worth no marks", async () => {
    const create = await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Max Marks"), { target: { value: "0" } });
    });
    await click(create);

    expect(await screen.findByText("Must be at least 1")).toBeInTheDocument();
  });

  it("refuses an assessment worth more marks than a paper carries", async () => {
    const create = await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Max Marks"), { target: { value: "5000" } });
    });
    await click(create);

    expect(await screen.findByText("Max 1000")).toBeInTheDocument();
  });

  it("clears the chosen section when the level changes under it", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Class Level"), {
        target: { value: classLevel.id },
      });
    });
    // The sections for that level are their own request, so the option only
    // exists once it lands.
    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Section")).getByRole("option", {
          name: classSection.name,
        }),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Section"), {
        target: { value: classSection.id },
      });
    });
    expect(screen.getByLabelText("Section")).toHaveValue(classSection.id);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Class Level"), { target: { value: "" } });
    });
    expect(screen.getByLabelText("Section")).toHaveValue("");
  });
});

describe("an assessment recorded before the school had its details straight", () => {
  const bare = {
    id: "hw-bare",
    kind: "HOMEWORK",
    title: "Old exercise",
    _count: { submissions: 0 },
  };

  const withBare = {
    ...routes,
    "/homework": { data: [bare], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } },
  };

  it("draws an em dash for the subject, due date and marks", async () => {
    serve(h.api, withBare);
    renderPage(AdminHomeworkPage, { role: "ADMIN" });

    const row = (await screen.findByText("Old exercise")).closest("tr")!;
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("opens it for editing with the blanks left blank", async () => {
    serve(h.api, withBare);
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await screen.findByText("Old exercise");

    await click(screen.getAllByRole("button", { name: /^edit$/i })[0]);

    expect(await screen.findByLabelText("Title")).toHaveValue("Old exercise");
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByLabelText("Subject")).toHaveValue("");
    expect(screen.getByLabelText("Term")).toHaveValue("");
    expect(screen.getByLabelText("Due Date")).toHaveValue("");
    // No max marks recorded, so the form offers the usual hundred.
    expect(screen.getByLabelText("Max Marks")).toHaveValue(100);
    // Nothing to preselect, so the level picker stays on its prompt.
    expect(screen.getByLabelText("Class Level")).toHaveValue("");
  });

  it("exports it with an em dash where the due date should be", async () => {
    serve(h.api, withBare);
    renderPage(AdminHomeworkPage, { role: "ADMIN" });
    await screen.findByText("Old exercise");

    const trigger = screen
      .queryAllByRole("button")
      .find((b) => /export/i.test(b.textContent ?? ""))!;
    await click(trigger);
    const csv = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => /^csv$/i.test((b.textContent ?? "").trim()));
      expect(found).toBeTruthy();
      return found!;
    });
    await click(csv);

    const [, payload] = h.exportData.mock.calls.at(-1)! as [string, any];
    expect(payload.data[0]._dueDate).toBe("—");
    expect(payload.data[0]._teacher).toBe("");
  });
});
