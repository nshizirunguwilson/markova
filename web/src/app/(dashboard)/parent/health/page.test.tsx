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
  usePathname: () => "/parent/health",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import ParentHealthPage from "./page";

/**
 * A parent's view of the sick bay.
 *
 * Read-only on purpose: the record is the school's clinical note. What these
 * tests protect is that a parent can see it at all, and that the page never
 * offers them a way to change it.
 */

const card = {
  student: {
    id: "student-1",
    studentIdNumber: "STD-2025-231419-167",
    bloodType: "O+",
    allergies: "Penicillin",
    isBoarder: true,
    classSection: { name: "A", classLevel: { name: "Senior 1" } },
    user: { firstName: "Divine", lastName: "Niyonkuru", photoUrl: null },
    healthRecord: {
      chronicConditions: "Asthma",
      allergyNotes: "Penicillin",
      emergencyContactName: "Jeanne Uwimana",
      emergencyContactPhone: "+250788100000",
      emergencyRelationship: "Aunt",
    },
    parentStudents: [],
  },
  recentVisits: [],
  recentMedication: [],
};

const visits = {
  data: [
    {
      id: "visit-1",
      complaint: "Fever since last night",
      findings: "38.4 degrees",
      treatment: "Paracetamol and fluids",
      severity: "MODERATE",
      outcome: "RESTING_IN_SICK_BAY",
      temperature: 38.4,
      referredTo: null,
      visitedAt: "2026-08-23T07:30:00.000Z",
      dischargedAt: null,
      parentNotifiedAt: "2026-08-23T08:00:00.000Z",
      student: card.student,
      seenBy: { firstName: "Grace", lastName: "Mukamana", role: "NURSE" },
      medications: [],
    },
  ],
  meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
};

const doses = [
  {
    id: "dose-1",
    medicine: "Paracetamol",
    dose: "500mg",
    reason: "Fever",
    givenAt: "2026-08-23T07:45:00.000Z",
    givenBy: { firstName: "Grace", lastName: "Mukamana" },
  },
];

const parentUser = {
  id: "user-1",
  parentStudents: [
    {
      student: {
        id: "student-1",
        studentIdNumber: "STD-2025-231419-167",
        classSection: { name: "A" },
        user: { firstName: "Divine", lastName: "Niyonkuru" },
      },
    },
  ],
};

const twoChildren = {
  ...parentUser,
  parentStudents: [
    ...parentUser.parentStudents,
    {
      student: {
        id: "student-2",
        studentIdNumber: "STD-2025-231419-168",
        classSection: { name: "B" },
        user: { firstName: "Keza", lastName: "Mutesi" },
      },
    },
  ],
};

const routes: Record<string, unknown> = {
  ...populatedRoutes,
  "/clinic/student/student-1/medication": doses,
  "/clinic/student/student-1/visits": visits,
  "/clinic/student/student-1": card,
  "/clinic/student/student-2/medication": [],
  "/clinic/student/student-2/visits": { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
  "/clinic/student/student-2": { ...card, student: { ...card.student, id: "student-2" } },
  "/users/user-1": parentUser,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(ParentHealthPage, { role: "PARENT", user: { id: "user-1" } });
  await waitFor(() =>
    expect(screen.getByText("Fever since last night")).toBeInTheDocument(),
  );
}

describe("what a parent can see", () => {
  it("loads the first child without being asked", async () => {
    await mount();
    expect(h.api.get).toHaveBeenCalledWith("/clinic/student/student-1");
  });

  it("leads with the allergy and the blood type", async () => {
    await mount();
    expect(screen.getByText("Allergic to")).toBeInTheDocument();
    expect(screen.getAllByText("Penicillin").length).toBeGreaterThan(0);
    expect(screen.getByText("O+")).toBeInTheDocument();
  });

  it("names the long-term condition on record", async () => {
    await mount();
    expect(screen.getByText("Asthma")).toBeInTheDocument();
  });

  it("shows who the school rings first", async () => {
    await mount();
    expect(screen.getByText(/Jeanne Uwimana/)).toBeInTheDocument();
    expect(screen.getByText("+250788100000")).toBeInTheDocument();
  });

  // The thing a parent was never given before: knowing at all.
  it("lists each visit with what was done", async () => {
    await mount();
    expect(screen.getByText(/Paracetamol and fluids/)).toBeInTheDocument();
    expect(screen.getByText(/Rested in the sick bay/)).toBeInTheDocument();
    expect(screen.getAllByText(/Grace Mukamana/).length).toBeGreaterThan(0);
  });

  it("lists every dose given at school", async () => {
    await mount();
    expect(screen.getByText("Paracetamol")).toBeInTheDocument();
    expect(screen.getByText(/500mg/)).toBeInTheDocument();
  });

  it("says so when their child has never been to the sick bay", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/student/student-1/visits": {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(ParentHealthPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText(/has not been to the sick bay/i)).toBeInTheDocument(),
    );
  });

  it("says so when nothing has been given", async () => {
    serve(h.api, { ...routes, "/clinic/student/student-1/medication": [] });
    renderPage(ParentHealthPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText(/nothing has been given/i)).toBeInTheDocument(),
    );
  });

  it("says so when nothing is on record at all", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/student/student-1": {
        student: {
          ...card.student,
          allergies: null,
          bloodType: null,
          healthRecord: null,
        },
        recentVisits: [],
        recentMedication: [],
      },
    });
    await mount();
    expect(screen.getByText("Nothing on record")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText("None recorded")).toBeInTheDocument();
  });

  // The record is the school's clinical note. A parent editing it would make
  // it worthless as evidence.
  it("offers no way to change anything", async () => {
    await mount();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(
      screen
        .queryAllByRole("button")
        .filter((b) => /save|record|edit|discharge/i.test(b.textContent ?? "")),
    ).toHaveLength(0);
  });

  it("survives the API being down", async () => {
    serveFailure(h.api);
    renderPage(ParentHealthPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText("Health")).toBeInTheDocument());
  });
});

describe("more than one child", () => {
  it("offers no chooser to a parent with one child", async () => {
    await mount();
    expect(screen.queryByLabelText("Child")).not.toBeInTheDocument();
  });

  it("switches which child is shown", async () => {
    serve(h.api, { ...routes, "/users/user-1": twoChildren });
    renderPage(ParentHealthPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByLabelText("Child")).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Child"), {
        target: { value: "student-2" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith("/clinic/student/student-2"),
    );
  });
});

/**
 * A visit that ended at a health centre.
 *
 * Where the school sent a child is the single most important line on this
 * page: it is what a parent needs before they set off looking for them.
 */
describe("a child who was sent out to a health centre", () => {
  it("says where they were sent", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/student/student-1/visits": {
        data: [
          {
            ...visits.data[0],
            id: "visit-9",
            complaint: "Deep cut to the hand",
            outcome: "REFERRED_OUT",
            referredTo: "Kacyiru Health Centre",
          },
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(ParentHealthPage, { role: "PARENT", user: { id: "user-1" } });

    await waitFor(() =>
      expect(screen.getByText("Deep cut to the hand")).toBeInTheDocument(),
    );
    expect(screen.getByText("Kacyiru Health Centre")).toBeInTheDocument();
  });

  it("says nothing of the sort about a visit that stayed in school", async () => {
    await mount();
    expect(screen.queryByText(/Sent to:/)).toBeNull();
  });
});

/** An adult child may keep their health visits from their parents (A8). */
describe("the health page for an adult child who keeps it private", () => {
  it("says so calmly instead of an empty record", async () => {
    const kept = () => {
      throw Object.assign(new Error("Forbidden"), {
        response: {
          status: 403,
          data: { reason: "KEPT_PRIVATE", message: "Divine has chosen to keep their health visits private." },
        },
      });
    };
    serve(h.api, {
      ...routes,
      "/clinic/student/student-1/medication": kept,
      "/clinic/student/student-1/visits": kept,
      "/clinic/student/student-1": kept,
    });
    renderPage(ParentHealthPage, { role: "PARENT", user: { id: "user-1" } });
    expect(await screen.findByTestId("kept-private", {}, { timeout: 8000 })).toHaveTextContent(
      "Divine has chosen to keep their health visits private.",
    );
    expect(screen.queryByText(/Allergic to/)).toBeNull();
  });
});
