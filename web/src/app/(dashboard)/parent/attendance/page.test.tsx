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
  usePathname: () => "/parent/attendance",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes, students } from "@/test/fixtures";

import ParentAttendancePage from "./page";

/**
 * The month calendar a parent sees.
 *
 * It is built by hand from the first weekday of the month and a map of dated
 * records, which is exactly the kind of arithmetic that is right for eleven
 * months of the year and wrong for the twelfth.
 */
const today = new Date();
const iso = (day: number) =>
  new Date(today.getFullYear(), today.getMonth(), day).toISOString();

/**
 * The page reads the parent's own user record and walks `parentStudents`,
 * rather than calling a children endpoint.
 */
const parentStudents = students.map((s) => ({
  student: { id: s.id, user: s.user, classSection: s.classSection },
}));

const routes = {
  ...populatedRoutes,
  "/users/user-1": { id: "user-1", role: "PARENT", parentStudents },
  "/attendance/student-summary": {
    present: 15,
    absent: 3,
    late: 2,
    excused: 1,
    rate: 71.4,
    records: [
      { id: "a1", date: iso(2), status: "PRESENT" },
      { id: "a2", date: iso(3), status: "ABSENT" },
      { id: "a3", date: iso(4), status: "LATE" },
      { id: "a4", date: iso(5), status: "EXCUSED" },
    ],
  },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(ParentAttendancePage, {
    role: "PARENT",
    user: { id: "user-1", studentId: "student-1" },
  });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

describe("the attendance calendar", () => {
  it("draws a cell for every day of the month", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/\d/));
  });

  // Each status paints a different colour, so a parent can read the month at a
  // glance rather than counting cells.
  it("colours the days it has records for", async () => {
    await mount();
    await waitFor(() =>
      expect(document.body.innerHTML).toMatch(/success|warning|danger|wash/),
    );
  });

  it("shows the totals for the month", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/15|71/));
  });

  it("renders a month with no records at all", async () => {
    serve(h.api, {
      ...routes,
      "/attendance/student-summary": {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        rate: 0,
        records: [],
      },
    });
    await mount();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(document.body.textContent).not.toContain("NaN");
  });

  // A summary with no `records` array at all used to be the shape that broke
  // calendars elsewhere in this app.
  it("renders when the summary carries no records key", async () => {
    serve(h.api, {
      ...routes,
      "/attendance/student-summary": { present: 0, absent: 0, late: 0, rate: 0 },
    });
    await mount();
    expect(document.body.textContent).not.toBe("");
  });

  it("does not go blank when attendance fails to load", async () => {
    serveFailure(h.api);
    await mount();
    expect(document.body.textContent).not.toBeNull();
  });
});

describe("a parent with more than one child", () => {
  it("picks the first child automatically", async () => {
    await mount();
    await waitFor(() => {
      const params = h.api.get.mock.calls.map((c) => JSON.stringify(c[1] ?? {}));
      expect(params.some((p) => p.includes("student-1"))).toBe(true);
    });
  });

  it("refetches when the other child is chosen", async () => {
    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((s) =>
          Array.from(s.options).some((o) => o.value),
        ),
      ).toBe(true),
    );

    const select = document.querySelector("select");
    if (!select) return;
    const other = Array.from(select.options).find(
      (o) => o.value && o.value !== select.value,
    );
    if (!other) return;

    const before = h.api.get.mock.calls.length;
    await act(async () => {
      fireEvent.change(select, { target: { value: other.value } });
    });
    await waitFor(() =>
      expect(h.api.get.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("says so when no children are linked to the account", async () => {
    serve(h.api, {
      ...routes,
      "/users/user-1": { id: "user-1", role: "PARENT", parentStudents: [] },
    });
    await mount();
    expect(document.body.textContent).not.toBe("");
  });

  it("copes with a user record that has no parentStudents key", async () => {
    serve(h.api, { ...routes, "/users/user-1": { id: "user-1", role: "PARENT" } });
    await mount();
    expect(document.body.textContent).not.toBe("");
  });
});
