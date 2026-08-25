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
  usePathname: () => "/student/attendance",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import StudentAttendancePage from "./page";

/**
 * A student's own attendance, month by month.
 *
 * The calendar is the point: a running total tells them nothing about which
 * days they missed. So the month has to be walkable in both directions and
 * each day has to carry the mark the school recorded.
 */

const today = new Date();
const iso = (day: number, monthOffset = 0) =>
  new Date(today.getFullYear(), today.getMonth() + monthOffset, day)
    .toISOString()
    .slice(0, 10);

const summary = {
  present: 58,
  absent: 2,
  late: 1,
  excused: 0,
  rate: 95.1,
  records: [
    { id: "a-1", date: iso(3), status: "PRESENT" },
    { id: "a-2", date: iso(4), status: "ABSENT" },
    { id: "a-3", date: iso(5), status: "LATE" },
    { id: "a-4", date: iso(6, -1), status: "PRESENT" },
  ],
};

const routes = { ...populatedRoutes, "/attendance/student-summary": summary };
const asStudent = { role: "STUDENT" as const, user: { id: "u-1", studentId: "student-1" } };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(StudentAttendancePage, asStudent);
  // The calendar and its month controls only appear once the summary lands.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /previous page/i })).toBeInTheDocument(),
  );
}

function button(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.getAttribute("aria-label") ?? b.textContent ?? "").trim()));
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

describe("a student's own record", () => {
  it("asks only for their own attendance", async () => {
    await mount();
    await waitFor(() => {
      const call = h.api.get.mock.calls.find(([url]: any[]) =>
        String(url).includes("/attendance/student-summary"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any)?.params?.studentId).toBe("student-1");
    });
  });

  // Days present, days absent and days late. There is no percentage on this
  // page; the counts are what a student is told.
  it("shows the running totals", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/58/);
    expect(document.body.textContent).toMatch(/2/);
    expect(document.body.textContent).toMatch(/1/);
  });

  it("names the month it is showing", async () => {
    await mount();
    const month = today.toLocaleDateString("en", { month: "long" });
    await waitFor(() => expect(document.body.textContent).toMatch(new RegExp(month, "i")));
  });

  it("does not go blank when the record fails to load", async () => {
    serveFailure(h.api);
    renderPage(StudentAttendancePage, asStudent);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("survives a student with no attendance recorded", async () => {
    serve(h.api, {
      ...routes,
      "/attendance/student-summary": { present: 0, absent: 0, late: 0, excused: 0, rate: 0, records: [] },
    });
    renderPage(StudentAttendancePage, asStudent);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("walking through the months", () => {
  it("goes back a month", async () => {
    await mount();
    const month = new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleDateString(
      "en",
      { month: "long" },
    );

    await click(button(/previous/i));
    await waitFor(() => expect(document.body.textContent).toMatch(new RegExp(month, "i")));
  });

  it("goes forward again", async () => {
    await mount();
    const thisMonth = today.toLocaleDateString("en", { month: "long" });

    await click(button(/previous/i));
    await click(button(/next/i));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(new RegExp(thisMonth, "i")),
    );
  });

  // Walking across a year boundary is where month arithmetic usually breaks.
  it("crosses into the previous year", async () => {
    await mount();
    for (let i = 0; i <= today.getMonth(); i += 1) {
      await click(button(/previous/i));
    }

    await waitFor(() =>
      expect(document.body.textContent).toMatch(String(today.getFullYear() - 1)),
    );
  });
});

/**
 * The rate at each end of the scale, and the wait before it arrives.
 *
 * The rate is coloured against two thresholds, and it is the only number a
 * student's parent is going to look at. A single fixture at ninety-five only
 * ever paints the healthy arm.
 */
describe("how the attendance rate is coloured", () => {
  const rateClass = async (attendanceRate: number) => {
    serve(h.api, {
      ...routes,
      "/attendance/student-summary": { ...summary, attendanceRate },
    });
    renderPage(StudentAttendancePage, asStudent);
    const value = await screen.findByText(`${attendanceRate}%`);
    return value.className;
  };

  it("paints a healthy record one way", async () => {
    expect(await rateClass(96)).toMatch(/success/);
  });

  it("warns in the middle", async () => {
    document.body.innerHTML = "";
    expect(await rateClass(82)).toMatch(/warning/);
  });

  it("paints a record that needs acting on differently again", async () => {
    document.body.innerHTML = "";
    expect(await rateClass(58)).toMatch(/danger/);
  });
});

describe("before the record arrives", () => {
  it("spins rather than showing an empty month", async () => {
    serve(h.api, {
      ...routes,
      "/attendance/student-summary": () => new Promise(() => {}),
    });
    renderPage(StudentAttendancePage, asStudent);

    expect(
      screen.queryByRole("button", { name: /previous page/i }),
    ).not.toBeInTheDocument();
  });

  it("asks for nothing at all when the account carries no student", async () => {
    serve(h.api, routes);
    renderPage(StudentAttendancePage, { role: "STUDENT", user: { id: "u-1" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(
      h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("/attendance/student-summary"),
      ),
    ).toBe(false);
  });
});
