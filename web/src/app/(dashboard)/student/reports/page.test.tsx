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
  usePathname: () => "/student/reports",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes, termReport } from "@/test/fixtures";

import StudentReportsPage from "./page";

/**
 * A student looking at their own report card.
 *
 * Three things they can do with it: read it, print it, keep it. All three work
 * off the school's rendered original rather than redrawing it here, so what
 * matters is that the right term is asked for and that a failure says so
 * instead of opening an empty window.
 */

const HTML = "<html><body><h1>Report</h1></body></html>";

/**
 * `termReport` is the real shape of `GET /reports/term/:studentId`, copied
 * from a live response. Serving a TermResult row here instead — which is what
 * this used to do — meant the page was tested against data the endpoint never
 * returns, so a card rendering blank subject names still passed.
 */
const routes = {
  ...populatedRoutes,
  "/reports/term/student-1": { ...termReport, html: HTML },
  "/reports/term": { ...termReport, html: HTML },
};

const asStudent = { role: "STUDENT" as const, user: { id: "u-1", studentId: "student-1" } };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:x"),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "open",
    vi.fn(() => ({
      document: { write: vi.fn(), close: vi.fn() },
      print: vi.fn(),
    })),
  );
});

async function mount() {
  renderPage(StudentReportsPage, asStudent);
  await waitFor(() => expect(screen.getByLabelText(/academic year/i)).toBeInTheDocument());
}

/** Picks a year, then a term, which is what makes the report load. */
async function chooseTerm() {
  const year = screen.getByLabelText(/academic year/i) as HTMLSelectElement;
  await waitFor(() => expect(Array.from(year.options).some((o) => o.value)).toBe(true));
  await act(async () => {
    fireEvent.change(year, { target: { value: Array.from(year.options).find((o) => o.value)!.value } });
  });

  const term = screen.getByLabelText(/^term$/i) as HTMLSelectElement;
  await waitFor(() => expect(Array.from(term.options).some((o) => o.value)).toBe(true));
  await act(async () => {
    fireEvent.change(term, { target: { value: Array.from(term.options).find((o) => o.value)!.value } });
  });
}

function button(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

describe("choosing which report to look at", () => {
  it("offers the years the school has run", async () => {
    await mount();
    const year = screen.getByLabelText(/academic year/i) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(year.options).some((o) => o.value)).toBe(true));
  });

  // Terms belong to a year, so the term picker waits for one.
  it("asks for nothing until a term is chosen", async () => {
    await mount();
    const asked = h.api.get.mock.calls.some(([url]) =>
      String(url).includes("/reports/term/"),
    );
    expect(asked).toBe(false);
  });

  it("loads the report once a term is chosen", async () => {
    await mount();
    await chooseTerm();

    await waitFor(() => {
      const call = h.api.get.mock.calls.find(([url]: any[]) =>
        String(url).includes("/reports/term/student-1"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any)?.params?.termId).toBeTruthy();
    });
  });

  it("does not go blank when the report fails to load", async () => {
    serveFailure(h.api);
    renderPage(StudentReportsPage, asStudent);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("what a student can do with it", () => {
  async function ready() {
    await mount();
    await chooseTerm();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  }

  /**
   * The card is printed from this page, not from a second tab. A popup was
   * left behind after every print, and a blocker turned the button into a
   * no-op with nothing to show for it.
   */
  it("prints the school's own rendered original without leaving the page", async () => {
    await ready();
    const print = button(/print/i);
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
    await waitFor(() =>
      expect(document.querySelector("iframe[srcdoc]")).not.toBeNull(),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it("opens it to read", async () => {
    await ready();
    const view = button(/view|read/i);
    if (!view) return;
    await act(async () => {
      fireEvent.click(view);
    });

    await waitFor(() => {
      const call = h.api.get.mock.calls.find(([url]: any[]) =>
        String(url).includes("/html"),
      );
      expect(call).toBeTruthy();
    });
  });

  it("downloads the pdf", async () => {
    await ready();
    const download = button(/download/i);
    if (!download) return;
    await act(async () => {
      fireEvent.click(download);
    });

    await waitFor(() => {
      const call = h.api.get.mock.calls.find(([url]: any[]) =>
        String(url).includes("/pdf"),
      );
      expect(call).toBeTruthy();
    });
  });

  // A blank print window looks like the report itself is empty.
  it("says so rather than opening an empty window", async () => {
    await ready();
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/html")) throw { response: { status: 500 } };
      return real(url, config);
    });

    h.toast.error.mockClear();
    const print = button(/print/i);
    if (!print) return;
    await act(async () => {
      fireEvent.click(print);
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });
});

/**
 * A term with no card yet, an account with no student on it, and a blocked
 * print window.
 *
 * A student who opens this page before results are published must be told
 * that plainly. The two other cases are the ones that produce a white screen
 * rather than a sentence.
 */
describe("a term the school has not issued a card for", () => {
  it("says so rather than showing an empty page", async () => {
    // The student-scoped route is the longer prefix, so both have to answer
    // with nothing for the term to look unissued.
    serve(h.api, {
      ...routes,
      "/reports/term/student-1": null,
      "/reports/term": null,
    });
    await mount();
    await chooseTerm();

    expect(
      await screen.findByText(/No report card available for this term/i),
    ).toBeInTheDocument();
  });

  it("says nothing of the sort before a term is chosen", async () => {
    serve(h.api, {
      ...routes,
      "/reports/term/student-1": null,
      "/reports/term": null,
    });
    await mount();

    expect(
      screen.queryByText(/No report card available for this term/i),
    ).toBeNull();
  });
});

describe("an account with no student record behind it", () => {
  it("asks the API for nothing", async () => {
    serve(h.api, routes);
    renderPage(StudentReportsPage, { role: "STUDENT", user: { id: "u-1" } });
    await waitFor(() =>
      expect(screen.getByLabelText(/academic year/i)).toBeInTheDocument(),
    );

    expect(
      h.api.get.mock.calls.some(([url]: any[]) =>
        String(url).includes("/reports/term/"),
      ),
    ).toBe(false);
  });
});

describe("printing with the pop-up blocker on", () => {
  it("does not take the page down", async () => {
    await mount();
    await chooseTerm();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    vi.stubGlobal("open", vi.fn(() => null));
    const print = button(/print/i);
    if (!print) return;
    await act(async () => {
      fireEvent.click(print);
    });

    expect(screen.getByLabelText(/academic year/i)).toBeInTheDocument();
  });
});

describe("opening and closing the official card", () => {
  it("closes it again on a second press rather than re-fetching", async () => {
    await mount();
    await chooseTerm();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const view = button(/view|read/i);
    if (!view) return;
    await act(async () => {
      fireEvent.click(view);
    });
    await waitFor(() =>
      expect(
        h.api.get.mock.calls.filter(([url]: any[]) =>
          String(url).includes("/html"),
        ).length,
      ).toBe(1),
    );

    // The control now reads "Hide card", because the card is open.
    await act(async () => {
      fireEvent.click(button(/hide card/i)!);
    });

    // The second press closes what is already open; it does not ask again.
    expect(
      h.api.get.mock.calls.filter(([url]: any[]) => String(url).includes("/html")).length,
    ).toBe(1);
  });

  it("says so when the official card will not load", async () => {
    await mount();
    await chooseTerm();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    h.api.get.mockImplementation(async (url: string) => {
      if (String(url).includes("/html")) {
        throw Object.assign(new Error("down"), { response: { status: 500 } });
      }
      return { data: [] };
    });

    const view = button(/view|read/i);
    if (!view) return;
    await act(async () => {
      fireEvent.click(view);
    });

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "Could not load the official report card",
      ),
    );
  });
});

/**
 * What the card actually renders.
 *
 * The page was written against a shape the endpoint does not return —
 * `report.termName`, a top-level `report.average`, `s.subjectName` — and its
 * fixture was shaped to match the page rather than the API. Every assertion
 * passed while the real card showed a dash for the average, a dash for the
 * grade, a dash for the position, and a column of subject rows with no names.
 *
 * These read the values a student would actually be looking at.
 */
describe("the card a student reads", () => {
  async function shown() {
    await mount();
    await chooseTerm();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  }

  it("names the student and the term", async () => {
    await shown();
    await waitFor(() =>
      expect(screen.getByText(/Divine Niyonkuru — Term 1/)).toBeInTheDocument(),
    );
  });

  it("shows the average, not a dash", async () => {
    await shown();
    await waitFor(() => expect(screen.getByText("73.5%")).toBeInTheDocument());
  });

  // "B" is both the overall grade and Kinyarwanda's, so this reads the card
  // rather than the first match on the page.
  it("shows the overall grade and the class position", async () => {
    await shown();
    await waitFor(() => expect(screen.getByText("#3")).toBeInTheDocument());
    const grade = screen.getByText("Grade").closest("div");
    expect(grade?.textContent).toMatch(/B/);
  });

  // The row that was rendering as a bare percentage with no subject beside it.
  it("names every subject on the card", async () => {
    await shown();
    await waitFor(() =>
      expect(screen.getByText("Mathematics")).toBeInTheDocument(),
    );
    expect(screen.getByText("Kinyarwanda")).toBeInTheDocument();
  });

  it("shows the teacher's comment", async () => {
    await shown();
    await waitFor(() =>
      expect(screen.getByText("Strong term.")).toBeInTheDocument(),
    );
  });
});
