import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() } };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { screen, waitFor } from "@testing-library/react";

import { renderPage, serve, serveNever } from "@/test/page";
import BoardingDashboard, { frw, whenIs } from "./page";

/**
 * The shapes below were captured from the running API — `/clinic/visits`
 * answers `{ data, meta }`, `/clinic/summary` answers a flat object with
 * `repeatVisitors`, and `/pocket-money/overview` answers `{ items, totalHeld,
 * meta }` rather than a bare array.
 */
const restingVisit = {
  id: "v-1",
  complaint: "Toothache on the left side",
  severity: "MODERATE",
  temperature: 38.7,
  outcome: "RESTING_IN_SICK_BAY",
  visitedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  dischargedAt: null,
  parentNotifiedAt: null,
  student: {
    id: "student-1",
    studentIdNumber: "STD-2026-001",
    isBoarder: true,
    user: { firstName: "Keza", lastName: "Mutesi" },
    classSection: { name: "A", classLevel: { name: "Senior 2" }, trade: null },
  },
};

const summary = {
  days: 30,
  visits: 85,
  inSickBay: 1,
  referred: 7,
  dosesGiven: 32,
  repeatVisitors: [
    {
      id: "s-9",
      studentIdNumber: "STD-2025-050",
      visits: 3,
      user: { firstName: "Elton", lastName: "Ishimwe" },
      classSection: { name: "A" },
    },
  ],
};

const overview = {
  items: [
    { studentId: "s-1", name: "Aaron Cyusa", balance: 3700, isFrozen: false, hasAccount: true },
    { studentId: "s-2", name: "Aaron Hodari", balance: 0, isFrozen: true, hasAccount: true },
    { studentId: "s-3", name: "Linda Isano", balance: 0, isFrozen: false, hasAccount: true },
  ],
  totalHeld: 3_640_100,
  meta: { total: 806, page: 1, limit: 100, totalPages: 9 },
};

const activity = {
  id: "a-1",
  kind: "TRIP",
  title: "Visit to the Kigali Genocide Memorial",
  description: null,
  location: "Gisozi",
  startsAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
  endsAt: null,
  audience: "LEVELS",
  requiresConsent: true,
  tracksAttendance: true,
  capacity: null,
  isCancelled: false,
  cancelledReason: null,
};

const routes = {
  "/clinic/visits": { data: [restingVisit], meta: { total: 1 } },
  "/clinic/summary": summary,
  "/pocket-money/overview": overview,
  "/activities/upcoming": [activity],
};

function mount(role: "PATRON" | "MATRON" = "PATRON", firstName = "Emmanuel") {
  renderPage(BoardingDashboard, { role, user: { firstName } });
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  serve(h.api, routes);
});

describe("writing an amount of money", () => {
  it("says it in francs, grouped", () => {
    expect(frw(3_640_100)).toBe("RWF 3,640,100");
  });

  it("says nothing rather than NaN for a missing figure", () => {
    expect(frw(undefined)).toBe("RWF 0");
    expect(frw(null)).toBe("RWF 0");
    expect(frw(Number.NaN)).toBe("RWF 0");
  });
});

describe("saying when something happens", () => {
  const now = new Date("2026-08-27T09:00:00");

  it("says Today for today", () => {
    expect(whenIs("2026-08-27T14:00:00", now)).toMatch(/^Today, /);
  });

  it("says Tomorrow for tomorrow", () => {
    expect(whenIs("2026-08-28T07:00:00", now)).toMatch(/^Tomorrow, /);
  });

  it("names the weekday within the week", () => {
    expect(whenIs("2026-08-30T07:00:00", now)).toMatch(/^Sunday, /);
  });

  it("gives the date beyond that", () => {
    expect(whenIs("2026-10-02T07:00:00", now)).toMatch(/Oct/);
  });

  it("says nothing for a date it cannot read", () => {
    expect(whenIs("not a date", now)).toBe("");
  });
});

/**
 * A patron or matron opens this at the start of a shift. The question is
 * "what changed while I was off" — not a wall of statistics.
 */
describe("the boarding dashboard", () => {
  it("greets the person by name", async () => {
    mount();
    expect(await screen.findByText(/Good day, Emmanuel/)).toBeInTheDocument();
  });

  // The state of the school in a sentence, before any number.
  it("leads with who is in the sick bay", async () => {
    mount();
    expect(
      await screen.findByText("1 student is resting in the sick bay."),
    ).toBeInTheDocument();
  });

  it("names the student resting, with their class", async () => {
    mount();
    expect(await screen.findByText("Keza Mutesi")).toBeInTheDocument();
    expect(screen.getByText("Senior 2 A")).toBeInTheDocument();
  });

  it("says all is quiet on the matron's side when nobody is resting", async () => {
    serve(h.api, { ...routes, "/clinic/visits": { data: [], meta: { total: 0 } } });
    mount("MATRON", "Beatrice");
    expect(
      await screen.findByText(/All quiet on the girls' side/),
    ).toBeInTheDocument();
  });

  it("says the boys' side for a patron", async () => {
    serve(h.api, { ...routes, "/clinic/visits": { data: [], meta: { total: 0 } } });
    mount("PATRON");
    expect(await screen.findByText(/All quiet on the boys' side/)).toBeInTheDocument();
  });

  it("shows how much of the students' money it is holding", async () => {
    mount();
    expect(await screen.findByText("RWF 3,640,100")).toBeInTheDocument();
    expect(screen.getByText("Across 806 students")).toBeInTheDocument();
  });

  it("counts the frozen accounts and the empty ones", async () => {
    mount();
    // One frozen, and two accounts with nothing left in them.
    const label = await screen.findByText("Frozen accounts");
    const card = label.closest("div")!.parentElement!;
    await waitFor(() => expect(card.textContent).toContain("1"));
    expect(card.textContent).toContain("2 with nothing left");
  });

  it("lists what is coming up, and when", async () => {
    mount();
    expect(
      await screen.findByText(/Kigali Genocide Memorial/),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Tomorrow, /)).toBeInTheDocument();
  });

  it("flags an activity that needs a parent's consent", async () => {
    mount();
    expect(await screen.findByText(/Consent needed/)).toBeInTheDocument();
  });

  it("says so when nothing is scheduled", async () => {
    serve(h.api, { ...routes, "/activities/upcoming": [] });
    mount();
    expect(await screen.findByText("Nothing is scheduled yet.")).toBeInTheDocument();
  });

  it("shows the students who keep coming back to the clinic", async () => {
    mount();
    expect(await screen.findByText("Elton Ishimwe")).toBeInTheDocument();
    expect(screen.getByText("3 visits")).toBeInTheDocument();
  });

  it("offers the three places the work is actually done", async () => {
    mount();
    await screen.findByText("Keza Mutesi");
    for (const [name, href] of [
      [/pocket money/i, "/admin/pocket-money"],
      [/the clinic/i, "/admin/health"],
      [/activities/i, "/admin/activities"],
    ] as const) {
      expect(
        screen.getAllByRole("link", { name }).some((l) => l.getAttribute("href") === href),
      ).toBe(true);
    }
  });

  // Nothing academic. A matron has no business reading marks, and the API
  // refuses her anyway.
  it("asks for nothing academic", async () => {
    mount();
    await screen.findByText("Keza Mutesi");
    const asked = h.api.get.mock.calls.map((c) => String(c[0]));
    for (const forbidden of ["/marks", "/reports", "/analytics", "/users"]) {
      expect(asked.some((u) => u.includes(forbidden))).toBe(false);
    }
  });

  /**
   * The API can answer thinly — a school with no clinic records yet, an
   * activity nobody set a location for. A dashboard that only works on a full
   * response is a dashboard that breaks on day one of a new school.
   */
  it("says none were referred out when none were", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/summary": { ...summary, referred: 0 },
    });
    mount();
    expect(await screen.findByText("None referred out")).toBeInTheDocument();
  });

  it("says so when an activity has no location", async () => {
    serve(h.api, {
      ...routes,
      "/activities/upcoming": [
        { ...activity, location: null, requiresConsent: false },
      ],
    });
    mount();
    expect(await screen.findByText("No location set")).toBeInTheDocument();
  });

  it("draws a school with no records at all rather than blanks", async () => {
    serve(h.api, {
      "/clinic/visits": { data: [] },
      "/clinic/summary": {},
      "/pocket-money/overview": {},
      "/activities/upcoming": [],
    });
    mount();
    expect(await screen.findByText(/All quiet/)).toBeInTheDocument();
    expect(screen.getByText("RWF 0")).toBeInTheDocument();
    expect(screen.getByText("Across 0 students")).toBeInTheDocument();
    expect(screen.getByText("None on hold")).toBeInTheDocument();
  });

  it("uses the plural when several are resting", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/visits": {
        data: [restingVisit, { ...restingVisit, id: "v-2" }],
        meta: { total: 2 },
      },
    });
    mount();
    expect(
      await screen.findByText("2 students are resting in the sick bay."),
    ).toBeInTheDocument();
  });

  it("counts an account with no balance recorded as empty", async () => {
    serve(h.api, {
      ...routes,
      "/pocket-money/overview": {
        ...overview,
        items: [{ studentId: "s-1", name: "Keza", hasAccount: true }],
      },
    });
    mount();
    expect(await screen.findByText("1 with nothing left")).toBeInTheDocument();
  });

  it("names an activity that was saved without a title", async () => {
    serve(h.api, {
      ...routes,
      "/activities/upcoming": [{ ...activity, title: "" }],
    });
    mount();
    expect(await screen.findByText("Untitled")).toBeInTheDocument();
  });

  it("survives an activities endpoint that answers with nothing", async () => {
    serve(h.api, { ...routes, "/activities/upcoming": null });
    mount();
    expect(await screen.findByText("Nothing is scheduled yet.")).toBeInTheDocument();
  });

  it("holds together while everything is still loading", async () => {
    serveNever(h.api);
    mount();
    expect(await screen.findByText(/Checking on everyone/)).toBeInTheDocument();
  });
});
