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
import { cellTexts, renderPage, serve, serveFailure } from "@/test/page";
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

  /**
   * The list answers "who teaches what" and nothing else. Everything about
   * one teacher - their classes, the class they are class teacher of, where
   * they are this period, their own details - lives on their own page, and
   * there was no way to reach it.
   */
  it("opens a teacher when their row is clicked", async () => {
    await mount();
    await click(screen.getByText(/Aline/).closest("tr"));
    expect(h.router.push).toHaveBeenCalledWith("/admin/teachers/u-1");
  });

  it("offers the same thing as a button for the keyboard", async () => {
    await mount();
    await click(screen.getByLabelText(/view aline uwase/i));
    expect(h.router.push).toHaveBeenCalledWith("/admin/teachers/u-1");
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
    expect(
      cellTexts(screen.getByText(/Aline/).closest("tr")!),
    ).toContain("-");
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

/**
 * The staff list at its edges.
 *
 * A school with no teachers on file is the first screen a new deployment
 * shows, and the last page of a large staff list is where the "showing x to y
 * of z" arithmetic goes wrong.
 */
describe("a school with nobody on the staff list", () => {
  const empty = {
    ...routes,
    "/users": { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } },
  };

  it("says so rather than showing an empty table", async () => {
    serve(h.api, empty);
    renderPage(TeachersPage, { role: "ADMIN" });
    expect(await screen.findByText("No teachers found")).toBeInTheDocument();
  });

  it("counts from nought rather than from one", async () => {
    serve(h.api, empty);
    renderPage(TeachersPage, { role: "ADMIN" });
    await screen.findByText("No teachers found");

    // "Showing 1 to 0 of 0" is the classic off-by-one on an empty list.
    expect(screen.getByText(/Showing 0/)).toBeInTheDocument();
  });
});

describe("moving back through the staff list", () => {
  /** Answers with whichever page was asked for. */
  function servePaged() {
    h.api.get.mockImplementation(async (url: string) => {
      const asked = String(url);
      if (asked.startsWith("/academic/assignments")) return { data: assignments };
      if (!asked.startsWith("/users")) return { data: [] };
      const page = Number(new URLSearchParams(asked.split("?")[1]).get("page") ?? 1);
      return {
        data: {
          data: page1.data,
          meta: { total: 45, page, limit: 20, totalPages: 3 },
        },
      };
    });
  }

  it("comes back a page and stops at the first", async () => {
    servePaged();
    renderPage(TeachersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument());

    await click(screen.getByRole("button", { name: /previous page/i }));
    await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("counts the rows on a middle page from the right number", async () => {
    servePaged();
    renderPage(TeachersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument());

    expect(screen.getByText(/Showing 21/)).toBeInTheDocument();
  });
});

describe("searching the staff list from the keyboard", () => {
  it("searches on Enter", async () => {
    await mount();
    const box = screen.getByPlaceholderText(/search by name/i);

    await act(async () => {
      fireEvent.change(box, { target: { value: "uwase" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });

    await waitFor(() => expect(lastUserQuery().search).toBe("uwase"));
  });

  it("ignores every other key", async () => {
    await mount();
    const box = screen.getByPlaceholderText(/search by name/i);

    await act(async () => {
      fireEvent.change(box, { target: { value: "uwase" } });
    });
    h.api.get.mockClear();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Escape" });
    });

    expect(h.api.get).not.toHaveBeenCalled();
  });
});


describe("pressing Enter with nothing typed", () => {
  it("drops the search rather than sending an empty one", async () => {
    serve(h.api, routes);
    renderPage(TeachersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const box = screen.getByPlaceholderText(/search/i);
    await act(async () => {
      fireEvent.change(box, { target: { value: "uwase" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.change(box, { target: { value: "" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });

    await waitFor(() => {
      const last = [...h.api.get.mock.calls]
        .reverse()
        .find(([u]: any[]) => String(u).startsWith("/users?"));
      expect(String(last![0])).not.toMatch(/search=/);
    });
  });
});
