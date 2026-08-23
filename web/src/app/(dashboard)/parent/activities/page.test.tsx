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
  usePathname: () => "/parent/activities",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import ParentActivitiesPage from "./page";

/**
 * The permission slip, without the paper.
 *
 * What the tests protect is the answer itself: it reaches the API attached to
 * the right child, a refusal is as easy to record as an agreement, and the
 * things still waiting are the ones a parent sees first.
 */

const trip = {
  id: "act-1",
  kind: "TRIP",
  title: "Nyungwe forest trip",
  description: "Biology field trip",
  location: "Nyungwe National Park",
  startsAt: "2026-09-10T07:00:00.000Z",
  endsAt: "2026-09-10T18:00:00.000Z",
  audience: "LEVELS",
  requiresConsent: true,
  tracksAttendance: true,
  capacity: 30,
  isCancelled: false,
  cancelledReason: null,
  myPlace: null,
};

const answered = {
  ...trip,
  id: "act-2",
  title: "Kigali museum visit",
  myPlace: { id: "p-2", consent: "GIVEN", attended: null },
};

const club = {
  ...trip,
  id: "act-3",
  kind: "CLUB",
  title: "Debate club",
  description: null,
  location: "Room 4",
  requiresConsent: false,
  myPlace: { id: "p-3", consent: "PENDING", attended: null },
};

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
  "/activities/act-1/consent": { id: "p-1", consent: "GIVEN" },
  "/activities/student/student-1": [trip, answered, club],
  "/activities/student/student-2": [club],
  "/users/user-1": parentUser,
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
  renderPage(ParentActivitiesPage, { role: "PARENT", user: { id: "user-1" } });
  await waitFor(() =>
    expect(screen.getByText("Nyungwe forest trip")).toBeInTheDocument(),
  );
}

describe("permission slips", () => {
  it("loads the first child without being asked", async () => {
    await mount();
    expect(h.api.get).toHaveBeenCalledWith("/activities/student/student-1");
  });

  // The night before a trip, the only thing a parent needs to see is what
  // still has no answer.
  it("pulls what is unanswered to the top and counts it", async () => {
    await mount();
    expect(screen.getByText(/waiting for your answer \(1\)/i)).toBeInTheDocument();
  });

  it("treats a student with no place yet as unanswered", async () => {
    await mount();
    const waiting = screen
      .getByText(/waiting for your answer/i)
      .closest("section")!;
    expect(waiting.textContent).toContain("Nyungwe forest trip");
  });

  it("keeps things needing no permission out of the waiting list", async () => {
    await mount();
    const waiting = screen
      .getByText(/waiting for your answer/i)
      .closest("section")!;
    expect(waiting.textContent).not.toContain("Debate club");
  });

  it("sends an agreement for the right child", async () => {
    await mount();
    await click(button(/i agree/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/activities/act-1/consent", {
        studentId: "student-1",
        consent: "GIVEN",
        note: undefined,
      }),
    );
  });

  // A refusal has to be as easy to record as an agreement, or parents phone
  // the office instead and nothing is written down.
  it("sends a refusal", async () => {
    await mount();
    await click(button(/not going/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/activities/act-1/consent", {
        studentId: "student-1",
        consent: "REFUSED",
        note: undefined,
      }),
    );
  });

  it("carries the note the parent typed", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/anything the school should know/i), {
        target: { value: "Gets travel sick" },
      });
    });
    await click(button(/i agree/i));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/activities/act-1/consent", {
        studentId: "student-1",
        consent: "GIVEN",
        note: "Gets travel sick",
      }),
    );
  });

  it("does not send whitespace as a note", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/anything the school should know/i), {
        target: { value: "   " },
      });
    });
    await click(button(/i agree/i));
    await waitFor(() => {
      const call = h.api.post.mock.calls.find((call: any[]) =>
        String(call[0]).includes("/consent"),
      );
      expect((call?.[1] as any).note).toBeUndefined();
    });
  });

  it("shows what was already answered further down", async () => {
    await mount();
    expect(screen.getByText("Kigali museum visit")).toBeInTheDocument();
    expect(screen.getByText(/you agreed/i)).toBeInTheDocument();
  });

  it("says so when a refusal is already on record", async () => {
    serve(h.api, {
      ...routes,
      "/activities/student/student-1": [
        { ...answered, myPlace: { id: "p-2", consent: "REFUSED", attended: null } },
      ],
    });
    renderPage(ParentActivitiesPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText(/you said no/i)).toBeInTheDocument(),
    );
  });

  it("hides the waiting section when nothing is outstanding", async () => {
    serve(h.api, { ...routes, "/activities/student/student-1": [answered] });
    renderPage(ParentActivitiesPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText("Kigali museum visit")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/waiting for your answer/i)).not.toBeInTheDocument();
  });

  it("says so when the calendar is empty", async () => {
    serve(h.api, { ...routes, "/activities/student/student-1": [] });
    renderPage(ParentActivitiesPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText(/nothing else on the calendar/i)).toBeInTheDocument(),
    );
  });
});

describe("more than one child", () => {
  it("offers no chooser to a parent with one child", async () => {
    await mount();
    expect(screen.queryByLabelText("Child")).not.toBeInTheDocument();
  });

  it("offers a chooser when there are two", async () => {
    serve(h.api, { ...routes, "/users/user-1": twoChildren });
    renderPage(ParentActivitiesPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByLabelText("Child")).toBeInTheDocument(),
    );
    expect(screen.getByText("Keza Mutesi")).toBeInTheDocument();
  });

  // Answering for the wrong child is the worst outcome this page could have.
  it("switches which child the answer is for", async () => {
    serve(h.api, { ...routes, "/users/user-1": twoChildren });
    renderPage(ParentActivitiesPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByLabelText("Child")).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Child"), {
        target: { value: "student-2" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith("/activities/student/student-2"),
    );
  });
});

describe("when things go wrong", () => {
  it("survives the API being down", async () => {
    serveFailure(h.api);
    renderPage(ParentActivitiesPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText("Activities")).toBeInTheDocument(),
    );
  });

  it("says why an answer was refused by the server", async () => {
    await mount();
    h.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "A parent can only answer for their own child" },
      },
    });
    await click(button(/i agree/i));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "A parent can only answer for their own child",
      ),
    );
  });
});
