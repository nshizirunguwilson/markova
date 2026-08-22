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
  usePathname: () => "/admin/marks",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, populatedRoutes, students, termResult } from "@/test/fixtures";

import MarksPage from "./page";

/**
 * Term results, and the moment they become visible.
 *
 * Publishing is the single action on this page that reaches outside the
 * school: it puts every student's average and position in front of them and
 * their parents. Unpublishing takes it back again. Both ask first, and both
 * have to say which way they are going.
 */

const unpublished = [
  { ...termResult, id: "tr-1", isPublished: false, rank: 1, average: 82.4, letterGrade: "A" },
  {
    ...termResult,
    id: "tr-2",
    studentId: "student-2",
    student: students[1],
    isPublished: false,
    rank: 2,
    average: 67.1,
    letterGrade: "B",
  },
];

const published = unpublished.map((r) => ({ ...r, isPublished: true }));

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/marks/term-results/class": unpublished,
  "/marks/term-results/calculate": { computed: 2 },
  "/marks/term-results/publish": { updated: 2 },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:x"),
    revokeObjectURL: vi.fn(),
  });
});

async function mount(withResults = unpublished) {
  serve(h.api, { ...routes, "/marks/term-results/class": withResults });
  renderPage(MarksPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
}

/** For a class whose results have not been computed, so no student appears. */
async function mountEmpty() {
  serve(h.api, { ...routes, "/marks/term-results/class": [] });
  renderPage(MarksPage, { role: "ADMIN" });
  await waitFor(() =>
    expect(screen.getByLabelText(/class level/i)).toBeInTheDocument(),
  );
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

/** The one control that publishes or unpublishes. */
function statusButton() {
  return screen.getByRole("button", { name: /^hide$/i });
}

describe("a class's results", () => {
  it("lists every student", async () => {
    await mount();
    expect(screen.getByText(/Keza/)).toBeInTheDocument();
  });

  it("shows each average and grade", async () => {
    await mount();
    const row = screen.getByText(/Divine/).closest("tr")!;
    expect(row.textContent).toMatch(/82/);
    expect(row.textContent).toMatch(/A/);
  });

  it("asks for the chosen class and term", async () => {
    await mount();
    const call = [...h.api.get.mock.calls]
      .reverse()
      .find(([url]) => String(url).includes("term-results/class"));
    expect((call?.[1] as any)?.params?.classSectionId).toBeTruthy();
    expect((call?.[1] as any)?.params?.termId).toBeTruthy();
  });

  it("does not go blank when the results fail to load", async () => {
    serveFailure(h.api);
    renderPage(MarksPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("survives a class whose results have not been worked out yet", async () => {
    await mountEmpty();
    expect(screen.queryByText(/Divine/)).toBeNull();
  });
});

describe("publishing a class's results", () => {
  // Publishing puts marks in front of every student and parent in the class,
  // so it never happens on a single tap.
  it("asks first", async () => {
    await mount();
    h.api.post.mockClear();
    await click(statusButton());

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // The wording has to say who will see them, because that is the consequence.
  it("says who will be able to see them", async () => {
    await mount();
    await click(statusButton());

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/students and parents will be able to view/i);
  });

  it("publishes nothing when the ask is dismissed", async () => {
    await mount();
    await click(statusButton());
    const dialog = await screen.findByRole("dialog");

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("publishes the chosen class and term once confirmed", async () => {
    await mount();
    await click(statusButton());
    const dialog = await screen.findByRole("dialog");

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^confirm$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("term-results/publish"),
      );
      expect(call).toBeTruthy();
      const body = call![1] as any;
      expect(body.isPublished).toBe(true);
      expect(body.classSectionId).toBeTruthy();
      expect(body.termId).toBeTruthy();
    });
  });
});

describe("taking published results back", () => {
  // The opposite direction has to say the opposite thing, or an admin
  // unpublishes a class believing they are publishing it.
  it("warns that they will stop being visible", async () => {
    await mount(published);
    await click(statusButton());

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/no longer be visible/i);
  });

  it("unpublishes rather than publishing again", async () => {
    await mount(published);
    await click(statusButton());
    const dialog = await screen.findByRole("dialog");

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^confirm$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("term-results/publish"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).isPublished).toBe(false);
    });
  });

  // A class is only "published" when every student in it is.
  it("treats a part-published class as not yet published", async () => {
    await mount([published[0], unpublished[1]]);
    await click(statusButton());

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/will be able to view/i);
  });
});

describe("working out the results", () => {
  it("asks the API to compute them", async () => {
    await mount();
    h.api.post.mockClear();
    await click(button(/calculate results/i));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("term-results/calculate"),
      );
      expect(call).toBeTruthy();
    });
  });
});

describe("exporting the results", () => {
  it("writes a row per student", async () => {
    const parts: string[] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class extends RealBlob {
        constructor(chunks: any[], opts?: any) {
          super(chunks, opts);
          parts.push(String(chunks?.[0] ?? ""));
        }
      },
    );

    try {
      await mount();
      await click(button(/export csv/i));

      await waitFor(() => expect(parts.length).toBeGreaterThan(0));
      const csv = parts[parts.length - 1];
      expect(csv).toMatch(/Rank,Name,Average,Grade,Published/);
      expect(csv).toMatch(/Divine/);
      expect(csv).toMatch(/Keza/);
    } finally {
      vi.stubGlobal("Blob", RealBlob);
    }
  });

  // "Published" in the file has to reflect the real state, since the file is
  // what gets mailed around.
  it("records whether each result is published", async () => {
    const parts: string[] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class extends RealBlob {
        constructor(chunks: any[], opts?: any) {
          super(chunks, opts);
          parts.push(String(chunks?.[0] ?? ""));
        }
      },
    );

    try {
      await mount(published);
      await click(button(/export csv/i));

      await waitFor(() => expect(parts.length).toBeGreaterThan(0));
      expect(parts[parts.length - 1]).toMatch(/Yes/);
    } finally {
      vi.stubGlobal("Blob", RealBlob);
    }
  });

  it("writes nothing when there is nothing to write", async () => {
    const parts: string[] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class extends RealBlob {
        constructor(chunks: any[], opts?: any) {
          super(chunks, opts);
          parts.push(String(chunks?.[0] ?? ""));
        }
      },
    );

    try {
      await mountEmpty();
      const exportBtn = button(/export csv/i);
      if (exportBtn) await click(exportBtn);
      expect(parts).toHaveLength(0);
    } finally {
      vi.stubGlobal("Blob", RealBlob);
    }
  });
});

describe("choosing a different class", () => {
  it("asks again for the class that was picked", async () => {
    await mount();
    const level = screen.getByLabelText(/class level/i);
    await act(async () => {
      fireEvent.change(level, { target: { value: "level-1" } });
    });

    const section = screen.getByLabelText(/^section$/i) as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(section.options).some((o) => o.value)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(section, { target: { value: "section-1" } });
    });

    await waitFor(() => {
      const call = [...h.api.get.mock.calls]
        .reverse()
        .find(([url]) => String(url).includes("term-results/class"));
      expect((call?.[1] as any)?.params?.classSectionId).toBe("section-1");
    });
  });

  it("asks again for the term that was picked", async () => {
    await mount();
    const term = screen.getByLabelText(/^term$/i) as HTMLSelectElement;
    const option = Array.from(term.options).find((o) => o.value);
    if (!option) return;
    await act(async () => {
      fireEvent.change(term, { target: { value: option.value } });
    });

    await waitFor(() => {
      const call = [...h.api.get.mock.calls]
        .reverse()
        .find(([url]) => String(url).includes("term-results/class"));
      expect((call?.[1] as any)?.params?.termId).toBe(option.value);
    });
  });
});
