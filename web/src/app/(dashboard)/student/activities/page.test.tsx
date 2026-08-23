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
  usePathname: () => "/student/activities",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import StudentActivitiesPage from "./page";

/**
 * What is on, from one student's side.
 *
 * The question a student asks is not "list the calendar" but "what am I meant
 * to be at, and is anything still waiting on a signature at home". The tests
 * hold that shape.
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
  myPlace: { id: "p-1", consent: "PENDING", attended: null },
};

const club = {
  ...trip,
  id: "act-2",
  kind: "CLUB",
  title: "Debate club",
  description: null,
  location: "Room 4",
  requiresConsent: false,
  myPlace: { id: "p-2", consent: "PENDING", attended: null },
};

const assembly = {
  ...club,
  id: "act-3",
  kind: "ASSEMBLY",
  title: "Monday assembly",
  location: null,
  myPlace: null,
};

const routes: Record<string, unknown> = {
  ...populatedRoutes,
  "/activities/student/student-1": [trip, club, assembly],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(overrides: Record<string, unknown> = {}) {
  renderPage(StudentActivitiesPage, {
    role: "STUDENT",
    user: { studentId: "student-1", ...overrides },
  });
  await waitFor(() =>
    expect(screen.getByText("Nyungwe forest trip")).toBeInTheDocument(),
  );
}

describe("what's on", () => {
  it("asks only about this student", async () => {
    await mount();
    expect(h.api.get).toHaveBeenCalledWith("/activities/student/student-1");
  });

  it("lists everything they are concerned by", async () => {
    await mount();
    expect(screen.getByText("Debate club")).toBeInTheDocument();
    expect(screen.getByText("Monday assembly")).toBeInTheDocument();
  });

  it("shows where and when", async () => {
    await mount();
    expect(screen.getByText(/Nyungwe National Park/)).toBeInTheDocument();
    // The date is interpolated, so it lands in several text nodes.
    expect(document.body.textContent).toMatch(/Thursday 10 September/);
  });

  it("says when they are on the list", async () => {
    await mount();
    expect(screen.getAllByText(/you are on the list/i).length).toBeGreaterThan(0);
  });

  // The point of the page: a slip nobody signed is the reason a child is left
  // behind at the gate on the morning of the trip.
  it("says a permission slip is still outstanding, and whose", async () => {
    await mount();
    expect(screen.getByText(/needs permission/i)).toBeInTheDocument();
    expect(screen.getByText(/parent has not answered yet/i)).toBeInTheDocument();
  });

  it("says when permission has been given", async () => {
    serve(h.api, {
      ...routes,
      "/activities/student/student-1": [
        { ...trip, myPlace: { id: "p-1", consent: "GIVEN", attended: null } },
      ],
    });
    await mount();
    expect(screen.getByText(/permission given/i)).toBeInTheDocument();
  });

  it("says plainly when a parent refused", async () => {
    serve(h.api, {
      ...routes,
      "/activities/student/student-1": [
        { ...trip, myPlace: { id: "p-1", consent: "REFUSED", attended: null } },
      ],
    });
    await mount();
    expect(screen.getByText(/not allowed to go/i)).toBeInTheDocument();
  });

  it("shows no permission line for things that need none", async () => {
    serve(h.api, { ...routes, "/activities/student/student-1": [club] });
    renderPage(StudentActivitiesPage, {
      role: "STUDENT",
      user: { studentId: "student-1" },
    });
    await waitFor(() =>
      expect(screen.getByText("Debate club")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/needs permission/i)).not.toBeInTheDocument();
  });

  it("narrows to one kind", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("All kinds"), {
        target: { value: "CLUB" },
      });
    });
    expect(screen.getByText("Debate club")).toBeInTheDocument();
    expect(screen.queryByText("Nyungwe forest trip")).not.toBeInTheDocument();
  });

  it("says so when there is nothing coming up", async () => {
    serve(h.api, { ...routes, "/activities/student/student-1": [] });
    renderPage(StudentActivitiesPage, {
      role: "STUDENT",
      user: { studentId: "student-1" },
    });
    await waitFor(() =>
      expect(screen.getByText(/nothing coming up/i)).toBeInTheDocument(),
    );
  });

  it("survives the API being down", async () => {
    serveFailure(h.api);
    renderPage(StudentActivitiesPage, {
      role: "STUDENT",
      user: { studentId: "student-1" },
    });
    await waitFor(() =>
      expect(screen.getByText("What's on")).toBeInTheDocument(),
    );
  });

  // A user record with no student attached must not fire a request for
  // "/activities/student/undefined".
  it("asks for nothing when the account has no student record", async () => {
    renderPage(StudentActivitiesPage, {
      role: "STUDENT",
      user: { studentId: undefined },
    });
    await waitFor(() =>
      expect(screen.getByText("What's on")).toBeInTheDocument(),
    );
    expect(
      h.api.get.mock.calls.filter((call: any[]) =>
        String(call[0]).includes("/activities"),
      ),
    ).toHaveLength(0);
  });
});
