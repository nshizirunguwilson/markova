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
  usePathname: () => "/admin/attendance",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { populatedRoutes, students } from "@/test/fixtures";
import { toLocalDateString } from "@/lib/utils";

import AttendancePage from "./page";

/**
 * Who is in school today.
 *
 * The whole screen is one number per class, coloured against two thresholds:
 * green above ninety, amber above seventy-five, red below. A head teacher
 * reads the colour before the number, so all three arms have to be right, and
 * so does the "not marked yet" flag beside them: a class showing nought
 * percent because nobody took the register is a different problem from a class
 * where nobody came.
 */

const section = (name: string, rate: number, marked = true) => ({
  sectionId: `sec-${name}`,
  className: name,
  total: 30,
  present: Math.round((30 * rate) / 100),
  late: 1,
  absent: 30 - Math.round((30 * rate) / 100),
  rate,
  marked,
});

const dashboard = {
  date: "2026-08-24",
  overall: { totalStudents: 90, present: 74, late: 3, absent: 13, rate: 82 },
  sections: [
    section("Senior 1 A", 96),
    section("Senior 2 B", 81),
    section("Senior 3 C", 48),
    section("Senior 4 D", 0, false),
  ],
};

const chronic = {
  count: 2,
  threshold: 20,
  students: [
    {
      studentId: students[0].id,
      name: "Divine Niyonkuru",
      className: "Senior 1 A",
      totalDays: 60,
      absentDays: 18,
      absenceRate: 30,
    },
  ],
};

const routes = {
  ...populatedRoutes,
  "/attendance/dashboard": dashboard,
  "/attendance/chronic": chronic,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(over: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, ...over });
  renderPage(AttendancePage, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

describe("today's register", () => {
  it("lists every class", async () => {
    await mount();
    // Each class appears twice: once in the table, once under its bar.
    await waitFor(() =>
      expect(screen.getAllByText("Senior 1 A").length).toBe(2),
    );
    expect(screen.getAllByText("Senior 3 C").length).toBe(2);
  });

  it("colours each class against the two thresholds", async () => {
    await mount();
    await waitFor(() => expect(screen.getAllByText("Senior 1 A").length).toBe(2));

    const rateIn = (name: string) => {
      const row = screen.getAllByText(name)[0].closest("tr")!;
      return within(row).getByText(/%$/).className;
    };

    const good = rateIn("Senior 1 A");
    const middling = rateIn("Senior 2 B");
    const bad = rateIn("Senior 3 C");
    expect(new Set([good, middling, bad]).size).toBe(3);
  });

  it("says which classes have not taken the register", async () => {
    await mount();
    await waitFor(() => expect(screen.getAllByText("Senior 4 D").length).toBe(2));

    const row = screen.getAllByText("Senior 4 D")[0].closest("tr")!;
    expect(within(row).getByText("Not Marked")).toBeInTheDocument();
    expect(screen.getAllByText("Marked").length).toBe(3);
  });

  it("says so when nothing was recorded on the chosen day", async () => {
    await mount({ "/attendance/dashboard": null });
    expect(await screen.findByText("No attendance data")).toBeInTheDocument();
  });

  it("spins rather than claiming no data while it loads", async () => {
    await mount({ "/attendance/dashboard": () => new Promise(() => {}) });
    expect(screen.queryByText("No attendance data")).toBeNull();
  });
});

describe("looking at another day", () => {
  it("asks the API for the date that was chosen", async () => {
    await mount();
    await waitFor(() => expect(screen.getAllByText("Senior 1 A").length).toBe(2));

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Attendance date"), {
        target: { value: "2026-08-03" },
      });
    });

    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(
        ([url, config]: any[]) =>
          String(url).includes("/attendance/dashboard") &&
          config?.params?.date === "2026-08-03",
      );
      expect(asked).toBe(true);
    });
  });

  it("offers a way back to today, but only once you have left it", async () => {
    await mount();
    await waitFor(() => expect(screen.getAllByText("Senior 1 A").length).toBe(2));
    expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Attendance date"), {
        target: { value: "2026-08-03" },
      });
    });

    await click(await screen.findByRole("button", { name: /clear filters/i }));

    expect(screen.getByLabelText("Attendance date")).toHaveValue(
      toLocalDateString(new Date()),
    );
  });
});

describe("who keeps missing school", () => {
  it("flags the count on the tab itself", async () => {
    await mount();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  it("lists them with their absence rate", async () => {
    await mount();
    await click(
      screen.queryAllByRole("button").find((b) => /chronic/i.test(b.textContent ?? "")),
    );

    expect(await screen.findByText("Divine Niyonkuru")).toBeInTheDocument();
    expect(screen.getByText(/Chronically Absent Students \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/above 20%/)).toBeInTheDocument();
  });

  it("says so when nobody is chronically absent", async () => {
    await mount({
      "/attendance/chronic": { count: 0, threshold: 20, students: [] },
    });
    await click(
      screen.queryAllByRole("button").find((b) => /chronic/i.test(b.textContent ?? "")),
    );

    // No badge on the tab, and no table below it.
    expect(screen.getByText(/Chronically Absent Students \(0\)/)).toBeInTheDocument();
    expect(screen.queryByText("Divine Niyonkuru")).toBeNull();
  });

  it("falls back to twenty percent when the server names no threshold", async () => {
    await mount({ "/attendance/chronic": { count: 0, students: [] } });
    await click(
      screen.queryAllByRole("button").find((b) => /chronic/i.test(b.textContent ?? "")),
    );

    expect(screen.getByText(/above 20%/)).toBeInTheDocument();
  });
});
