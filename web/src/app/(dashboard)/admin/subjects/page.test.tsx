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

const subjects = [
  { id: "subject-1", name: "Mathematics", code: "MATH", category: "SCIENCE", maxMarks: 100 },
  { id: "subject-2", name: "Kinyarwanda", code: "KIN", category: "LANGUAGES", maxMarks: 50 },
];

const routes = {
  "/academic/subjects": subjects,
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

describe("editing a subject", () => {
  async function openEditor() {
    await mount();
    await click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
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
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("names the subject it is about to remove", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Mathematics/);
  });

  it("deletes nothing when the ask is dismissed", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
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
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^delete$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith("/academic/subjects/subject-1"),
    );
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
    expect((h.exportData.mock.calls[0][1] as any).data).toHaveLength(2);
  });
});
