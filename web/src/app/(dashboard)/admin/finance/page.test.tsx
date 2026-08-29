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
  usePathname: () => "/admin/finance",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, populatedRoutes } from "@/test/fixtures";
import {
  feeRegister,
  feeSummary,
  financeRoutes,
  registerRows,
  unbilledRow,
} from "@/test/fee-fixtures";

import FeeRegisterPage from "./page";

/**
 * The fee register.
 *
 * What a bursar opens every morning, so what these tests hold is that the roll
 * is readable at a glance: every student on it, the ones still owing plainly
 * marked, and the difference between a family part way there and one that has
 * not started never washed into a single colour.
 */

const routes = {
  ...populatedRoutes,
  ...financeRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(FeeRegisterPage, { role: "BURSAR" });
  await waitFor(() =>
    expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument(),
  );
}

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
};

const rowFor = (name: RegExp) => screen.getByText(name).closest("tr")!;

describe("the roll", () => {
  it("lists every student with what they owe", async () => {
    await mount();
    expect(screen.getByText(/Keza Mutesi/)).toBeInTheDocument();
    expect(rowFor(/Divine Niyonkuru/).textContent).toMatch(/80,000 RWF/);
  });

  it("names the class the way the school does", async () => {
    await mount();
    expect(rowFor(/Divine Niyonkuru/).textContent).toMatch(/Senior 1 A/);
  });

  it("says whether a student boards, which is what their bill turns on", async () => {
    await mount();
    expect(rowFor(/Divine Niyonkuru/).textContent).toMatch(/Boarder/);
    expect(rowFor(/Keza Mutesi/).textContent).toMatch(/Day/);
  });

  /*
    Part paid and nothing paid are both owing to the report card, but a bursar
    chasing money needs to tell them apart at a glance.
  */
  it("tells a family part way there from one that has not started", async () => {
    await mount();
    expect(rowFor(/Divine Niyonkuru/).textContent).toMatch(/Part paid/);
    expect(rowFor(/Aline Uwase/).textContent).toMatch(/Nothing paid/);
  });

  // A sponsored student has paid nothing and owes nothing, and showing only
  // the payment would read as a family that has not paid.
  it("shows a waiver beside the payments rather than instead of them", async () => {
    await mount();
    const row = rowFor(/Shema Habimana/);
    expect(row.textContent).toMatch(/106,000 RWF waived/);
    expect(row.textContent).toMatch(/Cleared/);
  });

  /*
    A student with no bill has no figures to show, and printing zeros for them
    would read as a family that owes nothing rather than as work the office
    has not done.
  */
  it("leaves a student with no bill blank rather than showing zeros", async () => {
    serve(h.api, {
      ...routes,
      "/finance/register": {
        ...feeRegister,
        data: [...registerRows, unbilledRow],
        total: registerRows.length + 1,
      },
    });
    await mount();
    const row = rowFor(/Yves Rugema/);
    expect(row.textContent).toMatch(/Not billed/);
    expect(row.textContent).not.toMatch(/0 RWF/);
  });

  it("opens a student's account from their name", async () => {
    await mount();
    const link = screen.getByText(/Divine Niyonkuru/).closest("a");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/admin/finance/student-1"),
    );
  });

  it("does not go blank when the roll fails to load", async () => {
    serveFailure(h.api);
    renderPage(FeeRegisterPage, { role: "BURSAR" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("says so plainly when nobody has been billed", async () => {
    serve(h.api, {
      ...routes,
      "/finance/register": { data: [], total: 0, page: 1, limit: 25 },
    });
    renderPage(FeeRegisterPage, { role: "BURSAR" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Nobody has been billed/i),
    );
  });
});

/**
 * Four figures in the order the office reads them, and the last is the one the
 * page exists for.
 */
describe("the term at a glance", () => {
  it("shows what was billed, collected, waived and is still out", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Billed this term/);
    expect(text).toMatch(/Collected/);
    expect(text).toMatch(/Waived/);
    expect(text).toMatch(/Still outstanding/);
  });

  it("says how many students the outstanding money is spread across", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/across 2 students/);
  });

  it("reports how far through the term's collection the school is", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/55% of the term settled/);
  });
});

/**
 * Raising the invoices, offered only when there is something to raise.
 */
describe("students nobody has billed yet", () => {
  const withUnbilled = {
    ...routes,
    "/finance/summary": { ...feeSummary, notInvoiced: 12 },
  };

  it("says how many are missing and offers to bill them", async () => {
    serve(h.api, withUnbilled);
    await mount();
    expect(document.body.textContent).toMatch(
      /12 students have not been billed/i,
    );
  });

  it("raises them, and says what it did", async () => {
    serve(h.api, {
      ...withUnbilled,
      "/finance/invoices/raise": {
        raised: 12,
        alreadyInvoiced: 4,
        withoutStructure: 0,
      },
    });
    await mount();
    await click(
      screen.getAllByRole("button").find((b) => /Raise invoices/i.test(b.textContent ?? "")),
    );
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith("12 invoices raised."),
    );
  });

  /*
    A whole year group with no price list is the sort of thing nobody notices
    until March, so the reply says it rather than reporting a clean run.
  */
  it("warns when some students had no fee structure to bill from", async () => {
    serve(h.api, {
      ...withUnbilled,
      "/finance/invoices/raise": {
        raised: 8,
        alreadyInvoiced: 4,
        withoutStructure: 4,
      },
    });
    await mount();
    await click(
      screen.getAllByRole("button").find((b) => /Raise invoices/i.test(b.textContent ?? "")),
    );
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/4 students were skipped/),
      ),
    );
  });

  it("says nothing needed doing when everybody was already billed", async () => {
    serve(h.api, {
      ...withUnbilled,
      "/finance/invoices/raise": {
        raised: 0,
        alreadyInvoiced: 16,
        withoutStructure: 0,
      },
    });
    await mount();
    await click(
      screen.getAllByRole("button").find((b) => /Raise invoices/i.test(b.textContent ?? "")),
    );
    await waitFor(() => expect(h.toast.info).toHaveBeenCalled());
  });

  // A school that has finished billing must not be shown a button that would
  // do nothing.
  it("is not offered when everybody has a bill", async () => {
    await mount();
    expect(
      screen.queryAllByRole("button").find((b) => /Raise invoices/i.test(b.textContent ?? "")),
    ).toBeUndefined();
  });
});

describe("narrowing the roll", () => {
  it("asks the API for one status when one is chosen", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Fee status/i), {
        target: { value: "UNPAID" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/finance/register",
        expect.objectContaining({
          params: expect.objectContaining({ status: "UNPAID" }),
        }),
      ),
    );
  });

  it("asks for one class when one is chosen", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Class level/i), {
        target: { value: "level-1" },
      });
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/^Class$/i)).not.toBeDisabled(),
    );
  });

  /*
    Landing on page three of a shorter list is an empty table, which reads as
    a fault rather than as a filter.
  */
  it("goes back to the first page when the roll narrows", async () => {
    serve(h.api, {
      ...routes,
      "/finance/register": { ...feeRegister, total: 200 },
    });
    await mount();
    await click(screen.getByLabelText(/Next page/i));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Fee status/i), {
        target: { value: "CLEARED" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/finance/register",
        expect.objectContaining({
          params: expect.objectContaining({ page: 1, status: "CLEARED" }),
        }),
      ),
    );
  });

  it("does not offer paging when everybody fits on one page", async () => {
    await mount();
    expect(screen.queryByLabelText(/Next page/i)).not.toBeInTheDocument();
  });

  it("pages back as well as forward", async () => {
    serve(h.api, {
      ...routes,
      "/finance/register": { ...feeRegister, total: 200 },
    });
    await mount();
    await click(screen.getByLabelText(/Next page/i));
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/finance/register",
        expect.objectContaining({ params: expect.objectContaining({ page: 2 }) }),
      ),
    );
    await click(screen.getByLabelText(/Previous page/i));
    await waitFor(() =>
      expect(screen.getByLabelText(/Previous page/i)).toBeDisabled(),
    );
  });

  /*
    Typing is debounced, so the search reaches the API once the typing stops
    rather than once per keystroke — four hundred rows per letter otherwise.
  */
  it("searches for what was typed", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Search students/i), {
        target: { value: "  Uwase  " },
      });
    });
    await waitFor(
      () =>
        expect(h.api.get).toHaveBeenCalledWith(
          "/finance/register",
          expect.objectContaining({
            // Trimmed: a trailing space is not part of anybody's name.
            params: expect.objectContaining({ search: "Uwase", page: 1 }),
          }),
        ),
      { timeout: 3000 },
    );
  });

  // Choosing a class only makes sense once a level narrows the list to one
  // year group's streams.
  it("keeps the class picker shut until a level is chosen", async () => {
    await mount();
    expect(screen.getByLabelText(/^Class$/i)).toBeDisabled();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Class level/i), {
        target: { value: "level-1" },
      });
    });
    // The classes for that level arrive on their own request, and a select
    // will not take a value whose option is not there yet.
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/^Class$/i) as HTMLSelectElement).options.length,
      ).toBeGreaterThan(1),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^Class$/i), {
        target: { value: "section-1" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/finance/register",
        expect.objectContaining({
          params: expect.objectContaining({ classSectionId: "section-1" }),
        }),
      ),
    );
  });

  it("says nothing matched rather than that nobody has been billed", async () => {
    serve(h.api, {
      ...routes,
      "/finance/register": { data: [], total: 0, page: 1, limit: 25 },
    });
    renderPage(FeeRegisterPage, { role: "BURSAR" });
    await waitFor(() =>
      expect(screen.getByLabelText(/Fee status/i)).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Fee status/i), {
        target: { value: "UNPAID" },
      });
    });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/No students match that/i),
    );
  });
});
