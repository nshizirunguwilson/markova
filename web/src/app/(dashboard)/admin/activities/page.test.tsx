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
});
