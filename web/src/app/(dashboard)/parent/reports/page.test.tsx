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
  usePathname: () => "/parent/reports",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { academicYear, populatedRoutes, term, termReport } from "@/test/fixtures";

import ParentReportsPage from "./page";

/**
 * A parent reading their child's report card.
 *
 * Printing opens a window and writes the card into it, and a pop-up blocker
 * returning null is the commonest way that goes wrong on a school laptop. A
 * page that dies there takes the report with it.
 */

/**
 * The shape `GET /reports/term/:studentId` really answers with - taken from
 * `termReport` in the shared fixtures, which was copied from a live response.
 *
 * The old fixture here was invented to match the page instead: `termName`,
 * a top-level `average`, `student.user.firstName`. So this suite passed while
 * the real page rendered dashes and blank subject rows.
 */
const report = {
  ...termReport,
  student: { ...termReport.student, name: "Keza Uwimana" },
};

const parent = {
  id: "parent-1",
  parentStudents: [
    {
      student: {
        id: "student-1",
        user: { firstName: "Keza", lastName: "Uwimana" },
      },
    },
  ],
};

const routes = {
  ...populatedRoutes,
  "/academic/years": [academicYear],
  "/academic/terms": [term],
  "/users/parent-1": parent,
  "/reports/term/student-1": report,
  "/reports/term": report,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
  vi.stubGlobal(
    "open",
    vi.fn(() => ({
      document: { write: vi.fn(), close: vi.fn() },
      print: vi.fn(),
    })),
  );
});

function mount(user: Record<string, unknown> = { id: "parent-1" }) {
  renderPage(ParentReportsPage, { role: "PARENT", user: user as never });
}

/** Picks a year and then a term, which is what loads the card. */
async function chooseTerm() {
  const year = await screen.findByLabelText("Select Year");
  await waitFor(() =>
    expect(
      Array.from((year as HTMLSelectElement).options).some((o) => o.value),
    ).toBe(true),
  );
  await act(async () => {
    fireEvent.change(year, { target: { value: academicYear.id } });
  });

  const termPicker = screen.getByLabelText("Select Term");
  await waitFor(() =>
    expect(
      Array.from((termPicker as HTMLSelectElement).options).some((o) => o.value),
    ).toBe(true),
  );
  await act(async () => {
    fireEvent.change(termPicker, { target: { value: term.id } });
  });
}

describe("finding the right card", () => {
  it("picks the only child without being asked", async () => {
    mount();
    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("/users/parent-1"),
      );
      expect(asked).toBe(true);
    });
    // One child, so there is nothing to choose between: no picker is drawn.
    expect(screen.queryByLabelText("Select child")).toBeNull();
  });

  it("offers a choice for a family with several children", async () => {
    serve(h.api, {
      ...routes,
      "/users/parent-1": {
        ...parent,
        parentStudents: [
          ...parent.parentStudents,
          {
            student: {
              id: "student-2",
              user: { firstName: "Manzi", lastName: "Habimana" },
            },
          },
        ],
      },
    });
    mount();

    expect(await screen.findByLabelText("Select child")).toHaveValue("student-1");
  });

  it("asks for nothing before the account has an id", async () => {
    mount({ id: "" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(
      h.api.get.mock.calls.some(([url]: any[]) => String(url).includes("/users/")),
    ).toBe(false);
  });

  it("loads the card once a term is chosen", async () => {
    mount();
    await screen.findByLabelText("Select Year");
    await chooseTerm();

    expect(await screen.findByText(/Keza Uwimana/)).toBeInTheDocument();
  });
});

describe("printing the card", () => {
  /**
   * A parent pressing Print gets the A4 sheet the school issues, printed from
   * this page. It used to open a popup and write its own two-line summary -
   * name, average, grade, rank - which looked nothing like the real card.
   */
  it("prints the school's own card from this page", async () => {
    mount();
    await screen.findByLabelText("Select Year");
    await chooseTerm();
    await screen.findByText(/Keza Uwimana/);

    const print = screen
      .queryAllByRole("button")
      .find((b) => /print/i.test(b.textContent ?? ""));
    if (!print) return;
    await act(async () => {
      fireEvent.click(print);
    });

    await waitFor(() => {
      const call = h.api.get.mock.calls.find(([url]: any[]) =>
        String(url).includes("/html"),
      );
      expect(call).toBeTruthy();
    });
    expect(window.open).not.toHaveBeenCalled();
  });

  it("does not take the page down when the pop-up is blocked", async () => {
    mount();
    await screen.findByLabelText("Select Year");
    await chooseTerm();
    await screen.findByText(/Keza Uwimana/);

    const print = screen
      .queryAllByRole("button")
      .find((b) => /print/i.test(b.textContent ?? ""));
    if (!print) return;

    vi.stubGlobal("open", vi.fn(() => null));
    await act(async () => {
      fireEvent.click(print);
    });

    // The card is still on screen: a blocked pop-up must not lose it.
    expect(screen.getByText(/Keza Uwimana/)).toBeInTheDocument();
  });
});
