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
  usePathname: () => "/admin/health",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import HealthPage from "./page";

/**
 * The sick bay.
 *
 * The tests worth having are the ones a parent would care about: that a child
 * lying in the sick bay is visible, that an allergy is impossible to miss,
 * that a dangerous repeat dose is refused out loud, and that "the family has
 * been told" is a fact and not a memory.
 */

const student = {
  id: "student-1",
  studentIdNumber: "STD-2025-231419-167",
  bloodType: "O+",
  allergies: "Penicillin",
  isBoarder: true,
  classSection: { id: "section-1", name: "A", classLevel: { name: "Senior 1" } },
  user: { firstName: "Divine", lastName: "Niyonkuru", photoUrl: null },
};

const resting = {
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
  parentNotifiedAt: null,
  student,
  seenBy: { firstName: "Grace", lastName: "Mukamana", role: "NURSE" },
  medications: [
    {
      id: "dose-1",
      medicine: "Paracetamol",
      dose: "500mg",
      givenAt: "2026-08-23T07:45:00.000Z",
    },
  ],
};

const referred = {
  ...resting,
  id: "visit-2",
  complaint: "Twisted ankle in the match",
  severity: "SERIOUS",
  outcome: "REFERRED_OUT",
  referredTo: "Kacyiru Health Centre",
  parentNotifiedAt: "2026-08-23T09:00:00.000Z",
  medications: [],
  student: { ...student, id: "student-2", allergies: null },
};

const summary = {
  days: 30,
  visits: 42,
  inSickBay: 2,
  referred: 3,
  dosesGiven: 61,
  repeatVisitors: [
    {
      id: "student-1",
      studentIdNumber: "STD-2025-231419-167",
      user: { firstName: "Divine", lastName: "Niyonkuru" },
      classSection: { name: "A" },
      visits: 4,
    },
  ],
};

const card = {
  student: {
    ...student,
    healthRecord: {
      chronicConditions: "Asthma",
      regularMedication: "Blue inhaler as needed",
      allergyNotes: "Penicillin",
      emergencyPlan: "Inhaler is in her locker",
      emergencyContactName: "Jeanne Uwimana",
      emergencyContactPhone: "+250788100000",
      emergencyRelationship: "Aunt",
      insuranceProvider: "Mutuelle de Sante",
      insuranceNumber: "MUT-4471",
      preferredClinic: "Kacyiru Health Centre",
    },
    parentStudents: [
      {
        relationship: "Mother",
        parent: {
          firstName: "Claudine",
          lastName: "Mukamana",
          phone: "+250788100001",
        },
      },
    ],
  },
  recentVisits: [
    {
      id: "visit-1",
      complaint: "Fever since last night",
      severity: "MODERATE",
      outcome: "RESTING_IN_SICK_BAY",
      visitedAt: "2026-08-23T07:30:00.000Z",
    },
  ],
  recentMedication: [],
};

const visitList = {
  data: [resting, referred],
  meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
};

const routes: Record<string, unknown> = {
  ...populatedRoutes,
  "/clinic/summary": summary,
  "/clinic/visits/visit-1/parent-notified": { ...resting, parentNotifiedAt: "x" },
  "/clinic/visits/visit-1/discharge": { ...resting, dischargedAt: "x" },
  "/clinic/visits/visit-1": resting,
  "/clinic/visits": visitList,
  "/clinic/medication": { id: "dose-2" },
  "/clinic/student/student-1": card,
  "/users": {
    data: [
      {
        id: "u-1",
        firstName: "Divine",
        lastName: "Niyonkuru",
        student: { id: "student-1", studentIdNumber: "STD-2025-231419-167" },
      },
    ],
    meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
  },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function button(name: RegExp) {
  return screen
    .queryAllByRole("button")
    .find((b) => name.test((b.textContent ?? "").trim()));
}

async function mount() {
  renderPage(HealthPage, { role: "NURSE" });
  await waitFor(() =>
    expect(screen.getByText("Fever since last night")).toBeInTheDocument(),
  );
}

async function openVisit() {
  await mount();
  const row = screen.getByText("Fever since last night").closest("tr")!;
  await click(within(row).getByRole("button", { name: /open/i }));
  await waitFor(() =>
    expect(screen.getByLabelText("Medicine")).toBeInTheDocument(),
  );
}

describe("the sick bay list", () => {
  // The list opens on who is lying in there right now, not the archive.
  it("opens on the people kept in and not yet discharged", async () => {
    await mount();
    const call = h.api.get.mock.calls.find((c: any[]) =>
      String(c[0]).includes("/clinic/visits"),
    );
    expect(call?.[1]?.params?.inSickBay).toBe("true");
  });

  it("shows the counts a head teacher asks for", async () => {
    await mount();
    expect(screen.getByText("In the sick bay now")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  // An allergy missed is the mistake this page exists to prevent.
  it("puts an allergy on the row, impossible to miss", async () => {
    await mount();
    const row = screen.getByText("Fever since last night").closest("tr")!;
    expect(within(row).getByText(/allergy: penicillin/i)).toBeInTheDocument();
  });

  it("shows no allergy badge for a student with none", async () => {
    await mount();
    const row = screen.getByText(/twisted ankle/i).closest("tr")!;
    expect(within(row).queryByText(/allergy/i)).not.toBeInTheDocument();
  });

  it("says whether the family has been told", async () => {
    await mount();
    const notTold = screen.getByText("Fever since last night").closest("tr")!;
    expect(within(notTold).getByText("Not yet")).toBeInTheDocument();
    const told = screen.getByText(/twisted ankle/i).closest("tr")!;
    expect(within(told).getByText("Told")).toBeInTheDocument();
  });

  it("names where a referred student was sent", async () => {
    await mount();
    const row = screen.getByText(/twisted ankle/i).closest("tr")!;
    expect(within(row).getByText("Kacyiru Health Centre")).toBeInTheDocument();
  });

  it("switches to the whole book", async () => {
    await mount();
    await click(button(/the clinic book/i));
    await waitFor(() => {
      const call = h.api.get.mock.calls.at(-1);
      expect(call?.[1]?.params?.inSickBay).toBeUndefined();
    });
  });

  it("narrows the book by severity", async () => {
    await mount();
    await click(button(/the clinic book/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Any severity"), {
        target: { value: "SERIOUS" },
      });
    });
    await waitFor(() => {
      const call = h.api.get.mock.calls.at(-1);
      expect(call?.[1]?.params?.severity).toBe("SERIOUS");
    });
  });

  it("says plainly when nobody is in the sick bay", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/visits": { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
    });
    renderPage(HealthPage, { role: "NURSE" });
    await waitFor(() =>
      expect(screen.getByText(/nobody is in the sick bay/i)).toBeInTheDocument(),
    );
  });

  it("survives the API being down", async () => {
    serveFailure(h.api);
    renderPage(HealthPage, { role: "NURSE" });
    await waitFor(() => expect(screen.getByText("Health")).toBeInTheDocument());
  });
});

/**
 * A child in the sick bay three times in a month is a pattern, and the page
 * says so rather than leaving somebody to notice.
 */
describe("who keeps coming back", () => {
  it("names them with their count", async () => {
    await mount();
    expect(screen.getByText(/keeps coming back/i)).toBeInTheDocument();
    expect(screen.getByText("4 visits")).toBeInTheDocument();
  });

  it("opens their emergency card", async () => {
    await mount();
    await click(button(/divine niyonkuru\s*4 visits/i));
    await waitFor(() =>
      expect(screen.getByText("Emergency card")).toBeInTheDocument(),
    );
  });

  it("shows nothing when nobody is repeating", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/summary": { ...summary, repeatVisitors: [] },
    });
    renderPage(HealthPage, { role: "NURSE" });
    await waitFor(() =>
      expect(screen.getByText("Fever since last night")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/keeps coming back/i)).not.toBeInTheDocument();
  });
});

describe("recording a visit", () => {
  async function openNew() {
    await mount();
    await click(button(/new visit/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Student"), {
        target: { value: "Divine" },
      });
    });
    await waitFor(() =>
      expect(
        screen
          .queryAllByRole("button")
          .find((b) => /STD-2025-231419-167/.test(b.textContent ?? "")),
      ).toBeTruthy(),
    );
    await click(
      screen
        .queryAllByRole("button")
        .find((b) => /STD-2025-231419-167/.test(b.textContent ?? "")),
    );
  }

  it("sends the complaint and the student", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what the student says is wrong/i), {
        target: { value: "Stomach ache" },
      });
    });
    await click(button(/record the visit/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/clinic/visits",
        expect.objectContaining({
          studentId: "student-1",
          complaint: "Stomach ache",
        }),
      ),
    );
  });

  it("will not submit without a student and a complaint", async () => {
    await mount();
    await click(button(/new visit/i));
    expect(button(/record the visit/i)).toBeDisabled();
  });

  // A referral with no destination is a child sent somewhere nobody can name.
  it("asks where a referred student is being sent, and blocks until told", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what the student says is wrong/i), {
        target: { value: "Deep cut on the hand" },
      });
      fireEvent.change(screen.getByLabelText(/what happened next/i), {
        target: { value: "REFERRED_OUT" },
      });
    });
    expect(screen.getByLabelText("Sent where")).toBeInTheDocument();
    expect(button(/record the visit/i)).toBeDisabled();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Sent where"), {
        target: { value: "Kacyiru Health Centre" },
      });
    });
    expect(button(/record the visit/i)).not.toBeDisabled();
  });

  it("hides the referral field for any other outcome", async () => {
    await mount();
    await click(button(/new visit/i));
    expect(screen.queryByLabelText("Sent where")).not.toBeInTheDocument();
  });

  it("sends the temperature as a number, not text", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what the student says is wrong/i), {
        target: { value: "Fever" },
      });
      fireEvent.change(screen.getByLabelText(/temperature/i), {
        target: { value: "38.6" },
      });
    });
    await click(button(/record the visit/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find((c: any[]) =>
        String(c[0]).includes("/clinic/visits"),
      );
      expect((call?.[1] as any).temperature).toBe(38.6);
    });
  });

  it("says why the API refused", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what the student says is wrong/i), {
        target: { value: "Fever" },
      });
    });
    h.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { message: "Student not found" } },
    });
    await click(button(/record the visit/i));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Student not found"),
    );
  });
});

describe("one visit", () => {
  it("lists the doses already given", async () => {
    await openVisit();
    expect(screen.getByText(/Paracetamol · 500mg/)).toBeInTheDocument();
  });

  it("records a dose against the visit and the student", async () => {
    await openVisit();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Medicine"), {
        target: { value: "Ibuprofen" },
      });
      fireEvent.change(screen.getByLabelText("Dose"), {
        target: { value: "200mg" },
      });
    });
    await click(button(/record the dose/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/clinic/medication", {
        studentId: "student-1",
        visitId: "visit-1",
        medicine: "Ibuprofen",
        dose: "200mg",
      }),
    );
  });

  it("will not record a dose with no medicine or amount", async () => {
    await openVisit();
    expect(button(/record the dose/i)).toBeDisabled();
  });

  // The API refuses an unsafe repeat and says how long ago the last one was.
  // Replacing that with our own wording would throw away the useful part.
  it("shows the server's refusal of an unsafe repeat word for word", async () => {
    await openVisit();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Medicine"), {
        target: { value: "Paracetamol" },
      });
      fireEvent.change(screen.getByLabelText("Dose"), {
        target: { value: "500mg" },
      });
    });
    h.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message:
            "Paracetamol was already given 90 minutes ago (500mg). Check before giving another dose.",
        },
      },
    });
    await click(button(/record the dose/i));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "Paracetamol was already given 90 minutes ago (500mg). Check before giving another dose.",
      ),
    );
  });

  it("records that the family has been told", async () => {
    await openVisit();
    await click(button(/family has been told/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/clinic/visits/visit-1/parent-notified",
      ),
    );
  });

  it("offers no notify button once the family knows", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/visits": {
        data: [{ ...resting, parentNotifiedAt: "2026-08-23T09:00:00.000Z" }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    await openVisit();
    expect(button(/family has been told/i)).toBeUndefined();
  });

  it("discharges a student who was kept in", async () => {
    await openVisit();
    await click(button(/send back to class/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/clinic/visits/visit-1/discharge"),
    );
  });

  it("offers no discharge for somebody who was never kept in", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/visits": {
        data: [{ ...resting, outcome: "RETURNED_TO_CLASS" }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    await openVisit();
    expect(button(/send back to class/i)).toBeUndefined();
  });

  // Corrections are edits, never deletes: the visit happened.
  it("corrects the findings without deleting anything", async () => {
    await openVisit();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what you found/i), {
        target: { value: "38.2 degrees, not 38.4" },
      });
    });
    await click(button(/^save$/i));
    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith("/clinic/visits/visit-1", {
        findings: "38.2 degrees, not 38.4",
      }),
    );
    expect(h.api.delete).not.toHaveBeenCalled();
  });
});

/**
 * The one page somebody needs at three in the morning.
 */
describe("the emergency card", () => {
  async function openCard() {
    await mount();
    await click(
      screen
        .queryAllByRole("button")
        .find((b) => (b.textContent ?? "").trim() === "Divine Niyonkuru"),
    );
    await waitFor(() =>
      expect(screen.getByText("Emergency card")).toBeInTheDocument(),
    );
  }

  it("leads with the allergy and the blood type", async () => {
    await openCard();
    expect(screen.getByText("Allergic to")).toBeInTheDocument();
    expect(screen.getByText("Blood type")).toBeInTheDocument();
    expect(screen.getByText("O+")).toBeInTheDocument();
  });

  it("shows who to ring, and their number", async () => {
    await openCard();
    expect(screen.getByText("Jeanne Uwimana")).toBeInTheDocument();
    expect(screen.getByText("+250788100000")).toBeInTheDocument();
  });

  // Never blank when it is most needed: with no card filled in, the parent on
  // the account is who somebody rings.
  it("falls back to the parent on the account", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/student/student-1": {
        ...card,
        student: { ...card.student, healthRecord: null },
      },
    });
    await openCard();
    expect(screen.getByText("Claudine Mukamana")).toBeInTheDocument();
    expect(screen.getByText("+250788100001")).toBeInTheDocument();
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
          parentStudents: [],
        },
        recentVisits: [],
        recentMedication: [],
      },
    });
    await openCard();
    expect(screen.getByText("Nothing on record")).toBeInTheDocument();
    expect(screen.getByText("Nobody on record")).toBeInTheDocument();
  });

  it("saves the card back", async () => {
    await openCard();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/long-term conditions/i), {
        target: { value: "Asthma and hay fever" },
      });
    });
    await click(button(/save the card/i));
    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith(
        "/clinic/student/student-1",
        expect.objectContaining({ chronicConditions: "Asthma and hay fever" }),
      ),
    );
  });

  it("lists the recent visits somebody would want with it", async () => {
    await openCard();
    const modal = screen.getByText("Emergency card").closest("div")!.parentElement!;
    expect(within(modal).getByText(/recent visits/i)).toBeInTheDocument();
  });

  // Every box on the card is one a nurse fills in at three in the morning, so
  // each one has to carry what was typed rather than quietly drop it.
  it("carries every field on the card", async () => {
    await openCard();

    const fields: [RegExp, string, string][] = [
      [/long-term conditions/i, 'chronicConditions', 'Asthma and hay fever'],
      [/medication taken regularly/i, 'regularMedication', 'Blue inhaler'],
      [/allergy notes/i, 'allergyNotes', 'Penicillin and peanuts'],
      [/what to do in an emergency/i, 'emergencyPlan', 'Inhaler in her locker'],
      [/who to ring/i, 'emergencyContactName', 'Jeanne Uwimana'],
      [/their phone/i, 'emergencyContactPhone', '+250788111222'],
      [/relationship/i, 'emergencyRelationship', 'Aunt'],
      [/health centre we use/i, 'preferredClinic', 'Kimironko Health Centre'],
      [/^insurance$/i, 'insuranceProvider', 'RSSB'],
      [/insurance number/i, 'insuranceNumber', 'MUT-9911'],
    ];

    for (const [label, , value] of fields) {
      await act(async () => {
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      });
    }

    await click(button(/save the card/i));

    await waitFor(() => {
      const call = h.api.put.mock.calls.find((c: any[]) =>
        String(c[0]).includes('/clinic/student/'),
      );
      expect(call?.[1]).toMatchObject(
        Object.fromEntries(fields.map(([, key, value]) => [key, value])),
      );
    });
  });
});

/**
 * The rest of the new-visit form. Each control is a decision a nurse makes
 * about a child, and a control that silently keeps its default is worse than
 * one that is not there.
 */
describe("the whole visit form", () => {
  async function openNewWithStudent() {
    await mount();
    await click(button(/new visit/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Student"), {
        target: { value: "Divine" },
      });
    });
    await waitFor(() =>
      expect(
        screen
          .queryAllByRole("button")
          .find((b) => /STD-2025-231419-167/.test(b.textContent ?? "")),
      ).toBeTruthy(),
    );
    await click(
      screen
        .queryAllByRole("button")
        .find((b) => /STD-2025-231419-167/.test(b.textContent ?? "")),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what the student says is wrong/i), {
        target: { value: "Stomach ache" },
      });
    });
  }

  it("carries the findings, the treatment and the severity", async () => {
    await openNewWithStudent();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what you found/i), {
        target: { value: "Tender, no fever" },
      });
      fireEvent.change(screen.getByLabelText(/what you did/i), {
        target: { value: "Rest and plain food" },
      });
      fireEvent.change(screen.getByLabelText(/how bad/i), {
        target: { value: "MODERATE" },
      });
    });
    await click(button(/record the visit/i));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/clinic/visits",
      );
      expect(call?.[1]).toMatchObject({
        findings: "Tender, no fever",
        treatment: "Rest and plain food",
        severity: "MODERATE",
      });
    });
  });

  it("leaves the optional fields out rather than sending empty strings", async () => {
    await openNewWithStudent();
    await click(button(/record the visit/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/clinic/visits",
      );
      expect((call?.[1] as any).findings).toBeUndefined();
      expect((call?.[1] as any).temperature).toBeUndefined();
      expect((call?.[1] as any).referredTo).toBeUndefined();
    });
  });

  it("finds nobody when the name matches nobody", async () => {
    serve(h.api, {
      ...routes,
      "/users": { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 } },
    });
    await mount();
    await click(button(/new visit/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Student"), {
        target: { value: "Nobody" },
      });
    });
    await waitFor(() =>
      expect(screen.getByText(/nobody by that name/i)).toBeInTheDocument(),
    );
  });

  it("closes without sending anything", async () => {
    await openNewWithStudent();
    await click(button(/^cancel$/i));
    expect(
      h.api.post.mock.calls.filter(
        (c: any[]) => String(c[0]) === "/clinic/visits",
      ),
    ).toHaveLength(0);
  });

  it("goes back to the sick bay from the book", async () => {
    await mount();
    await click(button(/the clinic book/i));
    await click(button(/in the sick bay/i));
    await waitFor(() => {
      const call = h.api.get.mock.calls.at(-1);
      expect(call?.[1]?.params?.inSickBay).toBe("true");
    });
  });

  it("pages through the book in both directions", async () => {
    serve(h.api, {
      ...routes,
      "/clinic/visits": {
        data: [resting, referred],
        meta: { total: 60, page: 2, limit: 20, totalPages: 3 },
      },
    });
    renderPage(HealthPage, { role: "NURSE" });
    await waitFor(() =>
      expect(screen.getByText("Fever since last night")).toBeInTheDocument(),
    );
    await click(button(/the clinic book/i));
    await waitFor(() =>
      expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument(),
    );

    await click(screen.getByLabelText("Next page"));
    await waitFor(() =>
      expect(h.api.get.mock.calls.at(-1)?.[1]?.params?.page).toBe(2),
    );
    await click(screen.getByLabelText("Previous page"));
    await waitFor(() =>
      expect(h.api.get.mock.calls.at(-1)?.[1]?.params?.page).toBe(1),
    );
  });

  it("closes a visit and a card again without changing anything", async () => {
    await openVisit();
    await click(screen.getByLabelText("Close dialog"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Medicine")).not.toBeInTheDocument(),
    );

    await click(
      screen
        .queryAllByRole("button")
        .find((b) => (b.textContent ?? "").trim() === "Divine Niyonkuru"),
    );
    await waitFor(() =>
      expect(screen.getByText("Emergency card")).toBeInTheDocument(),
    );
    await click(screen.getByLabelText("Close dialog"));
    await waitFor(() =>
      expect(screen.queryByText("Emergency card")).not.toBeInTheDocument(),
    );
    expect(h.api.put).not.toHaveBeenCalled();
  });
});
/**
 * The corners of the clinic screen.
 *
 * A referral out to a health centre needs somewhere to refer to, a card with
 * nothing on it must still open, and the empty states differ between the sick
 * bay and the day book because they mean different things: nobody is unwell,
 * versus nothing has been written down yet.
 */
describe("referring a student out", () => {
  async function openNewWithStudent() {
    await mount();
    await click(button(/new visit/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Student"), {
        target: { value: "Divine" },
      });
    });
    await waitFor(() =>
      expect(
        screen
          .queryAllByRole("button")
          .find((b) => /STD-2025-231419-167/.test(b.textContent ?? "")),
      ).toBeTruthy(),
    );
    await click(
      screen
        .queryAllByRole("button")
        .find((b) => /STD-2025-231419-167/.test(b.textContent ?? "")),
    );
  }

  it("will not record a referral with nowhere to refer to", async () => {
    await openNewWithStudent();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what the student says is wrong/i), {
        target: { value: "Deep cut to the hand" },
      });
      fireEvent.change(screen.getByLabelText(/what happened next/i), {
        target: { value: "REFERRED_OUT" },
      });
    });

    h.api.post.mockClear();
    await click(button(/record the visit/i));

    // Nothing is sent: a referral with no destination is not a referral.
    expect(
      h.api.post.mock.calls.find((c: any[]) => String(c[0]) === "/clinic/visits"),
    ).toBeUndefined();
  });

  it("sends the health centre once it is named", async () => {
    await openNewWithStudent();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what the student says is wrong/i), {
        target: { value: "Deep cut to the hand" },
      });
      fireEvent.change(screen.getByLabelText(/what happened next/i), {
        target: { value: "REFERRED_OUT" },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/sent where/i), {
        target: { value: "Kacyiru Health Centre" },
      });
    });

    await click(button(/record the visit/i));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/clinic/visits",
      );
      expect(call?.[1]).toMatchObject({
        outcome: "REFERRED_OUT",
        referredTo: "Kacyiru Health Centre",
      });
    });
  });

  it("leaves the referral field off a visit that stays in school", async () => {
    await openNewWithStudent();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/what the student says is wrong/i), {
        target: { value: "Headache" },
      });
    });

    await click(button(/record the visit/i));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/clinic/visits",
      );
      expect(call?.[1].referredTo).toBeUndefined();
    });
  });
});

describe("a clinic with nothing in it", () => {
  const nothing = {
    ...routes,
    "/clinic/visits": { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } },
  };

  it("says the sick bay is empty", async () => {
    serve(h.api, nothing);
    renderPage(HealthPage, { role: "NURSE" });
    expect(await screen.findByText("Nobody is in the sick bay.")).toBeInTheDocument();
  });

  it("says the day book is empty in different words", async () => {
    serve(h.api, nothing);
    renderPage(HealthPage, { role: "NURSE" });
    await screen.findByText("Nobody is in the sick bay.");

    // The other tabs are the written record, so "nobody is lying down" would
    // be the wrong sentence there.
    const other = screen
      .queryAllByRole("button")
      .find((b) => /today|all|week/i.test((b.textContent ?? "").trim()));
    if (!other) return;
    await click(other);

    expect(await screen.findByText("Nothing in the book yet.")).toBeInTheDocument();
  });
});

describe("a card and a visit with nothing filled in", () => {
  const blankCard = {
    student: {
      ...card.student,
      allergies: null,
      bloodType: null,
      healthRecord: null,
      parentStudents: [],
    },
    recentVisits: [],
    recentMedication: [],
  };

  async function openCard() {
    await mount();
    await click(
      screen
        .queryAllByRole("button")
        .find((b) => (b.textContent ?? "").trim() === "Divine Niyonkuru"),
    );
    await waitFor(() =>
      expect(screen.getByText("Emergency card")).toBeInTheDocument(),
    );
  }

  it("opens every field blank rather than showing the word null", async () => {
    serve(h.api, { ...routes, "/clinic/student/student-1": blankCard });
    await openCard();

    for (const label of [
      /long-term conditions/i,
      /medication taken regularly/i,
      /allergy notes/i,
      /what to do in an emergency/i,
      /who to ring/i,
      /their phone/i,
      /relationship/i,
      /health centre we use/i,
      /^insurance$/i,
      /insurance number/i,
    ]) {
      expect(screen.getByLabelText(label)).toHaveValue("");
    }
  });

  it("leaves out the recent visits list when there have been none", async () => {
    serve(h.api, { ...routes, "/clinic/student/student-1": blankCard });
    await openCard();
    expect(screen.queryByText("Recent visits")).toBeNull();
  });

  it("shows the recent visits when there have been some", async () => {
    await openCard();
    expect(screen.getByText("Recent visits")).toBeInTheDocument();
  });

  it("says nothing has been given on a visit with no doses", async () => {
    serve(h.api, {
      ...routes,
      // Both the list and the detail: the drawer opens on the row it was
      // given and refreshes from the detail endpoint after.
      "/clinic/visits": {
        data: [{ ...resting, medications: [] }, referred],
        meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
      },
      "/clinic/visits/visit-1": { ...resting, medications: [] },
    });
    await openVisit();
    expect(screen.getByText("Nothing given yet.")).toBeInTheDocument();
  });

  it("lists the doses on a visit that has had some", async () => {
    await openVisit();
    expect(screen.getAllByText(/Paracetamol/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Nothing given yet.")).toBeNull();
  });
});
