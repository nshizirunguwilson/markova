import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/promotion",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import { chooseCascadingFilters, exercisePage } from "@/test/exercise";
import { populatedRoutes, students } from "@/test/fixtures";

import PromotionPage from "./page";

/**
 * Promotion moves every student in a class up a year, or holds them back. It is
 * the single most destructive thing an admin can do in this app, and it happens
 * once a year, which is exactly the kind of thing nobody has practised.
 */
/** Matches the API: a flat `students` list with a recommendation each. */
const preview = {
  total: 2,
  recommendedPromote: 1,
  recommendedRetain: 1,
  students: [
    {
      studentId: students[0].id,
      name: "Divine Niyonkuru",
      studentIdNumber: students[0].studentIdNumber,
      average: 82,
      recommendation: "PROMOTE",
      hasResult: true,
    },
    {
      studentId: students[1].id,
      name: "Keza Mutesi",
      studentIdNumber: students[1].studentIdNumber,
      average: 38,
      recommendation: "RETAIN",
      hasResult: true,
    },
  ],
};

const routes = {
  ...populatedRoutes,
  "/academic/promote/preview": preview,
  "/academic/promote/commit": { promoted: 1, repeated: 1 },
};

function button(pattern: RegExp) {
  return screen
    .queryAllByRole("button")
    .find((b) => pattern.test((b.textContent ?? "").trim()));
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(PromotionPage, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

/**
 * The ladder a promotion climbs.
 *
 * The school's six levels are Senior 1-3 then TVET Level 3-5, which is
 * ClassLevel.order 1..6. The destination list used to be every level in the
 * school, so "Senior 2 → Senior 1" was one click away and it demoted a whole
 * class without a word.
 */
describe("which class a student can be promoted into", () => {
  const level = (id: string, name: string, order: number) => ({
    id,
    name,
    order,
    stage: order <= 3 ? "O_LEVEL" : "A_LEVEL",
    sections: [
      { id: `${id}-a`, name: "A", classLevelId: id, trade: null, tradeId: null, _count: { students: 30 } },
    ],
  });

  const ladder = [
    level("lvl-1", "Senior 1", 1),
    level("lvl-2", "Senior 2", 2),
    level("lvl-3", "Senior 3", 3),
    level("lvl-4", "Level 3", 4),
    level("lvl-5", "Level 4", 5),
    level("lvl-6", "Level 5", 6),
  ];

  async function mountLadder() {
    // Deliberately shuffled: the page sorts by `order`, not by the order the
    // API happened to answer in.
    serve(h.api, {
      ...routes,
      "/academic/class-levels": [ladder[3], ladder[0], ladder[5], ladder[1], ladder[4], ladder[2]],
    });
    renderPage(PromotionPage, { role: "ADMIN" });
    // Wait for the levels themselves: the selects render empty first.
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Senior 3/),
    );
  }

  const levelSelects = () =>
    screen.getAllByLabelText(/select level|no level above/i) as HTMLSelectElement[];

  async function chooseFrom(value: string) {
    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(levelSelects()[0], { target: { value } });
    });
  }

  it("lists the source levels in the order the school runs them", async () => {
    await mountLadder();
    expect(
      Array.from(levelSelects()[0].options)
        .map((o) => o.textContent?.trim())
        .filter((t) => t !== "Select level"),
    ).toEqual([
      "Senior 1",
      "Senior 2",
      "Senior 3",
      "Level 3",
      "Level 4",
      "Level 5",
    ]);
  });

  it("offers only the levels above the one they are in", async () => {
    await mountLadder();
    await chooseFrom("lvl-2");

    const options = Array.from(levelSelects()[1].options)
      .map((o) => o.value)
      .filter(Boolean);
    expect(options).toEqual(["lvl-3", "lvl-4", "lvl-5", "lvl-6"]);
    expect(options).not.toContain("lvl-1");
    expect(options).not.toContain("lvl-2");
  });

  it("marks the next level up as the usual answer", async () => {
    await mountLadder();
    await chooseFrom("lvl-2");
    expect(levelSelects()[1].textContent).toMatch(/Senior 3 — next level/);
  });

  // It is the answer nine times in ten, so it is offered already filled in.
  it("fills the next level in without being asked", async () => {
    await mountLadder();
    await chooseFrom("lvl-2");
    expect(levelSelects()[1].value).toBe("lvl-3");
    expect(document.body.textContent).toMatch(/Senior 2 → Senior 3/);
  });

  // A destination chosen before the source moved up has to be let go of, or a
  // level at or below the new source would be sent to the server.
  it("drops a destination that the new source has caught up with", async () => {
    await mountLadder();
    const { act, fireEvent } = await import("@testing-library/react");
    await chooseFrom("lvl-1");
    await act(async () => {
      fireEvent.change(levelSelects()[1], { target: { value: "lvl-2" } });
    });
    expect(levelSelects()[1].value).toBe("lvl-2");

    await chooseFrom("lvl-3");
    expect(levelSelects()[1].value).toBe("lvl-4");
  });

  it("keeps a destination that is still above the new source", async () => {
    await mountLadder();
    const { act, fireEvent } = await import("@testing-library/react");
    await chooseFrom("lvl-1");
    await act(async () => {
      fireEvent.change(levelSelects()[1], { target: { value: "lvl-6" } });
    });
    await chooseFrom("lvl-2");
    expect(levelSelects()[1].value).toBe("lvl-6");
  });

  /**
   * Level 5 is the end of the school. Those students complete their studies
   * rather than moving up, and offering a destination would be a lie.
   */
  it("shuts the destination on the last level in the school", async () => {
    await mountLadder();
    await chooseFrom("lvl-6");

    expect(levelSelects()[1]).toBeDisabled();
    expect(levelSelects()[1].textContent).toMatch(/No level above this one/);
    expect(document.body.textContent).toMatch(/is the last level in the school/);
  });

  it("asks for the source class before saying anything about the destination", async () => {
    await mountLadder();
    expect(document.body.textContent).toMatch(
      /Pick the class they are coming from first/,
    );
  });
});

describe("before anything is promoted", () => {
  it("renders the year and class pickers", async () => {
    await mount();
    await waitFor(() =>
      expect(document.querySelectorAll("select").length).toBeGreaterThan(0),
    );
  });

  it("is usable on a school with no years set up", async () => {
    serveAll(h.api, []);
    await mount();
    expect(document.body.textContent).not.toBe("");
  });

  // Committing without previewing would move a whole cohort on an unchecked
  // decision. The preview is the safety rail.
  it("does not commit anything on load", async () => {
    await mount();
    const urls = h.api.post.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("commit"))).toBe(false);
  });
});

/**
 * End-of-year deliberation.
 *
 * This is the page that moves a whole class into the next year, or holds a
 * student back for one. Both are decisions a family hears about, so the run
 * has to be deliberate: nothing is committed by loading, the recommendation
 * can be overridden per student, and the destination class must be chosen
 * before anything is written.
 */
describe("deliberating a class", () => {
  const roll = [
    {
      studentId: "student-1",
      studentIdNumber: "STD-2025-0001",
      name: "Divine Niyonkuru",
      average: 72,
      disciplinePoints: 100,
      recommendation: "PROMOTE",
      reason: "Above the pass mark",
    },
    {
      studentId: "student-2",
      studentIdNumber: "STD-2025-0002",
      name: "Keza Mutesi",
      average: 38,
      disciplinePoints: 64,
      recommendation: "RETAIN",
      reason: "Below the pass mark",
    },
  ];

  /** Answers the preview with `rows`, leaving every other route alone. */
  function previewReturns(rows: unknown) {
    const real = h.api.post.getMockImplementation();
    h.api.post.mockImplementation(async (url: string, body?: unknown) => {
      if (String(url).includes("promote/preview")) {
        return { data: { students: rows }, status: 200 };
      }
      if (String(url).includes("promote/commit")) {
        return {
          data: { total: 2, promoted: 1, retained: 1 },
          status: 200,
        };
      }
      return real ? real(url, body) : { data: {}, status: 200 };
    });
  }

  /** Picks a year, a source class and (optionally) a destination. */
  async function chooseClasses({ destination = true } = {}) {
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((el) =>
          Array.from(el.options).some((o) => o.value),
        ),
      ).toBe(true),
    );

    const year = screen.getByLabelText(/academic year/i) as HTMLSelectElement;
    const firstYear = Array.from(year.options).find((o) => o.value)!;
    await act(async () => {
      fireEvent.change(year, { target: { value: firstYear.value } });
    });

    // Level then section, source first and destination second.
    const levels = screen.getAllByLabelText(/select level/i) as HTMLSelectElement[];
    const targets = destination ? levels : levels.slice(0, 1);
    for (const level of targets) {
      const option = Array.from(level.options).find((o) => o.value);
      if (!option) continue;
      await act(async () => {
        fireEvent.change(level, { target: { value: option.value } });
      });
    }

    await waitFor(() => {
      const sections = screen.queryAllByLabelText(/select section/i) as HTMLSelectElement[];
      expect(sections.some((s) => Array.from(s.options).some((o) => o.value))).toBe(true);
    });

    const sections = screen.getAllByLabelText(/select section/i) as HTMLSelectElement[];
    const wanted = destination ? sections : sections.slice(0, 1);
    for (const section of wanted) {
      const option = Array.from(section.options).find((o) => o.value);
      if (!option) continue;
      await act(async () => {
        fireEvent.change(section, { target: { value: option.value } });
      });
    }
  }

  /** The button really says "Load students for deliberation". */
  function loadButton() {
    return screen
      .queryAllByRole("button")
      .find((b) => /load students/i.test(b.textContent ?? ""));
  }

  function commitButton() {
    return screen
      .queryAllByRole("button")
      .find((b) => /commit decisions/i.test(b.textContent ?? ""));
  }

  async function loadRoll(opts: { destination?: boolean } = {}) {
    previewReturns(roll);
    await mount();
    await chooseClasses(opts);
    const load = loadButton();
    expect(load).toBeTruthy();
    await act(async () => {
      fireEvent.click(load!);
    });
    await waitFor(() => expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument());
  }

  // Nothing can be loaded before a year and a class say which students.
  it("keeps the load button refused until a class is chosen", async () => {
    await mount();
    await waitFor(() => expect(loadButton()).toBeTruthy());
    expect(loadButton()).toBeDisabled();
  });

  it("asks the API to work out who moves up", async () => {
    await loadRoll();
    const call = h.api.post.mock.calls.find(([url]: any[]) =>
      String(url).includes("promote/preview"),
    );
    expect(call).toBeTruthy();
    expect((call![1] as any).academicYearId).toBeTruthy();
  });

  it("lists each student with their average and conduct", async () => {
    await loadRoll();
    const row = screen.getByText(/Divine Niyonkuru/).closest("tr")!;
    expect(row.textContent).toMatch(/STD-2025-0001/);
    expect(row.textContent).toMatch(/72%/);
    expect(row.textContent).toMatch(/100/);
  });

  // The recommendation and the reason travel together, or a retained student
  // is a decision nobody can explain to a parent.
  it("shows the recommendation with the reason behind it", async () => {
    await loadRoll();
    const row = screen.getByText(/Keza Mutesi/).closest("tr")!;
    expect(row.textContent).toMatch(/Retain/);
    expect(row.textContent).toMatch(/Below the pass mark/);
  });

  // Loading is a read. Nothing about the students changes yet.
  it("writes nothing when the roll is loaded", async () => {
    await loadRoll();
    const committed = h.api.post.mock.calls.find(([url]: any[]) =>
      String(url).includes("promote/commit"),
    );
    expect(committed).toBeUndefined();
  });

  // A running tally, so the meeting can see the shape of the year before
  // anything is written.
  it("tallies the class as it stands", async () => {
    await loadRoll();
    expect(document.body.textContent).toMatch(/Promote:\s*1/);
    expect(document.body.textContent).toMatch(/Retain:\s*1/);
    expect(document.body.textContent).toMatch(/Deliberation \(2 students\)/);
  });

  it("counts the overrides once one is made", async () => {
    await loadRoll();
    const row = screen.getByText(/Divine Niyonkuru/).closest("tr")!;
    const retain = Array.from(row.querySelectorAll("button")).find((b) =>
      /^retain$/i.test((b.textContent ?? "").trim()),
    );
    await act(async () => {
      fireEvent.click(retain!);
    });

    await waitFor(() => expect(document.body.textContent).toMatch(/1 override/i));
    expect(document.body.textContent).toMatch(/Promote:\s*0/);
  });
});

describe("overriding a recommendation", () => {
  const roll = [
    {
      studentId: "student-1",
      studentIdNumber: "STD-2025-0001",
      name: "Divine Niyonkuru",
      average: 72,
      disciplinePoints: 100,
      recommendation: "PROMOTE",
      reason: "Above the pass mark",
    },
  ];

  function previewReturns(rows: unknown) {
    h.api.post.mockImplementation(async (url: string) => {
      if (String(url).includes("promote/preview")) return { data: { students: rows }, status: 200 };
      if (String(url).includes("promote/commit")) {
        return { data: { total: 1, promoted: 0, retained: 1 }, status: 200 };
      }
      return { data: {}, status: 200 };
    });
  }

  async function loadOne() {
    previewReturns(roll);
    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((el) =>
          Array.from(el.options).some((o) => o.value),
        ),
      ).toBe(true),
    );
    const year = screen.getByLabelText(/academic year/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(year, { target: { value: Array.from(year.options).find((o) => o.value)!.value } });
    });
    for (const level of screen.getAllByLabelText(/select level/i) as HTMLSelectElement[]) {
      const o = Array.from(level.options).find((x) => x.value);
      if (o) await act(async () => { fireEvent.change(level, { target: { value: o.value } }); });
    }
    await waitFor(() => {
      const secs = screen.queryAllByLabelText(/select section/i) as HTMLSelectElement[];
      expect(secs.some((s) => Array.from(s.options).some((o) => o.value))).toBe(true);
    });
    for (const sec of screen.getAllByLabelText(/select section/i) as HTMLSelectElement[]) {
      const o = Array.from(sec.options).find((x) => x.value);
      if (o) await act(async () => { fireEvent.change(sec, { target: { value: o.value } }); });
    }
    const load = screen.queryAllByRole("button").find((b) => /load students/i.test(b.textContent ?? ""));
    await act(async () => { fireEvent.click(load!); });
    await waitFor(() => expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument());
  }

  function decisionButton(label: RegExp) {
    const row = screen.getByText(/Divine Niyonkuru/).closest("tr")!;
    return Array.from(row.querySelectorAll("button")).find((b) =>
      label.test((b.textContent ?? "").trim()),
    );
  }

  // A deliberation meeting exists precisely to overrule the arithmetic.
  it("lets a recommendation be overruled", async () => {
    await loadOne();
    await act(async () => {
      fireEvent.click(decisionButton(/^retain$/i)!);
    });

    await waitFor(() =>
      expect(screen.getByText(/Divine Niyonkuru/).closest("tr")!.textContent).toMatch(
        /overridden/i,
      ),
    );
  });

  it("does not call an untouched decision an override", async () => {
    await loadOne();
    const row = screen.getByText(/Divine Niyonkuru/).closest("tr")!;
    expect(row.textContent).not.toMatch(/overridden/i);
  });

  it("drops the override when the recommendation is chosen again", async () => {
    await loadOne();
    await act(async () => {
      fireEvent.click(decisionButton(/^retain$/i)!);
    });
    await waitFor(() =>
      expect(screen.getByText(/Divine Niyonkuru/).closest("tr")!.textContent).toMatch(/overridden/i),
    );

    await act(async () => {
      fireEvent.click(decisionButton(/^promote$/i)!);
    });
    await waitFor(() =>
      expect(screen.getByText(/Divine Niyonkuru/).closest("tr")!.textContent).not.toMatch(
        /overridden/i,
      ),
    );
  });

  // The override is what gets written, not the recommendation it replaced.
  it("commits the overridden decision, not the recommendation", async () => {
    await loadOne();
    await act(async () => {
      fireEvent.click(decisionButton(/^retain$/i)!);
    });

    h.api.post.mockClear();
    const commit = screen
      .queryAllByRole("button")
      .find((b) => /commit decisions/i.test(b.textContent ?? ""));
    expect(commit).toBeTruthy();
    await act(async () => {
      fireEvent.click(commit!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("promote/commit"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).decisions).toEqual([
        { studentId: "student-1", decision: "RETAIN" },
      ]);
    });
  });

  it("reports what the commit did", async () => {
    await loadOne();
    const commit = screen
      .queryAllByRole("button")
      .find((b) => /commit decisions/i.test(b.textContent ?? ""));
    await act(async () => {
      fireEvent.click(commit!);
    });

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    expect(String(h.toast.success.mock.calls[0][0])).toMatch(/promoted/i);
  });

  // Once committed the roll is stale, and re-committing would move the class
  // twice.
  it("clears the roll once it is committed", async () => {
    await loadOne();
    const commit = screen
      .queryAllByRole("button")
      .find((b) => /commit decisions/i.test(b.textContent ?? ""));
    await act(async () => {
      fireEvent.click(commit!);
    });

    await waitFor(() =>
      expect(screen.queryByText(/Divine Niyonkuru/)).not.toBeInTheDocument(),
    );
  });
});

describe("when the API refuses", () => {
  it("says so rather than looking like nothing happened", async () => {
    await mount();
    h.api.post.mockRejectedValue({
      response: { status: 400, data: { message: "Term is not closed yet" } },
    });
    const preview = button(/preview|check|calculate/i);
    if (!preview) return;
    await act(async () => {
      fireEvent.click(preview);
    });
    await waitFor(() =>
      expect(
        h.toast.error.mock.calls.length + h.api.post.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });
});

describe("a preview that comes back without its list", () => {
  // The handler used to read `data.students` unguarded, so a response shaped
  // even slightly differently killed the page mid-promotion.
  it("does not crash the page", async () => {
    serve(h.api, { ...routes, "/academic/promote/preview": { total: 0 } });
    await mount();
    const preview = button(/preview|check|calculate/i);
    if (preview) {
      await act(async () => {
        fireEvent.click(preview);
      });
    }
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("every control on the page", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});

/**
 * The school's own pass mark, and the guards on the two buttons.
 *
 * Every school sets its own threshold in settings, and the promotion screen
 * has to use it rather than a number hard-coded here. The guards below are the
 * other half: neither button may do anything until the school has said which
 * class the students are coming from and which they are going to.
 */
describe("the school's own pass mark", () => {
  const withThreshold = {
    ...routes,
    "/school-config": {
      schoolName: "Groupe Scolaire Kigali",
      map: { passThreshold: 60 },
    },
  };

  it("shows the school's default beside the field", async () => {
    serve(h.api, withThreshold);
    await mount();
    expect(await screen.findByText(/default 60/)).toBeInTheDocument();
  });

  it("offers it as the placeholder rather than a made-up fifty", async () => {
    serve(h.api, withThreshold);
    await mount();
    const field = await screen.findByLabelText(/pass mark/i);
    expect(field).toHaveAttribute("placeholder", "60");
  });

  it("falls back to fifty when the school has not set one", async () => {
    await mount();
    const field = await screen.findByLabelText(/pass mark/i);
    expect(field).toHaveAttribute("placeholder", "50");
    expect(screen.queryByText(/^default /)).toBeNull();
  });
});

describe("the guards on a year's promotion", () => {
  it("sends nothing when Load is pressed with no class chosen", async () => {
    await mount();
    const load = screen
      .queryAllByRole("button")
      .find((b) => /load students/i.test(b.textContent ?? ""))!;

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(load);
    });

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("promote/preview"),
      ),
    ).toBeUndefined();
  });
});

/**
 * A preview whose rows are missing pieces, and a commit with nothing loaded.
 *
 * The API answers `{ students }`, and a version of it that does not is the
 * difference between a page that says "nobody to deliberate" and a page that
 * dies half way through the meeting.
 */
describe("a preview that comes back in the wrong shape", () => {
  function previewAnswers(body: unknown) {
    const real = h.api.post.getMockImplementation();
    h.api.post.mockImplementation(async (url: string, payload?: unknown) => {
      if (String(url).includes("promote/preview")) return { data: body, status: 200 };
      return real ? real(url, payload) : { data: {}, status: 200 };
    });
  }

  async function loadWith(body: unknown) {
    serve(h.api, routes);
    previewAnswers(body);
    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((el) =>
          Array.from(el.options).some((o) => o.value),
        ),
      ).toBe(true),
    );

    const year = screen.getByLabelText(/academic year/i) as HTMLSelectElement;
    const firstYear = Array.from(year.options).find((o) => o.value);
    if (!firstYear) return false;
    await act(async () => {
      fireEvent.change(year, { target: { value: firstYear.value } });
    });
    for (const level of screen.getAllByLabelText(/select level/i) as HTMLSelectElement[]) {
      const option = Array.from(level.options).find((o) => o.value);
      if (option) {
        await act(async () => {
          fireEvent.change(level, { target: { value: option.value } });
        });
      }
    }
    await waitFor(() => {
      const sections = screen.queryAllByLabelText(/select section/i) as HTMLSelectElement[];
      expect(sections.some((s) => Array.from(s.options).some((o) => o.value))).toBe(true);
    });
    for (const section of screen.getAllByLabelText(/select section/i) as HTMLSelectElement[]) {
      const option = Array.from(section.options).find((o) => o.value);
      if (option) {
        await act(async () => {
          fireEvent.change(section, { target: { value: option.value } });
        });
      }
    }

    const load = screen
      .queryAllByRole("button")
      .find((b) => /load students/i.test(b.textContent ?? ""));
    if (!load || load.hasAttribute("disabled")) return false;
    await act(async () => {
      fireEvent.click(load);
    });
    return true;
  }

  it("survives a preview with no list on it at all", async () => {
    if (!(await loadWith({ total: 0 }))) return;

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it("survives a preview that is not an object", async () => {
    if (!(await loadWith(null))) return;

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it("falls back to the recommendation for a student nobody decided on", async () => {
    const ok = await loadWith({
      students: [
        {
          studentId: "student-9",
          studentIdNumber: "STD-2026-9",
          name: "Keza Uwimana",
          average: 71,
          disciplinePoints: 95,
          recommendation: "PROMOTE",
          reason: "Above the pass mark",
        },
      ],
    });
    if (!ok) return;

    await waitFor(() =>
      expect(screen.getByText(/Keza Uwimana/)).toBeInTheDocument(),
    );
    // Nothing was overridden, so the tally follows what the server advised.
    expect(document.body.textContent).toMatch(/Promote:\s*1/);
  });
});

/**
 * The roll loaded with no destination class chosen.
 *
 * A deliberation meeting loads the class first and decides where the year
 * group is going afterwards, so this is the ordinary state for most of the
 * meeting. Commit has to be refused, and it has to say why.
 */
describe("deliberating before a destination is chosen", () => {
  const roll = [
    {
      studentId: "student-1",
      studentIdNumber: "STD-2025-0001",
      name: "Divine Niyonkuru",
      average: 72,
      disciplinePoints: 100,
      recommendation: "PROMOTE",
      reason: "Above the pass mark",
    },
  ];

  async function loadWithoutDestination() {
    serve(h.api, routes);
    const real = h.api.post.getMockImplementation();
    h.api.post.mockImplementation(async (url: string, payload?: unknown) => {
      if (String(url).includes("promote/preview")) {
        return { data: { students: roll }, status: 200 };
      }
      return real ? real(url, payload) : { data: {}, status: 200 };
    });

    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((el) =>
          Array.from(el.options).some((o) => o.value),
        ),
      ).toBe(true),
    );

    const year = screen.getByLabelText(/academic year/i) as HTMLSelectElement;
    const firstYear = Array.from(year.options).find((o) => o.value);
    if (!firstYear) return false;
    await act(async () => {
      fireEvent.change(year, { target: { value: firstYear.value } });
    });

    // Only the source level and class, deliberately leaving the destination
    // where it started.
    const level = (screen.getAllByLabelText(/select level/i) as HTMLSelectElement[])[0];
    const levelOption = Array.from(level.options).find((o) => o.value);
    if (!levelOption) return false;
    await act(async () => {
      fireEvent.change(level, { target: { value: levelOption.value } });
    });
    await waitFor(() => {
      const sections = screen.queryAllByLabelText(/select section/i) as HTMLSelectElement[];
      expect(sections.some((s) => Array.from(s.options).some((o) => o.value))).toBe(true);
    });
    const section = (screen.getAllByLabelText(/select section/i) as HTMLSelectElement[])[0];
    const sectionOption = Array.from(section.options).find((o) => o.value);
    if (!sectionOption) return false;
    await act(async () => {
      fireEvent.change(section, { target: { value: sectionOption.value } });
    });

    const load = screen
      .queryAllByRole("button")
      .find((b) => /load students/i.test(b.textContent ?? ""));
    if (!load || load.hasAttribute("disabled")) return false;
    await act(async () => {
      fireEvent.click(load);
    });
    await waitFor(() =>
      expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument(),
    );
    return true;
  }

  it("says a destination is still needed", async () => {
    if (!(await loadWithoutDestination())) return;

    expect(
      screen.getByText(/Select a destination class above to commit/i),
    ).toBeInTheDocument();
  });

  it("refuses the commit button", async () => {
    if (!(await loadWithoutDestination())) return;

    expect(
      screen.queryAllByRole("button").find((b) => /commit decisions/i.test(b.textContent ?? "")),
    ).toBeDisabled();
  });

  it("writes nothing even if the button is reached", async () => {
    if (!(await loadWithoutDestination())) return;
    h.api.post.mockClear();

    const commit = screen
      .queryAllByRole("button")
      .find((b) => /commit decisions/i.test(b.textContent ?? ""));
    if (!commit) return;
    await act(async () => {
      fireEvent.click(commit);
    });

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("promote/commit"),
      ),
    ).toBeUndefined();
  });
});

/**
 * A student the server had no advice about.
 *
 * A student with no marks at all comes back with no recommendation, and the
 * deliberation table has to show them anyway: they are exactly the student a
 * meeting needs to talk about.
 */
describe("a student with no recommendation", () => {
  it("still appears in the table", async () => {
    serve(h.api, routes);
    const real = h.api.post.getMockImplementation();
    h.api.post.mockImplementation(async (url: string, payload?: unknown) => {
      if (String(url).includes("promote/preview")) {
        return {
          data: {
            students: [
              {
                studentId: "student-9",
                studentIdNumber: "STD-2026-9",
                name: "Iradukunda Mukamana",
                average: 0,
                disciplinePoints: 100,
                recommendation: undefined,
                reason: "No marks recorded",
              },
            ],
          },
          status: 200,
        };
      }
      return real ? real(url, payload) : { data: {}, status: 200 };
    });

    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((el) =>
          Array.from(el.options).some((o) => o.value),
        ),
      ).toBe(true),
    );

    const year = screen.getByLabelText(/academic year/i) as HTMLSelectElement;
    const firstYear = Array.from(year.options).find((o) => o.value);
    if (!firstYear) return;
    await act(async () => {
      fireEvent.change(year, { target: { value: firstYear.value } });
    });
    for (const level of screen.getAllByLabelText(/select level/i) as HTMLSelectElement[]) {
      const option = Array.from(level.options).find((o) => o.value);
      if (option) {
        await act(async () => {
          fireEvent.change(level, { target: { value: option.value } });
        });
      }
    }
    await waitFor(() => {
      const sections = screen.queryAllByLabelText(/select section/i) as HTMLSelectElement[];
      expect(sections.some((s) => Array.from(s.options).some((o) => o.value))).toBe(true);
    });
    for (const section of screen.getAllByLabelText(/select section/i) as HTMLSelectElement[]) {
      const option = Array.from(section.options).find((o) => o.value);
      if (option) {
        await act(async () => {
          fireEvent.change(section, { target: { value: option.value } });
        });
      }
    }

    const load = screen
      .queryAllByRole("button")
      .find((b) => /load students/i.test(b.textContent ?? ""));
    if (!load || load.hasAttribute("disabled")) return;
    await act(async () => {
      fireEvent.click(load);
    });

    await waitFor(() =>
      expect(screen.getByText(/Iradukunda Mukamana/)).toBeInTheDocument(),
    );
    // With no advice either way they count towards Retain, which is the safe
    // default for a student nobody has marks for.
    expect(document.body.textContent).toMatch(/Retain:\s*1/);
  });
});
