import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    exportData: fn(),
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/export", () => ({ exportData: h.exportData }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/teachers",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classSection, populatedRoutes, subject } from "@/test/fixtures";

import TeachersPage from "./page";

/**
 * The staff list.
 *
 * What a head teacher reads off it is who teaches what, so the assignments
 * column carries the weight. A teacher with none is a teacher nobody has given
 * a class to, and that has to be visible rather than blank.
 */

function teacherRow(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `u-${i}`,
    firstName: ["Aline", "Eric", "Diane"][(i - 1) % 3],
    lastName: ["Uwase", "Niyonkuru", "Mukamana"][(i - 1) % 3],
    email: `teacher${i}@markova.edu`,
    phone: `+25078800001${i}`,
    photoUrl: null,
    role: "TEACHER",
    isActive: true,
    code: `TCH-2026-00${i}`,
    teacher: {
      id: `teacher-${i}`,
      employmentStatus: "FULL_TIME",
      qualification: "A0",
      roles: [],
      teacherSubjectClasses: [],
    },
    ...over,
  };
}

/** Four assignments for teacher-1, so the "+N more" cap is reachable. */
const assignments = [1, 2, 3, 4].map((n) => ({
  id: `assign-${n}`,
  teacherId: "teacher-1",
  subjectId: "subject-1",
  subject: { ...subject, name: `Subject ${n}` },
  classSectionId: "section-1",
  classSection,
}));

const page1 = {
  data: [teacherRow(1), teacherRow(2)],
  meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
};

const routes = {
  ...populatedRoutes,
  "/users": page1,
  "/academic/assignments": assignments,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.exportData.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(TeachersPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function lastUserQuery(): Record<string, string | undefined> {
  const call = [...h.api.get.mock.calls]
    .reverse()
    .find(([url]) => String(url).startsWith("/users?"));
  const qs = String(call?.[0] ?? "").split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(qs).entries());
}

describe("the staff list", () => {
  it("lists the teachers", async () => {
    await mount();
    expect(screen.getByText(/Eric/)).toBeInTheDocument();
  });

  it("asks only for teachers", async () => {
    await mount();
    expect(lastUserQuery().role).toBe("TEACHER");
  });

  // The staff number lives on `user.code`; there is no employeeId on the model,
  // and reading one left this blank for every teacher.
  it("shows each teacher's staff number", async () => {
    await mount();
    expect(screen.getByText("TCH-2026-001")).toBeInTheDocument();
  });

  it("shows how they are employed", async () => {
    await mount();
    const row = screen.getByText(/Aline/).closest("tr")!;
    expect(row.textContent).toMatch(/FULL_TIME/);
  });

  it("leaves a dash where employment was never recorded", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [teacherRow(1, { teacher: { id: "teacher-1", employmentStatus: null } })],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(TeachersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    expect(screen.getByText(/Aline/).closest("tr")!.textContent).toMatch(/—/);
  });

  it("marks a deactivated account as inactive", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [teacherRow(1, { isActive: false })],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(TeachersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Inactive/)).toBeInTheDocument());
  });

  it("does not go blank when the list fails to load", async () => {
    serveFailure(h.api);
    renderPage(TeachersPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("what each teacher teaches", () => {
  it("lists their subjects and classes", async () => {
    await mount();
    const row = screen.getByText(/Aline/).closest("tr")!;
    expect(row.textContent).toMatch(/Subject 1/);
    expect(row.textContent).toMatch(/Senior 1/);
  });

  // Three fit on a row; the rest are counted so the table stays readable.
  it("caps the list and counts the rest", async () => {
    await mount();
    const row = screen.getByText(/Aline/).closest("tr")!;
    expect(row.textContent).toMatch(/\+1 more/);
  });

  // A teacher with nothing to teach is a real state a head teacher acts on.
  it("says so when a teacher has no classes", async () => {
    await mount();
    const row = screen.getByText(/Eric/).closest("tr")!;
    expect(row.textContent).toMatch(/no assignments/i);
  });

  it("keeps one teacher's classes off another's row", async () => {
    await mount();
    expect(screen.getByText(/Eric/).closest("tr")!.textContent).not.toMatch(/Subject 1/);
  });

  it("survives the assignments failing to load", async () => {
    serve(h.api, { ...routes, "/academic/assignments": [] });
    renderPage(TeachersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    expect(screen.getByText(/Aline/).closest("tr")!.textContent).toMatch(/no assignments/i);
  });
});

describe("finding a teacher", () => {
  it("searches as you type, once you stop", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search by name/i), {
        target: { value: "uwase" },
      });
    });

    await waitFor(() => expect(lastUserQuery().search).toBe("uwase"), { timeout: 2000 });
  });

  it("treats a box of spaces as no search", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search by name/i), {
        target: { value: "   " },
      });
    });

    await new Promise((r) => setTimeout(r, 500));
    expect(lastUserQuery().search).toBeUndefined();
  });

  it("drops the filter when the box is emptied", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search by name/i), {
        target: { value: "uwase" },
      });
    });
    await waitFor(() => expect(lastUserQuery().search).toBe("uwase"), { timeout: 2000 });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search by name/i), { target: { value: "" } });
    });
    await waitFor(() => expect(lastUserQuery().search).toBeUndefined(), { timeout: 2000 });
  });
});

describe("paging the list", () => {
  it("cannot go back from the first page", async () => {
    await mount();
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("cannot go past the last page", async () => {
    await mount();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("goes forward when there is more", async () => {
    serve(h.api, {
      ...routes,
      "/users": { ...page1, meta: { total: 45, page: 1, limit: 20, totalPages: 3 } },
    });
    renderPage(TeachersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(lastUserQuery().page).toBe("2"));
  });
});

describe("exporting the staff list", () => {
  async function exportCsv() {
    await mount();
    await click(
      screen.queryAllByRole("button").find((b) => /export/i.test(b.textContent ?? "")),
    );
    const csv = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => /^csv$/i.test((b.textContent ?? "").trim()));
      expect(found).toBeTruthy();
      return found!;
    });
    await click(csv);
  }

  it("writes a row per teacher", async () => {
    await exportCsv();
    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    expect((h.exportData.mock.calls[0][1] as any).data).toHaveLength(2);
  });

  // The export carried an Employee ID column that was always empty, because
  // the field it read does not exist.
  it("carries the staff number, not a field that does not exist", async () => {
    await exportCsv();
    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    const payload = h.exportData.mock.calls[0][1] as any;
    const keys = payload.columns.map((c: any) => c.key);
    expect(keys).toContain("code");
    expect(keys).not.toContain("teacher.employeeId");
    expect(payload.data[0].code).toBe("TCH-2026-001");
  });
});
