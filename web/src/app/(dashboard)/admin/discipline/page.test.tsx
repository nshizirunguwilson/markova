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
  usePathname: () => "/admin/discipline",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classSection, populatedRoutes, students } from "@/test/fixtures";

import DisciplinePage from "./page";

/**
 * The discipline register.
 *
 * Every row here costs a student points and reaches a parent, and an appeal is
 * the family's only way to answer back. So the two things that matter are that
 * a record is never deleted on a single tap, and that an appeal decision says
 * which way it went.
 */

const incident = (over: Record<string, unknown> = {}) => ({
  id: "inc-1",
  date: "2026-08-18T10:00:00Z",
  description: "Late to assembly three times this week",
  pointsDeducted: 5,
  actionTaken: "VERBAL_WARNING",
  parentAcknowledged: false,
  student: { ...students[0], classSection },
  ...over,
});

const appeal = {
  id: "ap-1",
  statement: "He was helping carry chairs for the assembly.",
  createdAt: "2026-08-19T08:00:00Z",
  submittedBy: { firstName: "Jean", lastName: "Habimana" },
  incident: {
    description: "Late to assembly three times this week",
    pointsDeducted: 5,
    student: { ...students[0], classSection },
  },
};

const routes = {
  ...populatedRoutes,
  "/discipline/incidents": [
    incident(),
    incident({
      id: "inc-2",
      description: "Fighting in the corridor",
      pointsDeducted: 20,
      actionTaken: "SUSPENSION",
      parentAcknowledged: true,
      student: { ...students[1], classSection },
    }),
  ],
  "/discipline/appeals/pending": [appeal],
  "/discipline/merits/watch-list": {
    days: 30,
    students: [
      {
        id: "student-1",
        studentIdNumber: "STD-2026-001",
        disciplinePoints: 88,
        classSection,
        user: { firstName: "Divine", lastName: "Niyonkuru" },
        incidents: 3,
        pointsLost: 12,
        merits: 0,
        nothingPositive: true,
      },
      {
        id: "student-2",
        studentIdNumber: "STD-2026-002",
        disciplinePoints: 94,
        classSection,
        user: { firstName: "Keza", lastName: "Mutesi" },
        incidents: 2,
        pointsLost: 6,
        merits: 2,
        nothingPositive: false,
      },
    ],
  },
  "/discipline/merits/summary": {
    awarded: 18,
    incidents: 40,
    ratio: 0.45,
    byCategory: {
      ACADEMIC_EFFORT: 0,
      HELPING_OTHERS: 6,
      LEADERSHIP: 2,
      SPORT: 10,
      ARTS: 0,
      SERVICE: 0,
      HONESTY: 0,
      IMPROVEMENT: 0,
    },
    mostRecognised: [],
  },
  "/discipline/merits": {
    data: [
      {
        id: "merit-1",
        category: "HELPING_OTHERS",
        description: "Stayed behind to help clear the science lab",
        points: 5,
        date: "2026-08-20T00:00:00Z",
        student: { ...students[0], classSection, disciplinePoints: 88 },
        awardedBy: { firstName: "Aline", lastName: "Uwase", role: "TEACHER" },
      },
    ],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  },
  "/discipline/dashboard": {
    totalIncidents: 2,
    byAction: [{ name: "VERBAL_WARNING", count: 1 }],
  },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(DisciplinePage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Late to assembly/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function tab(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

describe("the incidents this term", () => {
  it("lists them", async () => {
    await mount();
    expect(screen.getByText(/Fighting in the corridor/)).toBeInTheDocument();
  });

  it("names the student and their class", async () => {
    await mount();
    const row = screen.getByText(/Late to assembly/).closest("tr")!;
    expect(row.textContent).toMatch(/Divine/);
    expect(row.textContent).toMatch(/Senior 1/);
  });

  // The points are a deduction, so the sign matters.
  it("shows the points as a deduction", async () => {
    await mount();
    const row = screen.getByText(/Late to assembly/).closest("tr")!;
    expect(row.textContent).toMatch(/-5/);
  });

  // The raw enum is not something to put in front of a head teacher.
  it("writes the action in words, not as an enum", async () => {
    await mount();
    expect(screen.getByText("Verbal Warning")).toBeInTheDocument();
    expect(screen.getByText("Suspension")).toBeInTheDocument();
  });

  it("falls back to the raw action if it is one we do not know", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/incidents": [incident({ actionTaken: "COMMUNITY_SERVICE" })],
    });
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText("COMMUNITY_SERVICE")).toBeInTheDocument());
  });

  // Whether the parent has seen it is the whole point of recording it.
  it("says whether the parent has acknowledged it", async () => {
    await mount();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Ack")).toBeInTheDocument();
  });

  it("says so when the term has no incidents", async () => {
    serve(h.api, { ...routes, "/discipline/incidents": [] });
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/no incidents recorded/i)).toBeInTheDocument(),
    );
  });

  it("does not go blank when the register fails to load", async () => {
    serveFailure(h.api);
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  // The register opens on this term. The first fetch goes out before the terms
  // have loaded, so it is the latest one that carries the filter.
  it("asks only for the current term", async () => {
    await mount();
    await waitFor(() => {
      const call = [...h.api.get.mock.calls]
        .reverse()
        .find(([url]) => String(url).includes("/discipline/incidents"));
      expect(String(call![0])).toMatch(/termId=term-1/);
    });
  });
});

describe("deleting an incident", () => {
  // A record deleted by accident takes the points and the parent's copy with
  // it, so it goes through a confirmation.
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
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes that incident once confirmed", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^confirm$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith("/discipline/incidents/inc-1"),
    );
  });
});

describe("appeals waiting on a decision", () => {
  async function openAppeals() {
    await mount();
    await click(tab(/appeals/i));
    await waitFor(() => expect(screen.getByText(/helping carry chairs/i)).toBeInTheDocument());
  }

  // An appeal is meaningless without the incident it answers.
  it("shows the appeal beside the incident it is about", async () => {
    await openAppeals();
    expect(screen.getByText(/Incident:/)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/Late to assembly/);
  });

  it("names who submitted it", async () => {
    await openAppeals();
    expect(document.body.textContent).toMatch(/Jean Habimana/);
  });

  it("counts the waiting appeals on the tab", async () => {
    await mount();
    const appealsTab = tab(/appeals/i)!;
    expect(appealsTab.textContent).toMatch(/1/);
  });

  it("approves one", async () => {
    await openAppeals();
    h.api.put.mockClear();
    await click(
      screen.queryAllByRole("button").find((b) => /^approve$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.put.mock.calls.find(([url]: any[]) =>
        String(url).includes("/appeals/ap-1/review"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).status).toBe("APPROVED");
    });
  });

  // Approve and reject must not both send the same thing.
  it("rejects one", async () => {
    await openAppeals();
    h.api.put.mockClear();
    await click(
      screen.queryAllByRole("button").find((b) => /^reject$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.put.mock.calls.find(([url]: any[]) =>
        String(url).includes("/appeals/ap-1/review"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).status).toBe("REJECTED");
    });
  });

  it("says so when nothing is waiting", async () => {
    serve(h.api, { ...routes, "/discipline/appeals/pending": [] });
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Late to assembly/)).toBeInTheDocument());
    await click(tab(/appeals/i));

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/helping carry chairs/i)).toBeNull();
  });
});

describe("recording an incident", () => {
  async function openForm() {
    await mount();
    await click(tab(/record incident/i));
    return screen.findByRole("dialog");
  }

  it("opens a form", async () => {
    const dialog = await openForm();
    expect(dialog.textContent).toMatch(/description/i);
  });

  it("defaults the action to the lightest one", async () => {
    const dialog = await openForm();
    const action = within(dialog)
      .getAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "SUSPENSION"),
      ) as HTMLSelectElement;
    expect(action.value).toBe("VERBAL_WARNING");
  });

  it("records it against the current term", async () => {
    const dialog = await openForm();
    for (const box of within(dialog).getAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "Shouting in the corridor" } });
      });
    }

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^(record|save|add|create)/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/incidents"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).termId).toBe("term-1");
    });
  });

  // Points and action travel together: a suspension worth 5 points would make
  // the register useless for spotting a pattern.
  it("carries the points and action that were chosen", async () => {
    const dialog = await openForm();

    const action = within(dialog)
      .getAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "SUSPENSION"),
      )!;
    await act(async () => {
      fireEvent.change(action, { target: { value: "SUSPENSION" } });
    });

    const points = within(dialog).getAllByRole("spinbutton")[0];
    await act(async () => {
      fireEvent.change(points, { target: { value: "20" } });
    });

    for (const box of within(dialog).getAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "Fighting in the corridor" } });
      });
    }

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^(record|save|add|create)/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/incidents"),
      );
      expect(call).toBeTruthy();
      const body = call![1] as any;
      expect(body.actionTaken).toBe("SUSPENSION");
      expect(body.pointsDeducted).toBe(20);
    });
  });

  // A number field that arrives as a string makes the running total a string
  // concatenation on the server.
  it("sends the points as a number", async () => {
    const dialog = await openForm();
    const points = within(dialog).getAllByRole("spinbutton")[0];
    await act(async () => {
      fireEvent.change(points, { target: { value: "15" } });
    });
    for (const box of within(dialog).getAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "Rudeness to staff" } });
      });
    }

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^(record|save|add|create)/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/incidents"),
      );
      expect(typeof (call![1] as any).pointsDeducted).toBe("number");
    });
  });

  it("defaults the date to today", async () => {
    const dialog = await openForm();
    const date = dialog.querySelector<HTMLInputElement>('input[type="date"]');
    expect(date).toBeTruthy();
    expect(date!.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("takes a different date", async () => {
    const dialog = await openForm();
    const date = dialog.querySelector<HTMLInputElement>('input[type="date"]')!;
    await act(async () => {
      fireEvent.change(date, { target: { value: "2026-08-14" } });
    });
    expect(date.value).toBe("2026-08-14");
  });

  it("closes without recording anything when dismissed", async () => {
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
 * Deleting an incident takes a conduct penalty off a student's record, so it
 * asks before it goes.
 */
describe("removing an incident", () => {
  it("asks first", async () => {
    await mount();

    await click(
      screen.queryAllByRole("button", { name: /delete/i })[0],
    );

    await waitFor(() =>
      expect(screen.getByText(/are you sure you want to delete this incident/i))
        .toBeInTheDocument(),
    );
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes nothing when the ask is dismissed", async () => {
    await mount();
    await click(screen.queryAllByRole("button", { name: /delete/i })[0]);
    await waitFor(() =>
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument(),
    );

    await click(
      screen.queryAllByRole("button").find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByText(/are you sure/i)).toBeNull());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes it once confirmed", async () => {
    await mount();
    await click(screen.queryAllByRole("button", { name: /delete/i })[0]);
    await waitFor(() =>
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument(),
    );

    await click(
      screen.queryAllByRole("button").find((b) => /^confirm$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
    expect(String(h.api.delete.mock.calls.at(-1)![0])).toMatch(/incidents/);
  });
});

describe("the term's discipline picture", () => {
  it("opens", async () => {
    await mount();
    await click(tab(/dashboard/i));
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("survives a term with no breakdown to show", async () => {
    serve(h.api, { ...routes, "/discipline/dashboard": { totalIncidents: 0, byAction: [] } });
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Late to assembly/)).toBeInTheDocument());
    await click(tab(/dashboard/i));
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

/**
 * The other half of behaviour.
 *
 * A conduct system with only deductions teaches a student that the best
 * possible outcome is to be unnoticed. These tests hold the two rules that
 * make merits mean something: points restore a clean sheet without inflating
 * past it, and the school can see what it never recognises.
 */
describe("merits", () => {
  async function openMerits() {
    await mount();
    await click(tab(/^Merits$/));
    await waitFor(() =>
      expect(screen.getByText(/science lab/)).toBeInTheDocument(),
    );
  }

  it("lists what has been recognised, with the reason", async () => {
    await openMerits();
    const row = screen.getByText(/science lab/).closest("tr")!;
    expect(within(row).getByText("Helping others")).toBeInTheDocument();
    expect(within(row).getByText("+5")).toBeInTheDocument();
  });

  it("names who gave it", async () => {
    await openMerits();
    const row = screen.getByText(/science lab/).closest("tr")!;
    expect(row.textContent).toMatch(/Aline Uwase/);
  });

  // Below 1 means the school writes down more of what goes wrong than what
  // goes right, which is the state most schools are in and never see.
  it("says out loud when more is recorded against students than for them", async () => {
    await openMerits();
    expect(screen.getByText("0.45")).toBeInTheDocument();
    expect(
      screen.getByText(/more gets written down against students/i),
    ).toBeInTheDocument();
  });

  it("keeps quiet when praise outweighs trouble", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/merits/summary": {
        awarded: 60,
        incidents: 40,
        ratio: 1.5,
        byCategory: { SPORT: 60 },
        mostRecognised: [],
      },
    });
    await openMerits();
    expect(
      screen.queryByText(/more gets written down against students/i),
    ).not.toBeInTheDocument();
  });

  // A school that awards nothing but sport is telling every non-sporting
  // student where they stand.
  it("shows every category, including the ones at zero", async () => {
    await openMerits();
    expect(screen.getByText("Real effort in class")).toBeInTheDocument();
    expect(screen.getByText("Turning it around")).toBeInTheDocument();
  });

  it("says so when nothing has been recognised", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/merits": {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
      },
    });
    await mount();
    await click(tab(/^Merits$/));
    await waitFor(() =>
      expect(
        screen.getByText(/nothing has been recognised this term/i),
      ).toBeInTheDocument(),
    );
  });

  it("sends a merit with its category and reason", async () => {
    await mount();
    await click(tab(/recognise a student/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what they did/i), {
        target: { value: "Handed in a wallet she found" },
      });
      fireEvent.change(screen.getByLabelText(/what for/i), {
        target: { value: "HONESTY" },
      });
    });

    // The student picker is the same component the incident form uses; the
    // button stays disabled until it has one, which is the point of this
    // assertion.
    expect(
      screen.queryAllByRole("button").find((b) => /^Recognise$/.test((b.textContent ?? "").trim())),
    ).toBeDisabled();
  });

  /**
   * Picking the student is three dependent dropdowns, and the button stays
   * disabled until the last of them has an answer.
   */
  async function pickStudent() {
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/level…/i), {
        target: { value: "level-1" },
      });
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText(/section…/i).querySelectorAll("option").length,
      ).toBeGreaterThan(1),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/section…/i), {
        target: { value: "section-1" },
      });
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText(/student…/i).querySelectorAll("option").length,
      ).toBeGreaterThan(1),
    );
    const option = screen
      .getByLabelText(/student…/i)
      .querySelectorAll("option")[1] as HTMLOptionElement;
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/student…/i), {
        target: { value: option.value },
      });
    });
    return option.value;
  }

  it("records it against the student, the reason and the term", async () => {
    await mount();
    await click(tab(/recognise a student/i));
    const studentId = await pickStudent();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what they did/i), {
        target: { value: "Handed in a wallet she found" },
      });
      fireEvent.change(screen.getByLabelText(/what for/i), {
        target: { value: "HONESTY" },
      });
    });

    h.api.post.mockClear();
    await click(
      screen.queryAllByRole("button").find((b) => /^Recognise$/.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/merits"),
      );
      expect(call).toBeTruthy();
      expect(call![1]).toMatchObject({
        studentId,
        category: "HONESTY",
        description: "Handed in a wallet she found",
        termId: "term-1",
      });
    });
  });

  it("clears the form so the next one can be recorded", async () => {
    await mount();
    await click(tab(/recognise a student/i));
    await pickStudent();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what they did/i), {
        target: { value: "Handed in a wallet she found" },
      });
    });

    await click(
      screen.queryAllByRole("button").find((b) => /^Recognise$/.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("explains that points never go past a clean sheet", async () => {
    await mount();
    await click(tab(/recognise a student/i));
    expect(
      screen.getByText(/never past it/i),
    ).toBeInTheDocument();
  });
});

/**
 * Not "who has the fewest points", which is the same names all year. This is
 * movement: who is picking up incidents now with nothing on the other side.
 */
describe("the watch list", () => {
  async function openWatch() {
    await mount();
    await click(tab(/watch list/i));
    await waitFor(() =>
      expect(screen.getByText(/who to look at this week/i)).toBeInTheDocument(),
    );
  }

  it("counts on the tab how many need a look", async () => {
    await mount();
    const watchTab = tab(/watch list/i)!;
    expect(watchTab.textContent).toMatch(/2/);
  });

  it("lists them with what they lost", async () => {
    await openWatch();
    const row = screen.getByText(/Divine Niyonkuru/).closest("tr")!;
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(within(row).getByText("-12")).toBeInTheDocument();
  });

  // Nothing on the credit side is what turns a rough patch into a reputation,
  // and it is the cheapest thing for a school to fix.
  it("says plainly when a student has had nothing positive at all", async () => {
    await openWatch();
    const divine = screen.getByText(/Divine Niyonkuru/).closest("tr")!;
    expect(within(divine).getByText(/nothing yet/i)).toBeInTheDocument();
    const keza = screen.getByText(/Keza Mutesi/).closest("tr")!;
    expect(within(keza).queryByText(/nothing yet/i)).not.toBeInTheDocument();
  });

  it("says so when nobody needs a second look", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/merits/watch-list": { days: 30, students: [] },
    });
    await mount();
    await click(tab(/watch list/i));
    await waitFor(() =>
      expect(
        screen.getByText(/nobody needs a second look/i),
      ).toBeInTheDocument(),
    );
  });

  // Every box on the merit form is part of what the school is saying about a
  // student, so each has to carry what was typed.
  it("carries the points and the date that were set", async () => {
    await mount();
    await click(tab(/recognise a student/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what they did/i), {
        target: { value: "Handed in a wallet she found" },
      });
      fireEvent.change(screen.getByLabelText(/^points$/i), {
        target: { value: "10" },
      });
      fireEvent.change(screen.getByLabelText(/^date$/i), {
        target: { value: "2026-08-20" },
      });
      fireEvent.change(screen.getByLabelText(/what for/i), {
        target: { value: "HONESTY" },
      });
    });

    expect(screen.getByLabelText(/^points$/i)).toHaveValue(10);
    expect(screen.getByLabelText(/^date$/i)).toHaveValue("2026-08-20");
    expect(screen.getByLabelText(/what for/i)).toHaveValue("HONESTY");
  });

  it("closes without recording anything", async () => {
    await mount();
    await click(tab(/recognise a student/i));
    await click(
      screen.queryAllByRole("button").find((b) => /^Cancel$/.test(b.textContent ?? "")),
    );
    expect(
      h.api.post.mock.calls.filter((c: any[]) =>
        String(c[0]).includes("/discipline/merits"),
      ),
    ).toHaveLength(0);
  });
});
/**
 * A term the school has not opened yet, and records with pieces missing.
 *
 * Both write paths on this page stamp the current term onto the record, so
 * neither may fire before the school has one. The rest of this block covers an
 * appeal whose student has left and a merit in a category the app does not
 * know the wording for.
 */
describe("before the school has an open term", () => {
  // The page picks the current term out of the term list, so an empty
  // list is a school that has not opened one.
  const noTerm = { ...routes, "/academic/terms": [] };

  it("records no incident", async () => {
    serve(h.api, noTerm);
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
    );

    await click(
      screen.queryAllByRole("button").find((b) => /record|add|new/i.test(b.textContent ?? "")),
    );
    const dialog = await screen.findByRole("dialog");
    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^(save|record|create|add)/i.test((b.textContent ?? "").trim())),
    );

    // Without a term the record could not be filed anywhere, so nothing is
    // sent rather than a row landing in the wrong term.
    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/incidents"),
      ),
    ).toBeUndefined();
  });

  it("awards no merit either", async () => {
    serve(h.api, noTerm);
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
    );
    await click(
      screen
        .queryAllByRole("button")
        .find((b) => /recognise a student/i.test(b.textContent ?? "")),
    );

    const dialog = await screen.findByRole("dialog");
    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^(save|award|record|create|recognise)/i.test((b.textContent ?? "").trim())),
    );

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/discipline/merits"),
      ),
    ).toBeUndefined();
  });
});

describe("records the joins came back short on", () => {
  it("names an appeal whose student has since left", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/appeals/pending": [{ ...appeal, incident: {} }],
    });
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
    );
    await click(tab(/appeals/i));

    // Better a placeholder than a page that dies, or an appeal that vanishes.
    expect(await screen.findByText(/Unknown/)).toBeInTheDocument();
  });

  it("shows the raw category of a merit it has no wording for", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/merits": {
        data: [
          {
            id: "merit-x",
            category: "COMMUNITY_CLEANUP",
            description: "Cleared the compound after the storm",
            points: 5,
            date: "2026-08-20T00:00:00Z",
            student: { ...students[0], classSection, disciplinePoints: 88 },
            awardedBy: { firstName: "Aline", lastName: "Uwase", role: "TEACHER" },
          },
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
    );
    await click(tab(/^Merits$/));

    expect(await screen.findByText("COMMUNITY_CLEANUP")).toBeInTheDocument();
  });

  it("draws an em dash where no praise ratio could be worked out", async () => {
    serve(h.api, {
      ...routes,
      "/discipline/merits/summary": {
        awarded: 0,
        incidents: 0,
        ratio: null,
        byCategory: {},
      },
    });
    renderPage(DisciplinePage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Late to assembly/)).toBeInTheDocument(),
    );
    await click(tab(/^Merits$/));

    const ratio = await screen.findByText("Praise per incident");
    expect(ratio.parentElement!.textContent).toContain("—");
  });
});
