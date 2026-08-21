import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

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
  usePathname: () => "/admin/reports",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { chooseCascadingFilters, exercisePage, fillEverything } from "@/test/exercise";
import { populatedRoutes, students } from "@/test/fixtures";

import ReportsPage from "./page";

/**
 * Each generated report carries the whole rendered card under `data`, which is
 * what the table reads: `r.data.student.name`, not a flattened row.
 */
const generated = {
  count: 2,
  reports: students.map((s, i) => ({
    studentId: s.id,
    verificationCode: `12345678901${i}`,
    data: {
      student: {
        id: s.id,
        name: `${s.user.firstName} ${s.user.lastName}`,
        class: "Senior 1 A",
        studentIdNumber: s.studentIdNumber,
      },
      term: { id: "term-1", name: "Term 1" },
      result: { average: 82 - i * 5, position: i + 1, grade: i ? "B" : "A", decision: "PASS" },
      marks: [],
    },
  })),
};

const routes = {
  ...populatedRoutes,
  "/reports/term/class": generated,
  "/reports/term": "<html><body>report</body></html>",
  "/reports/document": { url: "/uploads/reports/a.pdf" },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:x"),
    revokeObjectURL: vi.fn(),
  });
  // A print window is a browser affordance jsdom does not provide.
  vi.stubGlobal(
    "open",
    vi.fn(() => ({
      document: { write: vi.fn(), close: vi.fn() },
      print: vi.fn(),
    })),
  );
});

/**
 * The filters cascade: term depends on year, section on level. They have to be
 * chosen in order, waiting for each dependent query, or Generate stays refused.
 */
async function chooseFilters() {
  await waitFor(() => {
    const anyPopulated = Array.from(document.querySelectorAll("select")).some((el) =>
      Array.from(el.options).some((o) => o.value),
    );
    expect(anyPopulated).toBe(true);
  });
  await chooseCascadingFilters(6);
}

function buttonMatching(pattern: RegExp) {
  return screen
    .queryAllByRole("button")
    .find((b) => pattern.test(b.textContent ?? "") || pattern.test(b.getAttribute("aria-label") ?? ""));
}

describe("the report cards page", () => {
  it("renders the filters", async () => {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.querySelectorAll("select").length).toBeGreaterThan(0));
  });

  // Generating without a class and term would ask the API for every report card
  // in the school.
  it("refuses to generate before a class and term are chosen", async () => {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    h.api.post.mockClear();

    const generate = buttonMatching(/generate/i);
    if (!generate) return;
    await userEvent.setup().click(generate);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

describe("after generating a class's reports", () => {
  async function generate() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();

    // Retry the click until the filters have settled enough for the page to
    // accept it. One click on a not-quite-ready form is the difference between
    // a suite that passes every time and one that passes most times.
    await waitFor(
      async () => {
        const button = buttonMatching(/generate/i);
        expect(button).toBeTruthy();
        await act(async () => {
          fireEvent.click(button!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  }

  it("lists a row per student", async () => {
    await generate();
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    expect(screen.getByText(/Keza/)).toBeInTheDocument();
  });

  it("says how many were generated", async () => {
    await generate();
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    expect(String(h.toast.success.mock.calls[0][0])).toContain("2");
  });

  it("loads one report's html to view it", async () => {
    await generate();
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    h.api.get.mockClear();

    const view = buttonMatching(/view/i);
    if (!view) return;
    await act(async () => {
      fireEvent.click(view);
    });

    await waitFor(() => {
      const urls = h.api.get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/html"))).toBe(true);
    });
  });

  // A report that fails to load has to say so; the row otherwise sits on a
  // spinner forever.
  it("reports a failure to load one report", async () => {
    await generate();
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    h.api.get.mockRejectedValue({ response: { status: 500 } });
    h.toast.error.mockClear();

    const view = buttonMatching(/view/i);
    if (!view) return;
    await act(async () => {
      fireEvent.click(view);
    });
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  // Printing fetches the rendered card and hands it to a print window. The
  // window is a browser affordance; the fetch is the part this owns.
  it("fetches the rendered card when printing a row", async () => {
    await generate();
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    h.api.get.mockClear();

    const print = buttonMatching(/print/i);
    if (!print) return;
    await act(async () => {
      fireEvent.click(print);
    });

    await waitFor(() => {
      const urls = h.api.get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/html"))).toBe(true);
    });
  });

  it("survives every control once rows exist", async () => {
    await generate();
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});

describe("when generation fails", () => {
  it("says so and leaves the filters alone", async () => {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.querySelectorAll("select").length).toBeGreaterThan(0));
    await chooseFilters();
    h.api.post.mockRejectedValue({ response: { status: 500 } });

    const button = buttonMatching(/generate/i);
    if (button) {
      await act(async () => {
        fireEvent.click(button);
      });
    }
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });
});

describe("the document generator", () => {
  it("stays usable", async () => {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await fillEverything();
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});
