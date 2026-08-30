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

/**
 * A draft class: marks worked out but not released, and no report cards
 * issued. Both flags are set explicitly - a class whose marks are a draft
 * cannot have issued cards, since the card carries the marks.
 */
const unpublished = [
  {
    ...termResult,
    id: "tr-1",
    isPublished: false,
    reportCardPublished: false,
    rank: 1,
    average: 82.4,
    letterGrade: "A",
  },
  {
    ...termResult,
    id: "tr-2",
    studentId: "student-2",
    student: students[1],
    isPublished: false,
    reportCardPublished: false,
    rank: 2,
    average: 67.1,
    letterGrade: "B",
  },
];

/** Marks released, report cards not yet issued - the middle stage. */
const published = unpublished.map((r) => ({ ...r, isPublished: true }));
/* Marks out and the head teacher's check done, which is what a class looks
   like at the moment the principal may issue it. */
const confirmed = published.map((r) => ({ ...r, dosConfirmed: true }));

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

/**
 * Pick a class, the way an admin has to.
 *
 * Nothing is loaded until a level and a section are both chosen: the page used
 * to fall back to the first section in the school, so opening Marks showed a
 * real class nobody had asked for under a "Select level..." placeholder.
 */
async function chooseClass() {
  // Wait for the levels themselves, not just the empty select: firing change
  // before the options land leaves the value unset and the page still empty.
  await waitFor(() =>
    expect(
      within(screen.getByLabelText(/class level/i)).getByRole("option", {
        name: /senior 1/i,
      }),
    ).toBeInTheDocument(),
  );
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/class level/i), {
      target: { value: "level-1" },
    });
  });
  await waitFor(() =>
    expect(screen.getByLabelText(/^section$/i)).not.toBeDisabled(),
  );
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/^section$/i), {
      target: { value: "section-1" },
    });
  });
}

async function mount(withResults: unknown[] = unpublished) {
  serve(h.api, { ...routes, "/marks/term-results/class": withResults });
  renderPage(MarksPage, { role: "ADMIN" });
  await chooseClass();
  await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
}

/** For a class whose results have not been computed, so no student appears. */
async function mountEmpty() {
  serve(h.api, { ...routes, "/marks/term-results/class": [] });
  renderPage(MarksPage, { role: "ADMIN" });
  await chooseClass();
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

/**
 * The one control that publishes or unpublishes.
 *
 * Named for what it does rather than "Hide": the card now says what the state
 * IS above the button that changes it, because a published class reading
 * "Unpublish" looked like it was reporting the opposite of the truth.
 */
function statusButton() {
  return screen.getByRole("button", { name: /(un)?publish marks/i });
}

/** Issuing the report card is a separate decision, so a separate control. */
function reportCardButton() {
  return screen.getByRole("button", {
    name: /(issue|withdraw) report cards/i,
  });
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
    expect(dialog.textContent).toMatch(/parents will be able to see/i);
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
    expect(dialog.textContent).toMatch(/stop seeing/i);
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
    expect(dialog.textContent).toMatch(/will be able to see/i);
  });

  /**
   * Releasing marks and issuing the report card are two decisions, so the
   * page carries two controls. A school routinely lets marks out as soon as
   * they are checked and issues the document later, after deliberation.
   */
  describe("issuing the report cards", () => {
    it("offers it as its own control", async () => {
      await mount(published);
      expect(reportCardButton()).toBeInTheDocument();
    });

    // The card carries the marks, so it cannot go out before them.
    it("refuses to issue while the marks are still a draft", async () => {
      await mount();
      expect(reportCardButton()).toBeDisabled();
    });

    it("allows issuing once the class has been confirmed", async () => {
      await mount(confirmed);
      expect(reportCardButton()).not.toBeDisabled();
    });

    /**
     * The head teacher's check is what the principal signs on the strength
     * of, and the API refuses without it. A button that looked available and
     * then threw would be the page inviting an admin to do something the
     * school does not allow.
     */
    it("refuses to issue before the head teacher has confirmed", async () => {
      await mount(published);
      expect(reportCardButton()).toBeDisabled();
    });

    /**
     * Addressed to the person reading it. This page is the Director of
     * Studies' now, so "the head teacher has not confirmed this class" was
     * the screen talking about the reader in the third person.
     */
    it("says so when it is their own check holding it up", async () => {
      await mount(published);
      expect(reportCardButton()).toHaveAttribute(
        "title",
        expect.stringMatching(/You have not confirmed/i),
      );
    });

    /* And offers the way to do it, beside the comments rather than as a
       second button here that would skip reading them. */
    it("points at where the confirming happens", async () => {
      await mount(published);
      expect(
        screen.getByText(/Read and confirm them/i).closest("a"),
      ).toHaveAttribute("href", "/admin/report-cards");
    });

    it("says so when it is the marks that are holding it up", async () => {
      await mount();
      expect(reportCardButton()).toHaveAttribute(
        "title",
        expect.stringMatching(/Publish the marks first/i),
      );
    });

    it("counts how many cards are still waiting on that check", async () => {
      await mount(published);
      expect(document.body.textContent).toMatch(/2 of 2 waiting/);
    });

    it("says so when the class has been confirmed", async () => {
      await mount(confirmed);
      expect(document.body.textContent).toMatch(/You have read these cards/i);
      expect(screen.queryByText(/Read and confirm them/i)).not.toBeInTheDocument();
    });

    it("asks before issuing, and says what it means", async () => {
      await mount(confirmed);
      await click(reportCardButton());

      const dialog = await screen.findByRole("dialog");
      expect(dialog.textContent).toMatch(/open and print the full document/i);
    });

    it("issues the chosen class and term once confirmed", async () => {
      await mount(confirmed);
      await click(reportCardButton());
      h.api.post.mockClear();
      await click(
        screen.getAllByRole("button").find((b) => /^confirm$/i.test(b.textContent ?? "")),
      );

      await waitFor(() => {
        const call = h.api.post.mock.calls.find(([url]: any[]) =>
          String(url).includes("report-cards/publish"),
        );
        expect(call).toBeTruthy();
        expect((call![1] as any).isPublished).toBe(true);
      });
    });

    // Withdrawing the document leaves the marks alone - they are separate.
    it("withdraws an issued card without touching the marks", async () => {
      await mount(
        confirmed.map((r: any) => ({ ...r, reportCardPublished: true })),
      );
      await click(reportCardButton());

      const dialog = await screen.findByRole("dialog");
      expect(dialog.textContent).toMatch(/marks stay published/i);
    });
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

/**
 * A results table part way through being computed.
 *
 * Rank, total, average and grade are each coloured against a band, and a
 * result row can arrive with any of them still empty: a student who sat no
 * paper, one whose marks are still being entered, one the calculation has not
 * reached. Every band and every blank has to draw.
 */
describe("results across every band", () => {
  /** A student with a name of their own, so a row can be found by it. */
  const named = (first: string, last: string) => ({
    ...termResult.student,
    id: `st-${first}`,
    user: { ...termResult.student.user, firstName: first, lastName: last },
  });

  const banded = [
    { ...termResult, id: "b-1", student: named("Keza", "Uwimana"), rank: 1, totalMarks: 412, average: 88.2, letterGrade: "A", isPublished: false },
    { ...termResult, id: "b-2", student: named("Divine", "Niyonkuru"), rank: 2, totalMarks: 350, average: 71.5, letterGrade: "B", isPublished: false },
    { ...termResult, id: "b-3", student: named("Manzi", "Habimana"), rank: 3, totalMarks: 268, average: 54.9, letterGrade: "C", isPublished: false },
    { ...termResult, id: "b-4", student: named("Gasana", "Mugisha"), rank: 4, totalMarks: 190, average: 38.0, letterGrade: "F", isPublished: false },
    // Nothing computed yet: no rank, no total, no average, no grade.
    { ...termResult, id: "b-5", student: named("Iradukunda", "Mukamana"), rank: null, totalMarks: null, average: null, letterGrade: null, isPublished: false },
  ];

  const rowFor = (id: string) => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>("tbody tr"));
    return cells[banded.findIndex((b) => b.id === id)];
  };

  it("gives the top three ranks their own badge", async () => {
    await mount(banded);

    const first = within(rowFor("b-1")).getByText("1").className;
    const second = within(rowFor("b-2")).getByText("2").className;
    const fourth = within(rowFor("b-4")).getByText("4").className;
    expect(first).not.toBe(second);
    expect(second).not.toBe(fourth);
  });

  it("colours the average against the pass bands", async () => {
    await mount(banded);

    const classOf = (id: string, text: RegExp) =>
      within(rowFor(id)).getByText(text).className;

    const top = classOf("b-1", /88\.2/);
    const middle = classOf("b-2", /71\.5/);
    const low = classOf("b-3", /54\.9/);
    const fail = classOf("b-4", /38\.0/);
    expect(new Set([top, middle, low, fail]).size).toBe(4);
  });

  it("colours a C differently from an A and from a fail", async () => {
    await mount(banded);

    const a = within(rowFor("b-1")).getByText("A").className;
    const c = within(rowFor("b-3")).getByText("C").className;
    const f = within(rowFor("b-4")).getByText("F").className;
    expect(a).not.toBe(c);
    expect(c).not.toBe(f);
  });

  it("draws dashes for a student nothing has been computed for", async () => {
    await mount(banded);

    const row = rowFor("b-5");
    // Rank, total, average and grade: four blanks, not four zeroes.
    expect(within(row).getAllByText(/^-/).length).toBeGreaterThanOrEqual(3);
  });

  it("averages the class over the blanks without going NaN", async () => {
    await mount(banded);

    // Highest, lowest and mean sit above the table. A null average counts as
    // nothing, not as a missing number that poisons the arithmetic.
    expect(document.body.textContent).not.toMatch(/NaN/);
    // Once in the row, once as the class's highest.
    expect(screen.getAllByText(/88\.2%/).length).toBeGreaterThanOrEqual(2);
  });

  it("exports the blanks as blanks", async () => {
    await mount(banded);

    // The download is a Blob handed to createObjectURL and clicked through an
    // anchor. Reading the blob is the only place the CSV text exists.
    let captured: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        captured = blob;
        return "blob:x";
      }),
      revokeObjectURL: vi.fn(),
    });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") el.click = () => {};
      return el;
    });

    await click(button(/export/i));
    vi.mocked(document.createElement).mockRestore();

    expect(captured).toBeTruthy();
    const lines = (await captured!.text()).split("\n");
    // The unranked student's row: empty rank, then the name, then two blanks.
    expect(lines.at(-1)).toMatch(/^"",/);
    expect(lines.at(-1)).toContain('"",""');
  });

  it("exports nothing at all when there are no results", async () => {
    await mountEmpty();
    const exportButton = button(/export/i);
    expect(exportButton).toBeDisabled();
  });
});

/**
 * A class whose results have not been computed yet.
 *
 * That is every class at the start of a term, and it is a different thing from
 * "no class chosen": the first needs the Calculate button, the second needs a
 * class picking. Saying the wrong one sends an admin looking in the wrong
 * place.
 */
describe("a chosen class with nothing computed", () => {
  it("says so rather than showing an empty table", async () => {
    await mountEmpty();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/no results|not been calculated|calculate/i),
    );
  });

  it("offers Calculate rather than Export", async () => {
    await mountEmpty();

    expect(button(/calculate/i)).toBeTruthy();
    expect(button(/export/i)).toBeDisabled();
  });
});
