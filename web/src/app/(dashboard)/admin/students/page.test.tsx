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
  usePathname: () => "/admin/students",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, populatedRoutes } from "@/test/fixtures";

import StudentsPage from "./page";

/**
 * The school roll.
 *
 * Every column here answers a question an admin actually asks: which class,
 * boy or girl, who do I call. Three of those columns were rendering blank
 * against real data because the list endpoint did not send the fields, so the
 * tests below assert the values, not merely that a cell exists.
 */

/** A row shaped the way `/users?role=STUDENT` really answers. */
function studentRow(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `u-${i}`,
    // Rows are numbered from 1, so student 1 is Divine.
    firstName: ["Divine", "Keza", "Aline", "Mugisha"][(i - 1) % 4],
    lastName: ["Niyonkuru", "Mutesi", "Uwase", "Habimana"][(i - 1) % 4],
    email: `student${i}@markova.edu`,
    phone: null,
    photoUrl: null,
    role: "STUDENT",
    isActive: true,
    code: null,
    student: {
      id: `student-${i}`,
      studentIdNumber: `STD-2025-${String(i).padStart(4, "0")}`,
      classSectionId: "section-1",
      status: "ACTIVE",
      gender: i % 2 === 1 ? "MALE" : "FEMALE",
      classSection,
      parentStudents: [
        {
          relationship: "Mother",
          parent: {
            firstName: "Winnie",
            lastName: "Nyirarukundo",
            phone: "+250786525977",
          },
        },
      ],
    },
    ...over,
  };
}

const page1 = {
  data: [studentRow(1), studentRow(2), studentRow(3)],
  meta: { total: 45, page: 1, limit: 20, totalPages: 3 },
};

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/users": page1,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  h.exportData.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(StudentsPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

/**
 * The filters the page last asked the users endpoint for.
 *
 * useUsers builds a query string into the url rather than passing an axios
 * params object, so the filters have to be read back off the url.
 */
function lastUserQuery(): Record<string, string | undefined> {
  const call = [...h.api.get.mock.calls]
    .reverse()
    .find(([url]) => String(url).startsWith("/users?"));
  if (!call) return {};
  const qs = String(call[0]).split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(qs).entries());
}

describe("the roll", () => {
  it("lists the students", async () => {
    await mount();
    expect(screen.getByText(/Keza/)).toBeInTheDocument();
  });

  it("says how many are enrolled", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/45/);
  });

  it("asks only for students", async () => {
    await mount();
    expect(lastUserQuery().role).toBe("STUDENT");
  });

  // The roll opens on today's school. Alumni and leavers are three years of
  // extra rows that would bury the current students.
  it("opens on the students who are here now", async () => {
    await mount();
    expect(lastUserQuery().studentStatus).toBe("ACTIVE");
  });

  it("does not go blank when the roll fails to load", async () => {
    serveFailure(h.api);
    renderPage(StudentsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("says so when nobody matches", async () => {
    serve(h.api, {
      ...routes,
      "/users": { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
    });
    renderPage(StudentsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/no students found/i)).toBeInTheDocument(),
    );
  });
});

/**
 * These three columns each rendered blank against the real API. The values are
 * asserted rather than the cells, because a cell that exists and says nothing
 * is exactly the bug.
 */
describe("what each row has to show", () => {
  it("shows the student's number", async () => {
    await mount();
    const row = screen.getByText(/Divine/).closest("tr")!;
    expect(row.textContent).toMatch(/STD-2025-0001/);
  });

  it("shows which class they are in", async () => {
    await mount();
    const row = screen.getByText(/Divine/).closest("tr")!;
    expect(row.textContent).toMatch(/Senior 1/);
  });

  // The list query has to select `gender`, or this reads "—" for everyone.
  it("shows their gender, not a dash", async () => {
    await mount();
    const row = screen.getByText(/Divine/).closest("tr")!;
    expect(row.textContent).toMatch(/FEMALE|MALE/);
  });

  // Students carry no phone of their own, so the contact worth showing is a
  // parent's. This read a `parentUser` field that does not exist.
  it("shows a parent to call", async () => {
    await mount();
    const row = screen.getByText(/Divine/).closest("tr")!;
    expect(row.textContent).toMatch(/Winnie Nyirarukundo/);
    expect(row.textContent).toMatch(/\+250786525977/);
  });

  it("names the relationship rather than guessing", async () => {
    await mount();
    const row = screen.getByText(/Divine/).closest("tr")!;
    expect(row.textContent).toMatch(/Mother/);
  });

  it("says Parent when no relationship was recorded", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [
          studentRow(1, {
            student: {
              ...studentRow(1).student,
              parentStudents: [
                { relationship: null, parent: { firstName: "Jean", lastName: "Habimana", phone: null } },
              ],
            },
          }),
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(StudentsPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Jean Habimana/)).toBeInTheDocument());
    expect(screen.getByText(/Parent:/)).toBeInTheDocument();
  });

  it("survives a student with no parent linked", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [studentRow(1, { student: { ...studentRow(1).student, parentStudents: [] } })],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(StudentsPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  });

  // A leaver has to read as a leaver, not as a current student.
  it("marks a graduated student as graduated", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [studentRow(1, { student: { ...studentRow(1).student, status: "GRADUATED" } })],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(StudentsPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Graduated/)).toBeInTheDocument());
  });

  it("marks a transferred student as transferred", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [studentRow(1, { student: { ...studentRow(1).student, status: "TRANSFERRED" } })],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(StudentsPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Transferred/)).toBeInTheDocument());
  });
});

describe("finding one student", () => {
  const box = () => screen.getByLabelText(/search by name/i) as HTMLInputElement;

  async function type(text: string) {
    await act(async () => {
      fireEvent.change(box(), { target: { value: text } });
    });
  }

  it("searches as you type, once you stop", async () => {
    await mount();
    await type("keza");

    await waitFor(() => expect(lastUserQuery().search).toBe("keza"), {
      timeout: 2000,
    });
  });

  // Pressing Enter is how anyone who types fast expects to search.
  it("searches at once on Enter", async () => {
    await mount();
    await type("mutesi");
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter", code: "Enter" });
    });

    await waitFor(() => expect(lastUserQuery().search).toBe("mutesi"));
  });

  // A search that kept you on page 4 would look like it found nothing.
  it("returns to the first page when a search runs", async () => {
    await mount();
    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(lastUserQuery().page).toBe("2"));

    await type("keza");
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter", code: "Enter" });
    });

    await waitFor(() => expect(lastUserQuery().page).toBe("1"));
  });

  it("drops the filter again when the box is emptied", async () => {
    await mount();
    await type("keza");
    await waitFor(() => expect(lastUserQuery().search).toBe("keza"), { timeout: 2000 });

    await type("");
    await waitFor(() => expect(lastUserQuery().search).toBeUndefined(), {
      timeout: 2000,
    });
  });

  it("treats a box of spaces as no search", async () => {
    await mount();
    await type("   ");
    await new Promise((r) => setTimeout(r, 500));
    expect(lastUserQuery().search).toBeUndefined();
  });
});

describe("narrowing to one class", () => {
  it("offers the levels the school runs", async () => {
    await mount();
    const level = screen.getByLabelText(/all levels/i) as HTMLSelectElement;
    expect(Array.from(level.options).map((o) => o.textContent)).toContain("Senior 1");
  });

  // The class picker only makes sense once a level is chosen.
  it("offers classes only after a level is picked", async () => {
    await mount();
    const before = document.querySelectorAll("select").length;

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all levels/i), {
        target: { value: "level-1" },
      });
    });

    await waitFor(() =>
      expect(document.querySelectorAll("select").length).toBeGreaterThan(before),
    );
  });

  it("asks for just that class once one is chosen", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all levels/i), {
        target: { value: "level-1" },
      });
    });

    const section = await waitFor(() => {
      const found = Array.from(document.querySelectorAll("select")).find((s) =>
        Array.from(s.options).some((o) => o.value === "section-1"),
      );
      expect(found).toBeTruthy();
      return found!;
    });
    await act(async () => {
      fireEvent.change(section, { target: { value: "section-1" } });
    });

    await waitFor(() => expect(lastUserQuery().classSectionId).toBe("section-1"));
  });

  it("goes back to the first page when the level changes", async () => {
    await mount();
    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(lastUserQuery().page).toBe("2"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all levels/i), {
        target: { value: "level-1" },
      });
    });

    await waitFor(() => expect(lastUserQuery().page).toBe("1"));
  });
});

describe("moving through the pages", () => {
  /**
   * Answers with the page that was actually asked for.
   *
   * The flat fixture always claims to be page 1, and a revisited page comes
   * from the query cache without a new request, so both the indicator and the
   * request log would say "page 1" no matter what the buttons did.
   */
  function servePaged() {
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      const s = String(url);
      if (s.startsWith("/users?")) {
        const page = Number(new URLSearchParams(s.split("?")[1]).get("page") || 1);
        return {
          data: {
            data: [studentRow(page)],
            meta: { total: 45, page, limit: 20, totalPages: 3 },
          },
          status: 200,
        };
      }
      return real(url, config);
    });
  }

  it("says which page it is on", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Page 1 of 3/);
  });

  it("says which rows are showing", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/1.*20.*of.*45/);
  });

  it("cannot go back from the first page", async () => {
    await mount();
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("goes forward", async () => {
    servePaged();
    await mount();
    await click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => expect(document.body.textContent).toMatch(/Page 2 of 3/));
    expect(document.body.textContent).toMatch(/21.*40.*of.*45/);
  });

  it("comes back again", async () => {
    servePaged();
    await mount();
    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Page 2 of 3/));

    await click(screen.getByRole("button", { name: /previous page/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Page 1 of 3/));
  });

  it("disables going back once it is home again", async () => {
    servePaged();
    await mount();
    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Page 2 of 3/));
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();

    await click(screen.getByRole("button", { name: /previous page/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled(),
    );
  });

  it("cannot go past the last page", async () => {
    serve(h.api, {
      ...routes,
      "/users": { ...page1, meta: { total: 3, page: 1, limit: 20, totalPages: 1 } },
    });
    renderPage(StudentsPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });
});

describe("opening one student", () => {
  it("goes to their record when the row is tapped", async () => {
    await mount();
    await click(screen.getByText(/Divine/).closest("tr"));

    await waitFor(() =>
      expect(h.router.push).toHaveBeenCalledWith("/admin/students/student-1"),
    );
  });

  // A user row with no student record has nowhere to go, and must not navigate
  // to /admin/students/undefined.
  it("goes nowhere when there is no student record behind the row", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [{ ...studentRow(1), student: null }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(StudentsPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    h.router.push.mockClear();
    await click(screen.getByText(/Divine/).closest("tr"));
    expect(h.router.push).not.toHaveBeenCalled();
  });
});

describe("exporting the roll", () => {
  async function exportAs(format: RegExp) {
    await mount();
    await click(
      screen.queryAllByRole("button").find((b) => /export/i.test(b.textContent ?? "")),
    );
    const item = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => format.test((b.textContent ?? "").trim()));
      expect(found).toBeTruthy();
      return found!;
    });
    await click(item);
  }

  it("writes a row per student", async () => {
    await exportAs(/^csv$/i);
    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    const payload = h.exportData.mock.calls[0][1] as any;
    expect(payload.data).toHaveLength(3);
  });

  // The export carried a Gender column that was empty for the same reason the
  // table's was.
  it("carries the gender the table shows", async () => {
    await exportAs(/^csv$/i);
    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    const payload = h.exportData.mock.calls[0][1] as any;
    expect(payload.columns.map((c: any) => c.key)).toContain("student.gender");
    expect(payload.data[0].student.gender).toBeTruthy();
  });

  it("names the file for what it holds", async () => {
    await exportAs(/^csv$/i);
    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    expect((h.exportData.mock.calls[0][1] as any).filename).toBe("students");
  });
});

/**
 * Former students, and the way back through the roll.
 *
 * The roll opens on today's school, so leavers are behind a filter. An office
 * looking up an old transcript needs that filter to actually drop the
 * constraint rather than silently sending an empty one.
 */
describe("looking beyond today's school", () => {
  it("opens on the current students only", async () => {
    await mount();
    expect(lastUserQuery().studentStatus).toBe("ACTIVE");
  });

  it("drops the constraint entirely for all statuses", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/filter students by status/i), {
        target: { value: "" },
      });
    });

    // An empty studentStatus would be a filter for students whose status is
    // the empty string, which is nobody.
    await waitFor(() => expect(lastUserQuery().studentStatus).toBeUndefined());
  });

  it("goes back to the first page when the status changes", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/filter students by status/i), {
        target: { value: "GRADUATED" },
      });
    });

    await waitFor(() => expect(lastUserQuery().page).toBe("1"));
    expect(lastUserQuery().studentStatus).toBe("GRADUATED");
  });

  it("marks a student who left under a cloud as inactive", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [
          studentRow(1, {
            isActive: false,
            student: { ...studentRow(1).student, status: undefined },
          }),
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
    renderPage(StudentsPage, { role: "ADMIN" });

    // No status recorded, so the badge falls back to the account itself.
    await waitFor(() => expect(screen.getByText("Inactive")).toBeInTheDocument());
  });
});

describe("coming back through the roll", () => {
  it("returns to the page before and stops at the first", async () => {
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      const s = String(url);
      if (s.startsWith("/users?")) {
        const page = Number(new URLSearchParams(s.split("?")[1]).get("page") || 1);
        return {
          data: {
            data: [studentRow(page)],
            meta: { total: 45, page, limit: 20, totalPages: 3 },
          },
          status: 200,
        };
      }
      return real(url, config);
    });

    await mount();
    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Page 2 of 3/));

    await click(screen.getByRole("button", { name: /previous page/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Page 1 of 3/));
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });
});

describe("searching the roll from the keyboard", () => {
  it("drops the search entirely when the box is cleared", async () => {
    await mount();
    const box = screen.getByLabelText(/search by name/i);

    await act(async () => {
      fireEvent.change(box, { target: { value: "uwase" } });
    });
    await waitFor(() => expect(lastUserQuery().search).toBe("uwase"));

    await act(async () => {
      fireEvent.change(box, { target: { value: "" } });
    });

    // An empty search would match nobody rather than everybody.
    await waitFor(() => expect(lastUserQuery().search).toBeUndefined());
  });
});
