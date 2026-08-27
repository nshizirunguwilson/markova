import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() } };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { screen } from "@testing-library/react";

import { renderPage, serve, serveNever } from "@/test/page";
import NurseDashboard from "./page";

/** Captured from `GET /clinic/visits?inSickBay=true` on the running API. */
const visit = (over: Record<string, unknown> = {}) => ({
  id: "v-1",
  complaint: "Headache since morning",
  severity: "MINOR",
  temperature: 37.2,
  outcome: "RESTING_IN_SICK_BAY",
  visitedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
  dischargedAt: null,
  parentNotifiedAt: new Date().toISOString(),
  student: {
    id: "student-1",
    studentIdNumber: "STD-2026-001",
    isBoarder: true,
    user: { firstName: "Keza", lastName: "Mutesi" },
    classSection: { name: "A", classLevel: { name: "Senior 2" }, trade: null },
  },
  ...over,
});

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

const routes = {
  "/clinic/visits": { data: [visit()], meta: { total: 1 } },
  "/clinic/summary": summary,
};

const mount = () =>
  renderPage(NurseDashboard, { role: "NURSE", user: { firstName: "Claudine" } });

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  serve(h.api, routes);
});

/**
 * The nurse's ward. The same sick bay the boarding staff see, framed as
 * patients rather than as empty beds, plus the clinical picture they do not
 * get.
 */
describe("the nurse's dashboard", () => {
  it("greets her by name", async () => {
    mount();
    expect(await screen.findByText(/Good day, Claudine/)).toBeInTheDocument();
  });

  it("states the ward in a sentence before any number", async () => {
    mount();
    expect(
      await screen.findByText("1 student resting in the sick bay."),
    ).toBeInTheDocument();
  });

  it("says the sick bay is empty when it is", async () => {
    serve(h.api, { ...routes, "/clinic/visits": { data: [], meta: { total: 0 } } });
    mount();
    expect(await screen.findByText("The sick bay is empty.")).toBeInTheDocument();
  });

  // A serious case changes what the sentence needs to say.
  it("counts the serious ones separately", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/visits": {
        data: [visit(), visit({ id: "v-2", severity: "SERIOUS" })],
        meta: { total: 2 },
      },
    });
    mount();
    expect(
      await screen.findByText("2 resting, 1 of them serious."),
    ).toBeInTheDocument();
  });

  /**
   * A parent who has not been told is the one thing on this page that is
   * somebody's fault if it stays true, so it sits above the ward.
   */
  it("raises parents who have not been told", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/visits": {
        data: [visit({ parentNotifiedAt: null })],
        meta: { total: 1 },
      },
    });
    mount();
    const alert = await screen.findByRole("status");
    expect(alert.textContent).toContain("1 parent has not been told");
  });

  it("uses the plural for several", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/visits": {
        data: [
          visit({ parentNotifiedAt: null }),
          visit({ id: "v-2", parentNotifiedAt: null }),
        ],
        meta: { total: 2 },
      },
    });
    mount();
    expect((await screen.findByRole("status")).textContent).toContain(
      "2 parents have not been told",
    );
  });

  it("stays quiet when every parent has been told", async () => {
    mount();
    await screen.findByText("Keza Mutesi");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the month's clinical picture", async () => {
    mount();
    expect(await screen.findByText("85")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
  });

  it("shows the students who keep coming back", async () => {
    mount();
    expect(await screen.findByText("Elton Ishimwe")).toBeInTheDocument();
    expect(screen.getByText("3 visits")).toBeInTheDocument();
  });

  it("offers the clinic and her messages", async () => {
    mount();
    await screen.findByText("Keza Mutesi");
    expect(
      screen.getAllByRole("link", { name: /the clinic/i }).some(
        (l) => l.getAttribute("href") === "/admin/health",
      ),
    ).toBe(true);
    expect(screen.getByRole("link", { name: /messages/i })).toHaveAttribute(
      "href",
      "/messages",
    );
  });

  // She sees nothing academic, and asks for nothing academic.
  it("asks the API for nothing but the clinic", async () => {
    mount();
    await screen.findByText("Keza Mutesi");
    const asked = h.api.get.mock.calls.map((c) => String(c[0]));
    expect(asked.every((u) => u.includes("/clinic"))).toBe(true);
  });

  // A school with no clinic records yet still has to render.
  it("shows zeros rather than blanks on an empty summary", async () => {
    serve(h.api, { "/clinic/visits": { data: [] }, "/clinic/summary": {} });
    mount();
    expect(await screen.findByText("The sick bay is empty.")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("In the last 30 days")).toBeInTheDocument();
  });

  it("holds together while the ward is still loading", async () => {
    serveNever(h.api);
    mount();
    expect(await screen.findByText(/Checking the ward/)).toBeInTheDocument();
  });
});
