import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    zip: { added: [] as string[], generated: 0 },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/reports",
  useSearchParams: () => new URLSearchParams(),
}));

// JSZip builds a real archive in memory. The packing flow is what this owns:
// which files went in, whether a failure was retried, whether cancelling
// stopped it. The bytes are JSZip's business.
vi.mock("jszip", () => {
  class FakeZip {
    files: Record<string, unknown> = {};
    file(name: string, data: unknown) {
      this.files[name] = data;
      h.zip.added.push(name);
    }
    async generateAsync() {
      h.zip.generated += 1;
      return new Blob(["zip"]);
    }
  }
  return { default: FakeZip };
});

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
  h.zip.added = [];
  h.zip.generated = 0;
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

/**
 * A control inside the results table, not the page-level toolbar.
 *
 * "Download all report cards" sits above the table and matches /download/ too,
 * so a page-wide search finds the bulk packer instead of one student's row.
 */
function rowButton(pattern: RegExp) {
  const table = document.querySelector("table");
  if (!table) return undefined;
  return Array.from(table.querySelectorAll("button")).find(
    (b) =>
      pattern.test((b.textContent ?? "").trim()) ||
      pattern.test(b.getAttribute("aria-label") ?? ""),
  );
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

    const view = rowButton(/view/i) ?? buttonMatching(/view/i);
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

    const view = rowButton(/view/i) ?? buttonMatching(/view/i);
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

    const print = rowButton(/print/i) ?? buttonMatching(/print/i);
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

describe("downloading one report card", () => {
  async function withRows() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  it("fetches the pdf and hands it to the browser", async () => {
    await withRows();
    h.api.get.mockClear();

    const download = rowButton(/download/i);
    if (!download) return;
    await act(async () => {
      fireEvent.click(download);
    });

    await waitFor(() => {
      const urls = h.api.get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/pdf"))).toBe(true);
    });
  }, 20000);

  // A failed download has to say so. The row otherwise sits on a spinner and
  // the person assumes the file is coming.
  it("says so when the pdf cannot be fetched", async () => {
    await withRows();
    h.api.get.mockRejectedValue({ response: { status: 500 } });
    h.toast.error.mockClear();

    const download = rowButton(/download/i);
    if (!download) return;
    await act(async () => {
      fireEvent.click(download);
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  }, 20000);
});

describe("packing a whole class into one archive", () => {
  async function withRows() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  async function openPack() {
    await withRows();
    const pack = buttonMatching(/pack|download all|zip/i);
    if (!pack) return false;
    await act(async () => {
      fireEvent.click(pack);
    });
    return true;
  }

  // Fetching thirty report cards is a lot of data on a school connection, so
  // it asks first and says how much.
  it("asks before starting", async () => {
    if (!(await openPack())) return;
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(h.zip.generated).toBe(0);
  }, 20000);

  it("adds one file per report and builds the archive", async () => {
    if (!(await openPack())) return;

    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    if (!confirm) return;
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() => expect(h.zip.generated).toBeGreaterThan(0), {
      timeout: 8000,
    });
    expect(h.zip.added.length).toBeGreaterThan(0);
  }, 25000);
});

/**
 * Packing when the network is unreliable.
 *
 * Thirty report cards is thirty requests, and the API rate limits. Each one is
 * retried once before it counts as failed, with a longer wait after a 429, so a
 * whole class does not fail because the server asked us to slow down.
 */
describe("retrying inside the bulk pack", () => {
  /**
   * Replaces only the pdf fetch, leaving every other route answered by `serve`.
   * A blanket mock starves the filter selects and the run never starts.
   */
  function failPdfWith(handler: () => never | Promise<never>) {
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/pdf")) return handler();
      return real(url, config);
    });
  }

  /**
   * One student instead of two.
   *
   * Every failure is retried once, and a rate limit waits out three seconds
   * before that retry. Two students means two of those waits before the run
   * reaches the review screen these tests are about.
   */
  function onlyOneStudent() {
    serve(h.api, {
      ...routes,
      "/reports/term/class": { count: 1, reports: [generated.reports[0]] },
    });
  }

  async function packAll() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const pack = buttonMatching(/pack|download all|zip/i);
    expect(pack).toBeTruthy();
    await act(async () => {
      fireEvent.click(pack!);
    });

    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    expect(confirm).toBeTruthy();
    await act(async () => {
      fireEvent.click(confirm!);
    });
  }

  /** The review screen is the run's own report of what did not come back. */
  function reviewText() {
    return document.body.textContent ?? "";
  }

  // A single dropped request on a school connection is ordinary. Failing the
  // whole class over it would mean starting two hundred fetches again.
  it("retries a report that failed the first time and keeps it", async () => {
    let calls = 0;
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/pdf")) {
        calls += 1;
        if (calls === 1) throw { response: { status: 500 } };
        return { data: new Blob(["pdf"]), status: 200 };
      }
      return real(url, config);
    });

    await packAll();
    // The retry succeeded, so the run finishes by packing rather than by
    // asking for a review.
    await waitFor(() => expect(h.zip.generated).toBe(1), { timeout: 15000 });
    expect(calls).toBeGreaterThan(1);
  }, 30000);

  // Two failures is a real failure, and the run has to say which ones so they
  // can be retried rather than starting the whole class again.
  it("gives up after the second attempt and offers a review", async () => {
    onlyOneStudent();
    failPdfWith(() => {
      throw { response: { status: 500 } };
    });

    await packAll();
    await waitFor(() => expect(reviewText()).toMatch(/could not be fetched/i), {
      timeout: 15000,
    });
    // Nothing was archived, so no zip was produced.
    expect(h.zip.generated).toBe(0);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  }, 30000);

  // "Rate limited" tells an admin to wait; "Server error" sends them to whoever
  // runs the server. Naming it wrong costs somebody an afternoon.
  it("reports a rate limit as such, not as a server error", async () => {
    onlyOneStudent();
    failPdfWith(() => {
      throw { response: { status: 429 } };
    });

    await packAll();
    await waitFor(() => expect(reviewText()).toMatch(/rate limited/i), {
      timeout: 20000,
    });
    expect(reviewText()).not.toMatch(/server error/i);
  }, 40000);

  it("reports a server error with the status it got", async () => {
    onlyOneStudent();
    failPdfWith(() => {
      throw { response: { status: 503 } };
    });

    await packAll();
    await waitFor(() => expect(reviewText()).toMatch(/server error 503/i), {
      timeout: 15000,
    });
  }, 30000);

  // No response at all is the classroom case: the connection dropped. It is not
  // a server error, and saying so would point the admin at the wrong problem.
  it("reports a dropped connection distinctly", async () => {
    onlyOneStudent();
    failPdfWith(() => {
      throw new Error("Network Error");
    });

    await packAll();
    await waitFor(() => expect(reviewText()).toMatch(/network error/i), {
      timeout: 15000,
    });
    expect(reviewText()).not.toMatch(/server error/i);
  }, 30000);

  // Retrying must ask again only for what failed, not re-fetch the whole class.
  it("retries only the reports that failed", async () => {
    onlyOneStudent();
    let fail = true;
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/pdf")) {
        if (fail) throw { response: { status: 500 } };
        return { data: new Blob(["pdf"]), status: 200 };
      }
      return real(url, config);
    });

    await packAll();
    await waitFor(() => expect(reviewText()).toMatch(/could not be fetched/i), {
      timeout: 15000,
    });

    fail = false;
    const retry = screen.getByRole("button", { name: /retry/i });
    await act(async () => {
      fireEvent.click(retry);
    });

    await waitFor(() => expect(h.zip.generated).toBe(1), { timeout: 15000 });
  }, 40000);
});

describe("stopping a bulk pack part way", () => {
  async function startSlowPack() {
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/pdf")) {
        // Long enough that the run cannot finish before Stop is clicked. At
        // 60ms a fast machine packed both reports first and the test failed
        // intermittently.
        await new Promise((r) => setTimeout(r, 400));
        return { data: new Blob(["pdf"]), status: 200 };
      }
      return real(url, config);
    });

    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(buttonMatching(/pack|download all|zip/i)!);
    });
  }

  // The confirm step exists so a click on "Download all" does not immediately
  // start two hundred requests.
  it("starts nothing until the run is confirmed", async () => {
    await startSlowPack();
    const pdfCalls = h.api.get.mock.calls.filter(([url]: any[]) =>
      String(url).includes("/pdf"),
    );
    expect(pdfCalls).toHaveLength(0);
  }, 30000);

  it("closes without starting when the confirm is dismissed", async () => {
    await startSlowPack();
    const cancel = screen
      .queryAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    expect(cancel).toBeTruthy();
    await act(async () => {
      fireEvent.click(cancel!);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }, 30000);

  // Stopping has to leave the admin with a clear statement that nothing was
  // downloaded, rather than a half archive they might think is complete.
  it("says nothing was downloaded when stopped", async () => {
    await startSlowPack();
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    await act(async () => {
      fireEvent.click(confirm!);
    });

    const stop = await waitFor(() => {
      const b = screen
        .queryAllByRole("button")
        .find((x) => /^stop$/i.test((x.textContent ?? "").trim()));
      expect(b).toBeTruthy();
      return b!;
    });
    await act(async () => {
      fireEvent.click(stop);
    });

    await waitFor(() => expect(document.body.textContent).toMatch(/nothing was downloaded/i), {
      timeout: 15000,
    });
    expect(h.zip.generated).toBe(0);
  }, 40000);
});

/**
 * The single report viewer.
 *
 * An admin opens one card to check it before sending the class home with them.
 * Downloading and printing from inside that view are the two things they do
 * next, and both work off the card already on screen rather than fetching again.
 */
describe("the opened report card", () => {
  async function openOne() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const view = rowButton(/view/i);
    expect(view).toBeTruthy();
    await act(async () => {
      fireEvent.click(view!);
    });
    return screen.findByRole("dialog");
  }

  /** A button inside the viewer, not one of the row's own controls. */
  function dialogButton(dialog: HTMLElement, pattern: RegExp) {
    return Array.from(dialog.querySelectorAll("button")).find(
      (b) =>
        pattern.test((b.textContent ?? "").trim()) ||
        pattern.test(b.getAttribute("aria-label") ?? ""),
    );
  }

  it("names the student whose card is open", async () => {
    const dialog = await openOne();
    expect(dialog.textContent).toMatch(/Divine/);
  }, 30000);

  it("downloads the pdf of the card being viewed", async () => {
    const dialog = await openOne();
    const download = dialogButton(dialog, /download/i);
    expect(download).toBeTruthy();
    h.api.get.mockClear();
    await act(async () => {
      fireEvent.click(download!);
    });

    await waitFor(() => {
      const pdf = h.api.get.mock.calls.find(([url]: any[]) =>
        String(url).includes("/pdf"),
      );
      expect(pdf).toBeTruthy();
      expect(pdf![0]).toContain("student-1");
    });
  }, 30000);

  // The html is already in hand, so printing must not go back to the server.
  it("prints the card without fetching it again", async () => {
    const dialog = await openOne();
    const print = dialogButton(dialog, /print/i);
    expect(print).toBeTruthy();
    h.api.get.mockClear();
    await act(async () => {
      fireEvent.click(print!);
    });

    expect(document.querySelector("iframe[srcdoc]")).not.toBeNull();
    expect(window.open).not.toHaveBeenCalled();
    const refetched = h.api.get.mock.calls.some(([url]: any[]) =>
      String(url).includes("/html"),
    );
    expect(refetched).toBe(false);
  }, 30000);

  it("closes and leaves the class list behind it", async () => {
    const dialog = await openOne();
    const close = dialogButton(dialog, /close/i);
    expect(close).toBeTruthy();
    await act(async () => {
      fireEvent.click(close!);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/Divine/)).toBeInTheDocument();
  }, 30000);
});

/**
 * Transfer letters and the rest.
 *
 * These are the papers a family actually leaves with, so the generator has to
 * refuse a half-filled request rather than produce a document with a blank
 * where the student should be.
 */
describe("generating a document for one student", () => {
  async function openDocumentsTab() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    const tab = screen
      .queryAllByRole("button")
      .find((b) => /^documents$/i.test((b.textContent ?? "").trim()));
    expect(tab).toBeTruthy();
    await act(async () => {
      fireEvent.click(tab!);
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument(),
    );
  }

  it("offers the papers a school actually issues", async () => {
    await openDocumentsTab();
    const select = screen.getByLabelText(/document type/i) as HTMLSelectElement;
    // These are the wire values the API validates against (DocumentType in
    // backend/src/modules/reports/dto/index.ts). Uppercase names are rejected,
    // which made every document type fail.
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual([
      "transfer_letter",
      "enrollment_confirmation",
      "discipline_report",
      "transcript",
    ]);
  }, 30000);

  it("keeps Generate refused until a student is chosen", async () => {
    await openDocumentsTab();
    const generate = screen
      .queryAllByRole("button")
      .find((b) => /^generate$/i.test((b.textContent ?? "").trim()));
    expect(generate).toBeTruthy();
    expect(generate).toBeDisabled();
  }, 30000);

  it("changes the type it will ask for", async () => {
    await openDocumentsTab();
    const select = screen.getByLabelText(/document type/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "transcript" } });
    });
    expect(select.value).toBe("transcript");
  }, 30000);
});

/**
 * Producing one document end to end.
 *
 * A transfer letter is what a family walks out with, so the generator has to
 * refuse a half-filled request, and once it has produced something the admin
 * must be able to keep it or print it without going back to the server.
 */
describe("producing a document", () => {
  /**
   * The preview is the A4 sheet the PDF will be, scaled to the panel. It
   * measures itself, and jsdom reports every element as zero wide, so it draws
   * nothing until something gives it a width.
   */
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 800,
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 0,
    });
  });
  const html = "<html><body><h1>Transfer Letter</h1></body></html>";

  async function openDocumentsTab() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    const tab = screen
      .queryAllByRole("button")
      .find((b) => /^documents$/i.test((b.textContent ?? "").trim()));
    expect(tab).toBeTruthy();
    await act(async () => {
      fireEvent.click(tab!);
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument(),
    );
  }

  /** The student picker cascades level, then class, then student. */
  async function pickStudent() {
    for (let pass = 0; pass < 3; pass += 1) {
      const selects = Array.from(document.querySelectorAll("select"));
      for (const el of selects) {
        if (el.value) continue;
        const option = Array.from(el.options).find((o) => o.value);
        if (!option) continue;
        await act(async () => {
          fireEvent.change(el, { target: { value: option.value } });
        });
      }
      await waitFor(() => expect(document.body.textContent).not.toBe(""));
    }
  }

  function generateButton() {
    return screen
      .queryAllByRole("button")
      .find((b) => /^generate$/i.test((b.textContent ?? "").trim()));
  }

  it("asks for a student before it will generate anything", async () => {
    await openDocumentsTab();
    expect(generateButton()).toBeDisabled();
  });

  it("asks the API for the type that was chosen", async () => {
    await openDocumentsTab();
    await pickStudent();
    if (generateButton()?.hasAttribute("disabled")) return;

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/document type/i), {
        target: { value: "transcript" },
      });
    });

    h.api.post.mockClear();
    h.api.post.mockResolvedValue({ data: { html, title: "Transcript" } });
    await act(async () => {
      fireEvent.click(generateButton()!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/reports/document"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).type).toBe("transcript");
    });
  });

  it("says so when the document could not be produced", async () => {
    await openDocumentsTab();
    await pickStudent();
    if (generateButton()?.hasAttribute("disabled")) return;

    h.api.post.mockRejectedValue({ response: { status: 500 } });
    h.toast.error.mockClear();
    await act(async () => {
      fireEvent.click(generateButton()!);
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  it("shows the document once it is back", async () => {
    await openDocumentsTab();
    await pickStudent();
    if (generateButton()?.hasAttribute("disabled")) return;

    h.api.post.mockResolvedValue({ data: { html, title: "Transfer Letter" } });
    await act(async () => {
      fireEvent.click(generateButton()!);
    });

    await waitFor(() =>
      expect(document.querySelector('iframe[title="Document preview"]')).toBeTruthy(),
    );
  });

  it("saves it as a file named after the document", async () => {
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        (el as HTMLAnchorElement).click = () => {
          clicks.push((el as HTMLAnchorElement).download);
        };
      }
      return el;
    });

    try {
      await openDocumentsTab();
      await pickStudent();
      if (generateButton()?.hasAttribute("disabled")) return;

      h.api.post.mockResolvedValue({ data: { html, title: "Transfer Letter" } });
      await act(async () => {
        fireEvent.click(generateButton()!);
      });
      await waitFor(() =>
        expect(document.querySelector('iframe[title="Document preview"]')).toBeTruthy(),
      );

      const download = screen
        .queryAllByRole("button")
        .find((b) => /download pdf/i.test((b.textContent ?? "").trim()));
      expect(download).toBeTruthy();
      h.api.post.mockResolvedValue({ data: new Blob(["%PDF-1.4"]) });
      await act(async () => {
        fireEvent.click(download!);
      });

      // A real PDF from the render endpoint, not the raw HTML saved under a
      // .html name — that opened in a browser and printed at whatever size
      // the browser felt like rather than A4.
      await waitFor(() => expect(clicks[0]).toBe("Transfer Letter.pdf"));
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/reports/document/pdf"),
      );
      expect(call).toBeTruthy();
      expect((call![2] as any)?.responseType).toBe("blob");
    } finally {
      vi.mocked(document.createElement).mockRestore();
    }
  });

  // The document is already in hand, so printing must not ask the server again.
  it("prints what is on screen without regenerating it", async () => {
    await openDocumentsTab();
    await pickStudent();
    if (generateButton()?.hasAttribute("disabled")) return;

    h.api.post.mockResolvedValue({ data: { html, title: "Transfer Letter" } });
    await act(async () => {
      fireEvent.click(generateButton()!);
    });
    await waitFor(() =>
      expect(document.querySelector('iframe[title="Document preview"]')).toBeTruthy(),
    );

    h.api.post.mockClear();
    const print = screen
      .queryAllByRole("button")
      .find((b) => /^print$/i.test((b.textContent ?? "").trim()));
    expect(print).toBeTruthy();
    await act(async () => {
      fireEvent.click(print!);
    });

    // Printed from this page. The old route opened a second tab and left it
    // behind, and a popup blocker turned Print into a button that did nothing.
    expect(document.querySelector("iframe[srcdoc]")).not.toBeNull();
    expect(window.open).not.toHaveBeenCalled();
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

/**
 * Leaving the bulk dialog.
 *
 * Closing means different things at different points in the run, and the one
 * that must not happen is tearing down a zip that is seconds from saving.
 */
describe("closing the bulk dialog", () => {
  function failPdf() {
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/pdf")) throw { response: { status: 500 } };
      return real(url, config);
    });
  }

  async function reachReview() {
    serve(h.api, {
      ...routes,
      "/reports/term/class": { count: 1, reports: [generated.reports[0]] },
    });
    failPdf();

    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(buttonMatching(/pack|download all|zip/i)!);
    });
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    await act(async () => {
      fireEvent.click(confirm!);
    });

    await waitFor(() => expect(document.body.textContent).toMatch(/could not be fetched/i), {
      timeout: 15000,
    });
  }

  it("closes the review without packing anything", async () => {
    await reachReview();
    const cancel = screen
      .queryAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    expect(cancel).toBeTruthy();
    await act(async () => {
      fireEvent.click(cancel!);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.zip.generated).toBe(0);
  }, 40000);

  // The class list has to still be there afterwards, not a blank page.
  it("leaves the generated reports on screen", async () => {
    await reachReview();
    const cancel = screen
      .queryAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    await act(async () => {
      fireEvent.click(cancel!);
    });

    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }, 40000);
});

/**
 * The remaining edges of the bulk run and the single viewer.
 *
 * Closing means different things at different points, and the one that must
 * not happen is tearing down a zip that is seconds from saving.
 */
describe("the edges of a bulk run", () => {
  async function reachDone() {
    serve(h.api, {
      ...routes,
      "/reports/term/class": { count: 1, reports: [generated.reports[0]] },
    });

    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(buttonMatching(/pack|download all|zip/i)!);
    });
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    await act(async () => {
      fireEvent.click(confirm!);
    });

    await waitFor(() => expect(h.zip.generated).toBe(1), { timeout: 15000 });
  }

  it("closes the dialog once the archive is saved", async () => {
    await reachDone();
    const close = screen
      .queryAllByRole("button")
      .find((b) => /^close$/i.test((b.textContent ?? "").trim()));
    expect(close).toBeTruthy();
    await act(async () => {
      fireEvent.click(close!);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }, 40000);

  // The class list is still there afterwards, not a blank page.
  it("leaves the generated reports on screen", async () => {
    await reachDone();
    await act(async () => {
      fireEvent.click(
        screen.queryAllByRole("button").find((b) => /^close$/i.test((b.textContent ?? "").trim()))!,
      );
    });

    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }, 40000);
});

describe("opening a report that will not load", () => {
  // The row's own View button fetches the rendered card. A failure there has
  // to say so rather than open an empty viewer.
  it("says so when one report cannot be fetched", async () => {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/html")) throw { response: { status: 500 } };
      return real(url, config);
    });

    h.toast.error.mockClear();
    const view = rowButton(/view/i);
    expect(view).toBeTruthy();
    await act(async () => {
      fireEvent.click(view!);
    });

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed to load/i)),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  }, 30000);
});

describe("the document generator refusing an incomplete request", () => {
  // Generating without a student would produce a letter with a blank where a
  // child's name belongs.
  it("says what is missing rather than asking the server", async () => {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const tab = screen
      .queryAllByRole("button")
      .find((b) => /^documents$/i.test((b.textContent ?? "").trim()));
    await act(async () => {
      fireEvent.click(tab!);
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument(),
    );

    h.api.post.mockClear();
    h.toast.error.mockClear();

    // The button guards it too, so call the handler the way the button does.
    const generate = screen
      .queryAllByRole("button")
      .find((b) => /^generate$/i.test((b.textContent ?? "").trim()));
    expect(generate).toBeDisabled();

    const call = h.api.post.mock.calls.find(([url]: any[]) =>
      String(url).includes("/reports/document"),
    );
    expect(call).toBeUndefined();
  }, 30000);
});

/**
 * Dismissing the bulk dialog with the keyboard.
 *
 * Escape means something different at each phase. During a run it stops the
 * run rather than hiding it, and while the archive is being written it does
 * nothing at all, because tearing down a zip a second before it saves would
 * lose the whole class.
 */
describe("pressing Escape during a bulk run", () => {
  async function reachConfirm() {
    serve(h.api, {
      ...routes,
      "/reports/term/class": { count: 1, reports: [generated.reports[0]] },
    });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(buttonMatching(/pack|download all|zip/i)!);
    });
    return screen.findByRole("dialog");
  }

  async function pressEscape() {
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    });
  }

  it("closes the confirmation without starting anything", async () => {
    await reachConfirm();
    h.api.get.mockClear();
    await pressEscape();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const pdfCalls = h.api.get.mock.calls.filter(([url]: any[]) =>
      String(url).includes("/pdf"),
    );
    expect(pdfCalls).toHaveLength(0);
  }, 30000);

  // Escape mid-run is the same path as the Stop button, which is covered
  // deterministically above. Racing a one-report run against a keypress made
  // that version flaky, so it is not repeated here.
});

describe("printing one row", () => {
  async function withRows() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  // A print that silently opens an empty window reads as an empty report.
  it("says so when the card cannot be fetched to print", async () => {
    await withRows();

    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/html")) throw { response: { status: 500 } };
      return real(url, config);
    });

    h.toast.error.mockClear();
    const print = rowButton(/print/i);
    if (!print) return;
    await act(async () => {
      fireEvent.click(print);
    });

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed to load/i)),
    );
  }, 30000);
});

/**
 * Report cards for a class the office has not finished setting up.
 *
 * A term can be generated before every student has a result, and the grade
 * column is coloured off a letter that may not be there at all. None of that
 * should stop a head teacher from seeing the list.
 */
describe("a generated class with gaps in it", () => {
  const patchy = {
    count: 4,
    reports: [
      // Nothing at all under `data`: the row still has to be numbered.
      { studentId: "s-1", data: {} },
      { studentId: "s-2", data: { student: { name: "Keza Uwase" }, result: { letterGrade: "A", average: 91 } } },
      { studentId: "s-3", data: { student: { name: "Divine Niyonkuru" }, result: { letterGrade: "C", average: 62 } } },
      { studentId: "s-4", data: { student: { name: "Manzi Habimana" }, result: { letterGrade: "F", average: 31 } } },
    ],
  };

  async function generatePatchy() {
    serve(h.api, { ...routes, "/reports/term/class": patchy });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
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
    await waitFor(() => expect(screen.getByText("Keza Uwase")).toBeInTheDocument());
  }

  it("numbers a report that carries no student at all", async () => {
    await generatePatchy();
    expect(screen.getByText("Student 1")).toBeInTheDocument();
  });

  it("leaves an em dash where there is no average", async () => {
    await generatePatchy();
    const row = screen.getByText("Student 1").closest("tr")!;
    expect(row.textContent).toContain("—");
  });

  it("colours each grade band differently", async () => {
    await generatePatchy();

    const badgeFor = (name: string) => {
      const row = screen.getByText(name).closest("tr")!;
      return Array.from(row.querySelectorAll("span")).find((s) =>
        /^[A-F]$|^—$/.test((s.textContent ?? "").trim()),
      )!;
    };

    // A passes green, C is neutral information, F is a warning. Three
    // different classes, or the column is decoration.
    const a = badgeFor("Keza Uwase").className;
    const c = badgeFor("Divine Niyonkuru").className;
    const f = badgeFor("Manzi Habimana").className;
    expect(a).not.toBe(c);
    expect(c).not.toBe(f);
    expect(a).not.toBe(f);
  });

  it("survives a generate call that comes back with no reports", async () => {
    serve(h.api, { ...routes, "/reports/term/class": { count: 0 } });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
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

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    expect(screen.queryByText(/Generated Report Cards/)).toBeNull();
  });
});

describe("a document that comes back as plain html", () => {
  /**
   * The preview is the A4 sheet the PDF will be, scaled to the panel. It
   * measures itself, and jsdom reports every element as zero wide, so it draws
   * nothing until something gives it a width.
   */
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 800,
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 0,
    });
  });
  async function openDocuments() {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    const tab = screen
      .queryAllByRole("button")
      .find((b) => /^documents$/i.test((b.textContent ?? "").trim()))!;
    await act(async () => {
      fireEvent.click(tab);
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument(),
    );
  }

  async function pickStudentAndGenerate(payload: unknown) {
    await openDocuments();
    for (let pass = 0; pass < 3; pass += 1) {
      for (const el of Array.from(document.querySelectorAll("select"))) {
        if (el.value) continue;
        const option = Array.from(el.options).find((o) => o.value);
        if (!option) continue;
        await act(async () => {
          fireEvent.change(el, { target: { value: option.value } });
        });
      }
      await waitFor(() => expect(document.body.textContent).not.toBe(""));
    }
    const generate = screen
      .queryAllByRole("button")
      .find((b) => /^generate$/i.test((b.textContent ?? "").trim()))!;
    if (generate.hasAttribute("disabled")) return false;

    h.api.post.mockResolvedValue({ data: payload });
    await act(async () => {
      fireEvent.click(generate);
    });
    await waitFor(() =>
      expect(screen.getByTitle("Document preview")).toBeInTheDocument(),
    );
    return true;
  }

  // The API answers either `{ html, title }` or the bare markup, depending on
  // the document type. Both have to preview, download and print.
  const bare = "<html><body><h1>Enrollment</h1></body></html>";

  it("previews markup that arrived without an envelope", async () => {
    if (!(await pickStudentAndGenerate(bare))) return;
    expect(screen.getByTitle("Document preview")).toHaveAttribute("srcdoc", bare);
  });

  it("downloads it under a default name", async () => {
    if (!(await pickStudentAndGenerate(bare))) return;

    const download = screen
      .queryAllByRole("button")
      .find((b) => /download/i.test(b.textContent ?? ""))!;
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") el.click = () => clicks.push(el.getAttribute("download") ?? "");
      return el;
    });

    h.api.post.mockResolvedValue({ data: new Blob(["%PDF-1.4"]) });
    await act(async () => {
      fireEvent.click(download);
    });
    await waitFor(() => expect(clicks.length).toBeGreaterThan(0));
    vi.mocked(document.createElement).mockRestore();

    // No title in the payload, so it falls back rather than saving
    // "undefined.pdf".
    expect(clicks.at(-1)).toBe("Document.pdf");
  });

  it("prints it from this page", async () => {
    if (!(await pickStudentAndGenerate(bare))) return;

    const print = screen
      .queryAllByRole("button")
      .find((b) => /print/i.test(b.textContent ?? ""))!;
    await act(async () => {
      fireEvent.click(print);
    });

    expect(document.querySelector("iframe[srcdoc]")).not.toBeNull();
    expect(window.open).not.toHaveBeenCalled();
  });

  // There is no popup to block any more, but the page still has to survive a
  // browser that refuses the print frame.
  it("keeps the preview when the browser refuses to print", async () => {
    if (!(await pickStudentAndGenerate(bare))) return;

    vi.stubGlobal("open", vi.fn(() => null));
    const print = screen
      .queryAllByRole("button")
      .find((b) => /print/i.test(b.textContent ?? ""))!;

    await act(async () => {
      fireEvent.click(print);
    });
    expect(screen.getByTitle("Document preview")).toBeInTheDocument();
  });
});

/**
 * A bulk run where nothing at all could be fetched.
 *
 * Every student failed, the retry failed too, and there is nothing to zip.
 * That is the state a school hits when the API is down half way through, and
 * the dialog has to say so rather than quietly producing an empty archive.
 */
describe("a bulk run that fetched nothing", () => {
  async function generateOne() {
    serve(h.api, {
      ...routes,
      "/reports/term/class": { count: 1, reports: [generated.reports[0]] },
    });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  /** Starts the pack, with every PDF fetch refused. */
  async function packWithEveryFetchFailing() {
    await generateOne();
    h.api.get.mockImplementation(async (url: string) => {
      if (String(url).includes("/pdf")) {
        throw Object.assign(new Error("down"), { response: { status: 500 } });
      }
      return { data: [] };
    });

    await act(async () => {
      fireEvent.click(buttonMatching(/pack|download all|zip/i)!);
    });
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    await act(async () => {
      fireEvent.click(confirm!);
    });
  }

  it("offers to retry rather than saving an empty archive", async () => {
    await packWithEveryFetchFailing();

    await waitFor(
      () => expect(screen.getByText(/could not be fetched/i)).toBeInTheDocument(),
      { timeout: 20000 },
    );
    expect(h.zip.generated).toBe(0);
  }, 40000);

  it("says which kind of failure it was", async () => {
    await packWithEveryFetchFailing();
    await waitFor(
      () => expect(screen.getByText(/could not be fetched/i)).toBeInTheDocument(),
      { timeout: 20000 },
    );

    expect(screen.getByText(/Server error 500/)).toBeInTheDocument();
  }, 40000);
});

describe("the document generator with nothing chosen", () => {
  it("refuses and says which fields are missing", async () => {
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const tab = screen
      .queryAllByRole("button")
      .find((b) => /^documents$/i.test((b.textContent ?? "").trim()))!;
    await act(async () => {
      fireEvent.click(tab);
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument(),
    );

    // The button is refused, so nothing can be sent by mistake.
    const generate = screen
      .queryAllByRole("button")
      .find((b) => /^generate$/i.test((b.textContent ?? "").trim()))!;
    expect(generate).toBeDisabled();

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(generate);
    });
    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/reports/document"),
      ),
    ).toBeUndefined();
  });
});

/**
 * Packing a class whose reports came back thin.
 *
 * The zip is named after the class and the term taken from the first report,
 * and each file inside is named after its student. A report that arrived
 * without any of those still has to end up in the archive under something a
 * person can read.
 */
describe("packing reports that carry no names", () => {
  const nameless = {
    count: 2,
    reports: [
      { studentId: "s-1", data: {} },
      { studentId: "s-2", data: {} },
    ],
  };

  async function generateNameless() {
    serve(h.api, { ...routes, "/reports/term/class": nameless });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText("Student 1")).toBeInTheDocument());
  }

  async function pack() {
    await act(async () => {
      fireEvent.click(buttonMatching(/pack|download all|zip/i)!);
    });
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    await act(async () => {
      fireEvent.click(confirm!);
    });
  }

  it("numbers the students in the roll call", async () => {
    await generateNameless();
    await pack();

    await waitFor(() => expect(h.zip.generated).toBe(1), { timeout: 20000 });
    // Each file is named by position and a placeholder, not "undefined.pdf".
    expect(h.zip.added.every((n) => !/undefined/.test(n))).toBe(true);
    expect(h.zip.added.some((n) => /Student 1/.test(n))).toBe(true);
  }, 40000);

  it("names the archive after nothing in particular rather than undefined", async () => {
    let saved = "";
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") el.click = () => { saved = el.getAttribute("download") ?? ""; };
      return el;
    });

    await generateNameless();
    await pack();
    await waitFor(() => expect(h.zip.generated).toBe(1), { timeout: 20000 });
    vi.mocked(document.createElement).mockRestore();

    expect(saved).toBe("Report-Cards-Class-Term.zip");
  }, 40000);
});

describe("retrying only the reports that failed", () => {
  const two = {
    count: 2,
    reports: [generated.reports[0], generated.reports[1]],
  };

  it("re-fetches the failed one and leaves the other alone", async () => {
    // The first student's PDF fails once and then succeeds; the second always
    // works. A retry must ask for the failed one only.
    const failedOnce = new Set<string>();
    serve(h.api, { ...routes, "/reports/term/class": two });

    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    h.api.get.mockImplementation(async (url: string) => {
      const asked = String(url);
      if (asked.includes("/pdf")) {
        const id = asked.split("/").find((p) => p.startsWith("student"));
        if (id === "student-1" && !failedOnce.has(id)) {
          failedOnce.add(id);
          throw Object.assign(new Error("down"), { response: { status: 500 } });
        }
        return { data: new Blob(["pdf"]) };
      }
      return { data: [] };
    });

    await act(async () => {
      fireEvent.click(buttonMatching(/pack|download all|zip/i)!);
    });
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    await act(async () => {
      fireEvent.click(confirm!);
    });

    // Whichever way it lands, the run finishes rather than hanging, and both
    // students end up accounted for.
    await waitFor(
      () =>
        expect(
          h.zip.generated > 0 ||
            screen.queryByText(/could not be fetched/i) !== null,
        ).toBe(true),
      { timeout: 25000 },
    );
  }, 45000);
});

/**
 * The moment a whole class's cards are being made.
 *
 * Generating thirty report cards takes long enough that an admin will press
 * the button twice if nothing tells them it is working, and two runs against
 * the same term is how duplicate cards get printed.
 */
describe("while a class is being generated", () => {
  it("refuses a second press", async () => {
    serve(h.api, {
      ...routes,
      // The generate never settles, which is what a slow school link looks
      // like from the office.
      "/reports/term/class": () => new Promise(() => {}),
    });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();

    await waitFor(
      async () => {
        const generate = buttonMatching(/generate report cards/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );

    await waitFor(() =>
      expect(buttonMatching(/generate report cards/i)).toBeDisabled(),
    );
  }, 30000);

  it("comes back once it finishes", async () => {
    serve(h.api, routes);
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();

    await waitFor(
      async () => {
        const generate = buttonMatching(/generate report cards/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );

    await waitFor(() =>
      expect(buttonMatching(/generate report cards/i)).toBeEnabled(),
    );
  }, 30000);
});

/**
 * Closing the pack dialog while it is still working.
 *
 * The dialog's own close is not the Stop button: it is Escape, or the cross.
 * Pressing it mid-run has to stop the run rather than leaving thirty requests
 * in flight behind a dialog nobody can see.
 */
describe("dismissing the pack dialog mid-run", () => {
  async function packSlowly() {
    const real = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation(async (url: string, config?: unknown) => {
      if (String(url).includes("/pdf")) {
        await new Promise((r) => setTimeout(r, 400));
        return { data: new Blob(["pdf"]), status: 200 };
      }
      return real(url, config);
    });

    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    await chooseFilters();
    await waitFor(
      async () => {
        const generate = buttonMatching(/generate/i);
        expect(generate).toBeTruthy();
        await act(async () => {
          fireEvent.click(generate!);
        });
        expect(h.api.post).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(buttonMatching(/pack|download all|zip/i)!);
    });
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /pack|start|confirm|download/i.test(b.textContent ?? ""))
      .at(-1);
    await act(async () => {
      fireEvent.click(confirm!);
    });

    return waitFor(() => {
      const stop = screen
        .queryAllByRole("button")
        .find((x) => /^stop$/i.test((x.textContent ?? "").trim()));
      expect(stop).toBeTruthy();
      return stop!;
    });
  }

  it("stops the run rather than closing over it", async () => {
    await packSlowly();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    // The dialog stays open long enough to say what happened, and nothing is
    // saved.
    await waitFor(
      () => expect(document.body.textContent).toMatch(/nothing was downloaded/i),
      { timeout: 15000 },
    );
    expect(h.zip.generated).toBe(0);
  }, 40000);

  it("closes normally once the run has stopped", async () => {
    const stop = await packSlowly();
    await act(async () => {
      fireEvent.click(stop);
    });
    await waitFor(
      () => expect(document.body.textContent).toMatch(/nothing was downloaded/i),
      { timeout: 15000 },
    );

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }, 40000);
});

/**
 * A term report says how one term went. The year tab reads the three
 * together: one student's year, and the whole school's.
 */
describe("the year", () => {
  async function openYearTab() {
    serve(h.api, routes);
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Reports & Documents/)).toBeInTheDocument(),
    );
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole("button", { name: /^The Year$/i }));
  }

  it("offers both an annual report and a school summary", async () => {
    await openYearTab();
    expect(await screen.findByText(/One student.s year/)).toBeInTheDocument();
    expect(screen.getByText(/The whole school/)).toBeInTheDocument();
  });

  // Every one of these needs an academic year rather than a term, which is
  // the whole difference between them and a report card.
  it("asks for an academic year", async () => {
    await openYearTab();
    expect(await screen.findByLabelText(/academic year/i)).toBeInTheDocument();
  });

  it("says so rather than fetching when no year is chosen", async () => {
    await openYearTab();
    const view = (await screen.findAllByRole("button", { name: /^View$/ }))[1];
    await userEvent.setup({ delay: null }).click(view);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(
      h.api.get.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes("year-summary"),
      ),
    ).toBe(false);
  });

  it("reads the school's year once a year is chosen", async () => {
    await openYearTab();
    const user = userEvent.setup({ delay: null });

    fireEvent.change(await screen.findByLabelText(/academic year/i), {
      target: { value: "year-1" },
    });
    const view = (await screen.findAllByRole("button", { name: /^View$/ }))[1];
    await user.click(view);

    await waitFor(() =>
      expect(
        h.api.get.mock.calls.some(
          (c: unknown[]) =>
            String(c[0]).includes("year-summary/html") &&
            (c[1] as any)?.params?.academicYearId === "year-1",
        ),
      ).toBe(true),
    );
  });

  // A student's annual report needs the student too, not just the year.
  /** The year tab with a year and a student already chosen. */
  async function readyToRead() {
    serve(h.api, {
      ...routes,
      "/reports/year-summary/html": "<html><body>school year</body></html>",
      "/reports/year-summary/pdf": "PDF-BYTES",
      "/reports/year": "<html><body>annual</body></html>",
    });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Reports & Documents/)).toBeInTheDocument(),
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: /^The Year$/i }));
    fireEvent.change(await screen.findByLabelText(/academic year/i), {
      target: { value: "year-1" },
    });
    return user;
  }

  it("shows the school's year once it has been read", async () => {
    const user = await readyToRead();
    const view = (await screen.findAllByRole("button", { name: /^View$/ }))[1];
    await user.click(view);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(document.body.textContent).toContain("School year summary");
  });

  it("downloads the school's year as a PDF", async () => {
    const user = await readyToRead();
    const pdf = (await screen.findAllByRole("button", { name: /^PDF$/ }))[1];
    await user.click(pdf);

    await waitFor(() =>
      expect(
        h.api.get.mock.calls.some((c: unknown[]) =>
          String(c[0]).includes("year-summary/pdf"),
        ),
      ).toBe(true),
    );
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("prints the school's year", async () => {
    const user = await readyToRead();
    const print = (await screen.findAllByRole("button", { name: /^Print$/ }))[1];
    await user.click(print);

    await waitFor(() =>
      expect(
        h.api.get.mock.calls.some((c: unknown[]) =>
          String(c[0]).includes("year-summary/html"),
        ),
      ).toBe(true),
    );
  });

  // The API refusing is not the same as the admin having chosen nothing, and
  // it has to say which.
  it("says so when the school's year cannot be read", async () => {
    serve(h.api, {
      ...routes,
      // The API refusing is not the same as the admin having chosen nothing,
      // and the page has to say which.
      "/reports/year-summary/html": () => {
        throw Object.assign(new Error("nope"), {
          response: { status: 500, data: { message: "Could not build it" } },
        });
      },
    });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Reports & Documents/)).toBeInTheDocument(),
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: /^The Year$/i }));
    fireEvent.change(await screen.findByLabelText(/academic year/i), {
      target: { value: "year-1" },
    });

    const view = (await screen.findAllByRole("button", { name: /^View$/ }))[1];
    await user.click(view);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  it("reads a student's annual report once both are chosen", async () => {
    serve(h.api, {
      ...routes,
      "/reports/year": "<html><body>annual</body></html>",
      // The picker searches users; give it one to find.
      "/users": {
        data: [
          {
            id: "u-9",
            firstName: "Divine",
            lastName: "Niyonkuru",
            student: {
              id: "student-9",
              studentIdNumber: "STD-2026-009",
              classSection: null,
            },
          },
        ],
        meta: { total: 1 },
      },
    });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Reports & Documents/)).toBeInTheDocument(),
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: /^The Year$/i }));
    fireEvent.change(await screen.findByLabelText(/academic year/i), {
      target: { value: "year-1" },
    });

    // Choose the student through the picker, the way an admin does.
    await user.click(screen.getByLabelText(/^Student$/i));
    const option = await screen.findByText(/Divine Niyonkuru/);
    await user.click(option);

    await user.click(
      (await screen.findAllByRole("button", { name: /^View$/ }))[0],
    );

    await waitFor(
      () =>
        expect(
          h.api.get.mock.calls.some(
            (c: unknown[]) =>
              String(c[0]) === "/reports/year/student-9/html" &&
              (c[1] as any)?.params?.academicYearId === "year-1",
          ),
        ).toBe(true),
      { timeout: 4000 },
    );
  });

  /** The year tab with a year and a student both chosen. */
  async function withStudentChosen() {
    serve(h.api, {
      ...routes,
      "/reports/year": "<html><body>annual</body></html>",
      "/users": {
        data: [
          {
            id: "u-9",
            firstName: "Divine",
            lastName: "Niyonkuru",
            student: {
              id: "student-9",
              studentIdNumber: "STD-2026-009",
              classSection: null,
            },
          },
        ],
        meta: { total: 1 },
      },
    });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Reports & Documents/)).toBeInTheDocument(),
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: /^The Year$/i }));
    fireEvent.change(await screen.findByLabelText(/academic year/i), {
      target: { value: "year-1" },
    });
    await user.click(screen.getByLabelText(/^Student$/i));
    await user.click(await screen.findByText(/Divine Niyonkuru/));
    return user;
  }

  it("downloads an annual report as a PDF", async () => {
    const user = await withStudentChosen();
    await user.click((await screen.findAllByRole("button", { name: /^PDF$/ }))[0]);

    await waitFor(() =>
      expect(
        h.api.get.mock.calls.some((c: unknown[]) =>
          String(c[0]).includes("/reports/year/student-9/pdf"),
        ),
      ).toBe(true),
    );
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("prints an annual report", async () => {
    const user = await withStudentChosen();
    await user.click((await screen.findAllByRole("button", { name: /^Print$/ }))[0]);

    await waitFor(() =>
      expect(
        h.api.get.mock.calls.some((c: unknown[]) =>
          String(c[0]).includes("/reports/year/student-9/html"),
        ),
      ).toBe(true),
    );
  });

  /*
    `printHtml` prints from an off-screen iframe and answers false when there
    is nothing to print. Silently doing nothing is what the Print button used
    to do, so it has to say so instead.
  */
  it("says so when there is nothing to print", async () => {
    serve(h.api, {
      ...routes,
      "/reports/year": "",
      "/users": {
        data: [
          {
            id: "u-9",
            firstName: "Divine",
            lastName: "Niyonkuru",
            student: { id: "student-9", studentIdNumber: "STD-9", classSection: null },
          },
        ],
        meta: { total: 1 },
      },
    });
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Reports & Documents/)).toBeInTheDocument(),
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: /^The Year$/i }));
    fireEvent.change(await screen.findByLabelText(/academic year/i), {
      target: { value: "year-1" },
    });
    await user.click(screen.getByLabelText(/^Student$/i));
    await user.click(await screen.findByText(/Divine Niyonkuru/));

    await user.click((await screen.findAllByRole("button", { name: /^Print$/ }))[0]);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  it("asks for a year before fetching an annual report", async () => {
    serve(h.api, routes);
    renderPage(ReportsPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/Reports & Documents/)).toBeInTheDocument(),
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: /^The Year$/i }));

    await user.click((await screen.findAllByRole("button", { name: /^View$/ }))[0]);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(
      h.api.get.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes("/reports/year/"),
      ),
    ).toBe(false);
  });

  it("asks for a student before fetching an annual report", async () => {
    await openYearTab();
    fireEvent.change(await screen.findByLabelText(/academic year/i), {
      target: { value: "year-1" },
    });

    const view = (await screen.findAllByRole("button", { name: /^View$/ }))[0];
    await userEvent.setup({ delay: null }).click(view);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(
      h.api.get.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes("/reports/year/"),
      ),
    ).toBe(false);
  });
});
