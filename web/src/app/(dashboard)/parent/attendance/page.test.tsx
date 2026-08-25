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
  usePathname: () => "/parent/attendance",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { classSection, populatedRoutes } from "@/test/fixtures";
import { toLocalDateString } from "@/lib/utils";

import ParentAttendancePage from "./page";

/**
 * A parent checking whether their child has been in school.
 *
 * The rate is coloured against two thresholds, and the calendar below is drawn
 * from the current month rather than from whatever the API happened to send,
 * so a record from another month must not appear on it.
 */

function parentWith(...kids: { id: string; first: string; last: string; section?: unknown }[]) {
  return {
    id: "parent-1",
    parentStudents: kids.map((k) => ({
      student: {
        id: k.id,
        user: { firstName: k.first, lastName: k.last },
        classSection: "section" in k ? k.section : classSection,
      },
    })),
  };
}

/** A day this month, as the API dates it. */
function dayThisMonth(day: number, status: string) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), day);
  return { id: `att-${day}`, date: date.toISOString(), status };
}

const summary = {
  attendanceRate: 96,
  present: 58,
  late: 2,
  absent: 1,
  excused: 0,
  records: [dayThisMonth(3, "PRESENT"), dayThisMonth(4, "ABSENT"), dayThisMonth(5, "LATE")],
};

function routesWith(parent: unknown, data: unknown = summary) {
  return {
    ...populatedRoutes,
    "/users/parent-1": parent,
    "/attendance/student-summary": data,
  };
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

function mount(parent: unknown, data: unknown = summary) {
  serve(h.api, routesWith(parent, data));
  renderPage(ParentAttendancePage, { role: "PARENT", user: { id: "parent-1" } });
}

describe("a family with one child", () => {
  const single = parentWith({ id: "student-1", first: "Keza", last: "Uwimana" });

  it("names the child rather than offering a pointless choice", async () => {
    mount(single);
    await waitFor(() =>
      expect(screen.getAllByText("Keza Uwimana").length).toBe(2),
    );
    expect(screen.queryByLabelText("Select child")).toBeNull();
  });

  it("asks for that child's attendance without being told to", async () => {
    mount(single);
    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(
        ([url, config]: any[]) =>
          String(url).includes("/attendance/student-summary") &&
          config?.params?.studentId === "student-1",
      );
      expect(asked).toBe(true);
    });
  });

  it("leaves the class blank when the child is in none", async () => {
    mount(parentWith({ id: "student-1", first: "Keza", last: "Uwimana", section: null }));
    await waitFor(() =>
      expect(screen.getAllByText("Keza Uwimana").length).toBe(2),
    );
    expect(screen.queryByText(/Senior 1/)).toBeNull();
  });
});

describe("a family with more than one child", () => {
  const several = parentWith(
    { id: "student-1", first: "Keza", last: "Uwimana" },
    { id: "student-2", first: "Manzi", last: "Habimana" },
  );

  it("offers a choice between them", async () => {
    mount(several);
    expect(await screen.findByLabelText("Select child")).toHaveValue("student-1");
  });

  it("fetches the other child when the parent switches", async () => {
    mount(several);
    await screen.findByLabelText("Select child");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Select child"), {
        target: { value: "student-2" },
      });
    });

    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(
        ([url, config]: any[]) =>
          String(url).includes("/attendance/student-summary") &&
          config?.params?.studentId === "student-2",
      );
      expect(asked).toBe(true);
    });
  });
});

describe("a parent with nobody linked to them", () => {
  it("shows no child card and asks for nothing", async () => {
    mount({ id: "parent-1", parentStudents: [] });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(screen.queryByLabelText("Select child")).toBeNull();
    expect(screen.queryByText(/Viewing attendance for/)).toBeNull();
    expect(
      h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("/attendance/student-summary"),
      ),
    ).toBe(false);
  });

  it("does not go blank when the link lookup fails", async () => {
    h.api.get.mockImplementation(async (url: string) => {
      if (String(url).includes("/users/parent-1")) {
        throw Object.assign(new Error("nope"), { response: { status: 403 } });
      }
      return { data: [] };
    });
    renderPage(ParentAttendancePage, { role: "PARENT", user: { id: "parent-1" } });

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.getByText(/Attendance/)).toBeInTheDocument();
  });
});

describe("how the rate is coloured", () => {
  const single = parentWith({ id: "student-1", first: "Keza", last: "Uwimana" });

  const rateClass = async (attendanceRate: number) => {
    mount(single, { ...summary, attendanceRate });
    const value = await screen.findByText(`${attendanceRate}%`);
    return value.className;
  };

  it("paints a healthy rate one way", async () => {
    expect(await rateClass(96)).toMatch(/success/);
  });

  it("warns in the middle", async () => {
    document.body.innerHTML = "";
    expect(await rateClass(80)).toMatch(/warning/);
  });

  it("paints a rate that needs acting on differently again", async () => {
    document.body.innerHTML = "";
    expect(await rateClass(61)).toMatch(/danger/);
  });
});

describe("the month's calendar", () => {
  const single = parentWith({ id: "student-1", first: "Keza", last: "Uwimana" });

  it("names the month it is showing", async () => {
    mount(single);
    const monthName = new Date().toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
    expect(await screen.findByText(new RegExp(monthName))).toBeInTheDocument();
  });

  it("draws a square for every day of the month", async () => {
    mount(single);
    await screen.findByText("96%");

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    expect(screen.getByText(String(daysInMonth))).toBeInTheDocument();
  });

  it("ignores a record from another month", async () => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1, 15);
    mount(single, {
      ...summary,
      records: [{ id: "old", date: lastMonth.toISOString(), status: "ABSENT" }],
    });

    await screen.findByText("96%");
    // The calendar is built from this month, so nothing is marked.
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it("draws an empty calendar when there are no records at all", async () => {
    mount(single, { ...summary, records: undefined });
    await screen.findByText("96%");

    // Still the month's name and the summary, just nothing marked on it.
    expect(screen.getByText(toLocalDateString(new Date()).slice(0, 4), { exact: false }))
      .toBeInTheDocument();
  });
});
