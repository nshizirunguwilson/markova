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
  usePathname: () => "/admin/activities",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, populatedRoutes } from "@/test/fixtures";

import ActivitiesPage from "./page";

/**
 * The school calendar.
 *
 * A trip is thirty children on a bus leaving the premises, so what these tests
 * protect is the safeguarding path: who is on the list, who has answered, and
 * that calling something off tells families why instead of making it vanish.
 */

const trip = {
  id: "act-1",
  kind: "TRIP",
  title: "Nyungwe forest trip",
  description: "Senior 2 biology field trip",
  location: "Nyungwe National Park",
  startsAt: "2026-09-10T07:00:00.000Z",
  endsAt: "2026-09-10T18:00:00.000Z",
  audience: "LEVELS",
  requiresConsent: true,
  tracksAttendance: true,
  capacity: 30,
  isCancelled: false,
  cancelledReason: null,
  classLevels: [{ classLevel: { id: "level-1", name: "Senior 2" } }],
  sections: [],
  _count: { participants: 2 },
};

const club = {
  id: "act-2",
  kind: "CLUB",
  title: "Debate club",
  description: null,
  location: "Room 4",
  startsAt: "2026-09-04T15:30:00.000Z",
  endsAt: null,
  audience: "WHOLE_SCHOOL",
  requiresConsent: false,
  tracksAttendance: true,
  capacity: null,
  isCancelled: false,
  cancelledReason: null,
  classLevels: [],
  sections: [],
  _count: { participants: 14 },
};

const cancelled = {
  ...club,
  id: "act-3",
  title: "Swimming gala",
  kind: "SPORT",
  isCancelled: true,
  cancelledReason: "The pool is closed for repairs",
  _count: { participants: 0 },
};

const participants = [
  {
    id: "p-1",
    consent: "GIVEN",
    attended: true,
    student: {
      id: "student-1",
      studentIdNumber: "STD-2025-231419-167",
      user: { firstName: "Divine", lastName: "Niyonkuru" },
    },
  },
  {
    id: "p-2",
    consent: "PENDING",
    attended: null,
    student: {
      id: "student-2",
      studentIdNumber: "STD-2025-231419-168",
      user: { firstName: "Keza", lastName: "Mutesi" },
    },
  },
];

const detail = { ...trip, participants };

const consentSummary = {
  given: [participants[0]],
  refused: [],
  pending: [participants[1]],
};

const list = {
  data: [trip, club],
  meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
};

const routes: Record<string, unknown> = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/activities/act-1/consent": consentSummary,
  "/activities/act-1/participants/class": { added: 3 },
  "/activities/act-1/participants": { id: "p-3" },
  "/activities/act-1/attendance": { marked: 1 },
  "/activities/act-1/cancel": { ...trip, isCancelled: true },
  "/activities/act-1": detail,
  "/activities": list,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(ActivitiesPage, { role: "ADMIN" });
  await waitFor(() =>
    expect(screen.getByText("Nyungwe forest trip")).toBeInTheDocument(),
  );
}

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

async function openDetail() {
  await mount();
  const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
  await click(within(row).getByRole("button", { name: /open/i }));
  await waitFor(() =>
    expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument(),
  );
}

describe("the calendar", () => {
  it("lists what is coming up", async () => {
    await mount();
    expect(screen.getByText("Debate club")).toBeInTheDocument();
    expect(screen.getByText(/Nyungwe National Park/)).toBeInTheDocument();
  });

  // A calendar is about what is ahead, so the past has to be asked for.
  it("asks the API only for today onwards until told otherwise", async () => {
    await mount();
    const call = h.api.get.mock.calls.find((call: any[]) =>
      String(call[0]).includes("/activities"),
    );
    expect(call?.[1]?.params?.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("drops the date floor when the past is included", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    await waitFor(() => {
      const calls = h.api.get.mock.calls.filter((call: any[]) =>
        String(call[0]).includes("/activities"),
      );
      expect(calls.at(-1)?.[1]?.params?.from).toBeUndefined();
    });
  });

  it("narrows by kind", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("All kinds"), {
        target: { value: "TRIP" },
      });
    });
    await waitFor(() => {
      const calls = h.api.get.mock.calls.filter((call: any[]) =>
        String(call[0]).includes("/activities"),
      );
      expect(calls.at(-1)?.[1]?.params?.kind).toBe("TRIP");
    });
  });

  // An event nobody was told about is the one families complain about.
  it("marks the ones that need a permission slip", async () => {
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    expect(within(row).getByText(/consent needed/i)).toBeInTheDocument();
  });

  it("shows how many are on the list against the places available", async () => {
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    expect(within(row).getByText("2 / 30")).toBeInTheDocument();
  });

  it("names the year levels an activity is aimed at", async () => {
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    expect(within(row).getByText("Senior 2")).toBeInTheDocument();
  });

  it("says 'whole school' rather than listing every class", async () => {
    await mount();
    const row = screen.getByText("Debate club").closest("tr")!;
    expect(within(row).getByText(/whole school/i)).toBeInTheDocument();
  });

  // A cancelled trip stays visible, with the reason attached.
  it("keeps a cancelled activity on the page and says why", async () => {
    serve(h.api, {
      ...routes,
      "/activities": {
        data: [cancelled],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      },
    });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText("Swimming gala")).toBeInTheDocument(),
    );
    expect(screen.getByText(/pool is closed for repairs/i)).toBeInTheDocument();
  });

  it("says so when there is nothing on", async () => {
    serve(h.api, {
      ...routes,
      "/activities": {
        data: [],
        meta: { total: 0, page: 1, limit: 25, totalPages: 1 },
      },
    });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/nothing on the calendar/i)).toBeInTheDocument(),
    );
  });

  it("survives the API being down", async () => {
    serveFailure(h.api);
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText("Activities")).toBeInTheDocument(),
    );
  });
});

describe("paging", () => {
  const paged = {
    data: [trip, club],
    meta: { total: 60, page: 1, limit: 25, totalPages: 3 },
  };

  it("shows the range and page count", async () => {
    serve(h.api, { ...routes, "/activities": paged });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/1–25 of 60/)).toBeInTheDocument());
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
  });

  it("cannot go back from the first page", async () => {
    serve(h.api, { ...routes, "/activities": paged });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
  });

  it("asks for the next page", async () => {
    serve(h.api, { ...routes, "/activities": paged });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument());
    await click(screen.getByLabelText("Next page"));
    await waitFor(() => {
      const calls = h.api.get.mock.calls.filter((call: any[]) =>
        String(call[0]).includes("/activities"),
      );
      expect(calls.at(-1)?.[1]?.params?.page).toBe(2);
    });
  });

  // Changing a filter while on page 3 of the old result shows an empty page.
  it("returns to the first page when the filter changes", async () => {
    serve(h.api, { ...routes, "/activities": paged });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument());
    await click(screen.getByLabelText("Next page"));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("All kinds"), {
        target: { value: "CLUB" },
      });
    });
    await waitFor(() => {
      const calls = h.api.get.mock.calls.filter((call: any[]) =>
        String(call[0]).includes("/activities"),
      );
      expect(calls.at(-1)?.[1]?.params?.page).toBe(1);
    });
  });

  it("hides the pager when everything fits on one page", async () => {
    await mount();
    expect(screen.queryByLabelText("Next page")).not.toBeInTheDocument();
  });
});

describe("putting something on the calendar", () => {
  it("sends what was typed", async () => {
    await mount();
    await click(button(/new activity/i));

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Kigali museum visit" },
      });
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: "2026-10-01T08:00" },
      });
      fireEvent.change(screen.getByLabelText("Where"), {
        target: { value: "Kigali Genocide Memorial" },
      });
    });
    await click(button(/add to calendar/i));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (call: any[]) => String(call[0]) === "/activities",
      );
      expect(call?.[1]).toMatchObject({
        title: "Kigali museum visit",
        location: "Kigali Genocide Memorial",
        audience: "WHOLE_SCHOOL",
      });
    });
  });

  // The whole point of the request is a date, so it cannot be sent without one.
  it("will not submit without a title and a start", async () => {
    await mount();
    await click(button(/new activity/i));
    expect(button(/add to calendar/i)).toBeDisabled();
  });

  it("sends the start as a real instant, not the raw input text", async () => {
    await mount();
    await click(button(/new activity/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Sports day" },
      });
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: "2026-10-01T08:00" },
      });
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (call: any[]) => String(call[0]) === "/activities",
      );
      expect((call?.[1] as any).startsAt).toMatch(/T.*Z$/);
    });
  });

  // Off the premises means a slip, and the organiser has to opt in to it.
  it("asks for no permission slip unless the box is ticked", async () => {
    await mount();
    await click(button(/new activity/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Assembly" },
      });
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: "2026-10-01T08:00" },
      });
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (call: any[]) => String(call[0]) === "/activities",
      );
      expect((call?.[1] as any).requiresConsent).toBe(false);
    });
  });

  it("carries the ticked boxes through", async () => {
    await mount();
    await click(button(/new activity/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Nyungwe trip" },
      });
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: "2026-10-01T08:00" },
      });
      fireEvent.click(screen.getByText(/needs a parent/i).closest("label")!.querySelector("input")!);
      fireEvent.click(screen.getByText(/takes a register/i).closest("label")!.querySelector("input")!);
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (call: any[]) => String(call[0]) === "/activities",
      );
      expect(call?.[1]).toMatchObject({
        requiresConsent: true,
        tracksAttendance: true,
      });
    });
  });

  it("only offers year levels once that audience is chosen", async () => {
    await mount();
    await click(button(/new activity/i));
    expect(screen.queryByText("Year levels")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/who is it for/i), {
        target: { value: "LEVELS" },
      });
    });
    expect(screen.getByText("Year levels")).toBeInTheDocument();
  });

  it("sends the chosen levels", async () => {
    await mount();
    await click(button(/new activity/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Senior 1 orientation" },
      });
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: "2026-10-01T08:00" },
      });
      fireEvent.change(screen.getByLabelText(/who is it for/i), {
        target: { value: "LEVELS" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByText(classLevel.name).closest("label")!.querySelector("input")!);
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (call: any[]) => String(call[0]) === "/activities",
      );
      expect((call?.[1] as any).classLevelIds).toEqual([classLevel.id]);
    });
  });

  it("leaves capacity out when no limit is given", async () => {
    await mount();
    await click(button(/new activity/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Assembly" },
      });
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: "2026-10-01T08:00" },
      });
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (call: any[]) => String(call[0]) === "/activities",
      );
      expect((call?.[1] as any).capacity).toBeUndefined();
    });
  });

  it("says so when the API refuses", async () => {
    await mount();
    await click(button(/new activity/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Assembly" },
      });
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: "2026-10-01T08:00" },
      });
    });
    h.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "An activity cannot end before it starts" },
      },
    });
    await click(button(/add to calendar/i));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "An activity cannot end before it starts",
      ),
    );
  });
});

describe("one activity", () => {
  it("lists who is on it", async () => {
    await openDetail();
    expect(screen.getByText(/Keza Mutesi/)).toBeInTheDocument();
    expect(screen.getByText("STD-2025-231419-167")).toBeInTheDocument();
  });

  // The day before a trip, "who has not answered" is the only question.
  it("counts the answers, including the ones still missing", async () => {
    await openDetail();
    await waitFor(() =>
      expect(screen.getByText("Not answered")).toBeInTheDocument(),
    );
    const pending = screen.getByText("Not answered").closest("div")!;
    expect(within(pending).getByText("1")).toBeInTheDocument();
  });

  it("shows each student's own permission state", async () => {
    await openDetail();
    const row = screen.getByText(/Divine Niyonkuru/).closest("tr")!;
    expect(within(row).getByText("Agreed")).toBeInTheDocument();
    const waiting = screen.getByText(/Keza Mutesi/).closest("tr")!;
    expect(within(waiting).getByText("Waiting")).toBeInTheDocument();
  });

  it("signs up a whole class at once", async () => {
    await openDetail();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Level"), {
        target: { value: classLevel.id },
      });
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Class")).not.toBeDisabled(),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Class"), {
        target: { value: classSection.id },
      });
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/activities/act-1/participants/class",
        { classSectionId: classSection.id },
      ),
    );
  });

  it("cannot pick a class before a level", async () => {
    await openDetail();
    expect(screen.getByLabelText("Class")).toBeDisabled();
  });

  it("takes a student off the list", async () => {
    await openDetail();
    await click(screen.getByLabelText(/remove divine/i));
    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith(
        "/activities/act-1/participants/student-1",
      ),
    );
  });

  it("takes the register", async () => {
    await openDetail();
    await click(screen.getByLabelText(/keza came/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/activities/act-1/attendance", {
        records: [{ studentId: "student-2", attended: true }],
      }),
    );
  });

  it("offers no register for an activity that does not take one", async () => {
    serve(h.api, { ...routes, "/activities/act-1": { ...detail, tracksAttendance: false } });
    await openDetail();
    expect(screen.queryByLabelText(/keza came/i)).not.toBeInTheDocument();
  });

  it("asks for no consent counts when none is needed", async () => {
    serve(h.api, {
      ...routes,
      "/activities/act-1": { ...detail, requiresConsent: false },
    });
    await openDetail();
    expect(screen.queryByText("Not answered")).not.toBeInTheDocument();
  });

  it("says plainly when nobody has signed up", async () => {
    serve(h.api, { ...routes, "/activities/act-1": { ...detail, participants: [] } });
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    await click(within(row).getByRole("button", { name: /open/i }));
    await waitFor(() =>
      expect(screen.getByText(/nobody signed up yet/i)).toBeInTheDocument(),
    );
  });
});

describe("calling something off", () => {
  // Never a delete: families who already signed need to see why it is off.
  it("sends the reason with the cancellation", async () => {
    await openDetail();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Reason"), {
        target: { value: "The bus is not available" },
      });
    });
    await click(button(/call it off/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/activities/act-1/cancel", {
        reason: "The bus is not available",
      }),
    );
  });

  it("refuses to cancel without a reason", async () => {
    await openDetail();
    expect(button(/call it off/i)).toBeDisabled();
  });

  it("never deletes", async () => {
    await openDetail();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Reason"), {
        target: { value: "Rain" },
      });
    });
    await click(button(/call it off/i));
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(h.api.delete).not.toHaveBeenCalledWith("/activities/act-1");
  });

  it("offers no cancel button on one already called off", async () => {
    serve(h.api, {
      ...routes,
      "/activities/act-1": { ...detail, isCancelled: true },
    });
    await openDetail();
    expect(button(/call it off/i)).toBeUndefined();
  });

  it("closes the detail without changing anything", async () => {
    await openDetail();
    expect(h.api.put).not.toHaveBeenCalled();
    expect(h.api.delete).not.toHaveBeenCalled();
  });
});

/**
 * The remaining controls on the create form. Each one is a decision about who
 * gets told and who gets counted, so a control that silently keeps its default
 * is a decision nobody made.
 */
describe("the rest of the create form", () => {
  async function openNew() {
    await mount();
    await click(button(/new activity/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Kigali museum visit" },
      });
      fireEvent.change(screen.getByLabelText("Starts"), {
        target: { value: "2026-10-01T08:00" },
      });
    });
  }

  it("carries an end time when one is given", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Ends"), {
        target: { value: "2026-10-01T15:00" },
      });
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/activities",
      );
      expect((call?.[1] as any).endsAt).toMatch(/T.*Z$/);
    });
  });

  it("carries a capacity when one is given", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/places/i), {
        target: { value: "45" },
      });
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/activities",
      );
      expect((call?.[1] as any).capacity).toBe(45);
    });
  });

  it("carries the kind that was chosen", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Kind"), {
        target: { value: "VISITING_DAY" },
      });
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/activities",
      );
      expect((call?.[1] as any).kind).toBe("VISITING_DAY");
    });
  });

  it("unticks a year level that was ticked by mistake", async () => {
    await openNew();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/who is it for/i), {
        target: { value: "LEVELS" },
      });
    });
    const box = () =>
      screen.getByText(classLevel.name).closest("label")!.querySelector("input")!;
    await act(async () => {
      fireEvent.click(box());
    });
    await act(async () => {
      fireEvent.click(box());
    });
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/activities",
      );
      expect((call?.[1] as any).classLevelIds).toEqual([]);
    });
  });

  it("leaves the description out when none was typed", async () => {
    await openNew();
    await click(button(/add to calendar/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find(
        (c: any[]) => String(c[0]) === "/activities",
      );
      expect((call?.[1] as any).description).toBeUndefined();
      expect((call?.[1] as any).location).toBeUndefined();
    });
  });

  it("closes without sending anything", async () => {
    await openNew();
    await click(button(/^cancel$/i));
    expect(
      h.api.post.mock.calls.filter((c: any[]) => String(c[0]) === "/activities"),
    ).toHaveLength(0);
  });

  it("names the classes an activity is aimed at", async () => {
    serve(h.api, {
      ...routes,
      "/activities": {
        data: [
          {
            ...club,
            audience: "CLASSES",
            sections: [{ classSection: { id: "section-1", name: "Senior 1 A" } }],
          },
        ],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      },
    });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText("Senior 1 A")).toBeInTheDocument(),
    );
  });

  it("says 'Levels' when the levels came back empty", async () => {
    serve(h.api, {
      ...routes,
      "/activities": {
        data: [{ ...trip, classLevels: [] }],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      },
    });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText("Levels")).toBeInTheDocument());
  });

  it("goes back a page as well as forward", async () => {
    serve(h.api, {
      ...routes,
      "/activities": {
        data: [trip, club],
        meta: { total: 60, page: 2, limit: 25, totalPages: 3 },
      },
    });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument());
    await click(screen.getByLabelText("Previous page"));
    await waitFor(() => {
      const calls = h.api.get.mock.calls.filter((call: any[]) =>
        String(call[0]).includes("/activities"),
      );
      expect(calls.at(-1)?.[1]?.params?.page).toBe(1);
    });
  });

  it("closes the detail and the create form again", async () => {
    await openDetail();
    await click(screen.getByLabelText("Close dialog"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument(),
    );
    await click(button(/new activity/i));
    await click(screen.getByLabelText("Close dialog"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Title")).not.toBeInTheDocument(),
    );
  });
});
/**
 * A permission a parent actually refused, and activities recorded thinly.
 *
 * "Refused" is the answer that matters most on a trip list, and it is the one
 * a fixture built out of agreed-and-waiting never produces. The rest of this
 * block covers activities entered with no place, no roll and no class named.
 */
describe("a permission that was refused", () => {
  const refused = {
    ...detail,
    participants: [
      { ...participants[0], id: "p-9", consent: "REFUSED" },
      participants[1],
    ],
  };

  it("marks the student who may not go", async () => {
    serve(h.api, { ...routes, "/activities/act-1": refused });
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    await click(within(row).getByRole("button", { name: /open/i }));

    await waitFor(() =>
      expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument(),
    );
    const student = screen.getByText(/Divine Niyonkuru/).closest("tr")!;
    expect(within(student).getByText("Refused")).toBeInTheDocument();
  });

  it("colours a refusal differently from a permission still waiting", async () => {
    serve(h.api, { ...routes, "/activities/act-1": refused });
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    await click(within(row).getByRole("button", { name: /open/i }));
    await waitFor(() =>
      expect(screen.getByText("Refused")).toBeInTheDocument(),
    );

    expect(screen.getByText("Refused").className).not.toBe(
      screen.getByText("Waiting").className,
    );
  });
});

describe("an activity entered without its details", () => {
  const thin = {
    ...club,
    id: "act-9",
    title: "Reading hour",
    location: null,
    capacity: null,
    audience: "SECTIONS",
    sections: [],
    classLevels: [],
    _count: undefined,
  };

  async function mountThin() {
    serve(h.api, {
      ...routes,
      "/activities": { data: [thin], meta: { total: 1, page: 1, limit: 25, totalPages: 1 } },
    });
    renderPage(ActivitiesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText("Reading hour")).toBeInTheDocument());
    return screen.getByText("Reading hour").closest("tr")!;
  }

  it("draws an em dash where no place was named", async () => {
    const row = await mountThin();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("says nobody is signed up rather than leaving the count blank", async () => {
    const row = await mountThin();
    expect(within(row).getByText("0")).toBeInTheDocument();
  });

  it("falls back to a general audience when no class is named", async () => {
    const row = await mountThin();
    expect(within(row).getByText("Classes")).toBeInTheDocument();
  });

  it("names the classes when there are some", async () => {
    serve(h.api, {
      ...routes,
      "/activities": {
        data: [
          {
            ...thin,
            audience: "SECTIONS",
            sections: [{ classSection: { id: "s-1", name: "Senior 1 A" } }],
          },
        ],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      },
    });
    renderPage(ActivitiesPage, { role: "ADMIN" });

    await waitFor(() => expect(screen.getByText("Senior 1 A")).toBeInTheDocument());
  });

  it("leaves the capacity out of the heading when there is none", async () => {
    serve(h.api, {
      ...routes,
      "/activities/act-1": { ...detail, capacity: null },
    });
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    await click(within(row).getByRole("button", { name: /open/i }));

    await waitFor(() =>
      expect(screen.getByText(/On the list \(2\)/)).toBeInTheDocument(),
    );
  });
});

describe("adding a whole class from the picker", () => {
  it("sends nothing when the picker is set back to its prompt", async () => {
    await openDetail();
    const picker = screen.getByLabelText("Class") as HTMLSelectElement;

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.change(picker, { target: { value: "" } });
    });

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/participants/class"),
      ),
    ).toBeUndefined();
  });
});

/**
 * An activity that needs no permission slip.
 *
 * A debate club does not; a forest trip does. The consent summary is only
 * fetched for the second kind, because asking for it on every club would put
 * a "0 of 0 answered" panel on screens that have nothing to answer.
 */
describe("an activity that asks for no permission", () => {
  it("does not fetch a consent summary for it", async () => {
    serve(h.api, {
      ...routes,
      "/activities/act-1": { ...detail, requiresConsent: false },
    });
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    h.api.get.mockClear();
    await click(within(row).getByRole("button", { name: /open/i }));

    await waitFor(() =>
      expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument(),
    );
    expect(
      h.api.get.mock.calls.some(([url]: any[]) => String(url).includes("/consent")),
    ).toBe(false);
  });

  it("shows no permission column on its list", async () => {
    serve(h.api, {
      ...routes,
      "/activities/act-1": { ...detail, requiresConsent: false },
    });
    await mount();
    const row = screen.getByText("Nyungwe forest trip").closest("tr")!;
    await click(within(row).getByRole("button", { name: /open/i }));

    await waitFor(() =>
      expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Permission")).toBeNull();
  });
});
