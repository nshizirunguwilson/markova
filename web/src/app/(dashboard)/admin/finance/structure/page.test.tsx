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
  usePathname: () => "/admin/finance/structure",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";
import { feeStructure, financeRoutes } from "@/test/fee-fixtures";

import FeeStructurePage from "./page";

/**
 * The price list.
 *
 * The distinction this page turns on is that these are prices and not bills:
 * an invoice keeps its own copy of the lines from the moment it is raised. If
 * that were not true, editing here would silently rewrite what families had
 * already been asked for, so the page says it and these tests hold it said.
 */

const routes = { ...populatedRoutes, ...financeRoutes };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(FeeStructurePage, { role: "BURSAR" });
  await waitFor(() => expect(screen.getByText(/Senior 1/)).toBeInTheDocument());
}

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
};

const button = (name: RegExp) =>
  screen.queryAllByRole("button").find((b) => name.test(b.textContent ?? ""));

const type = async (label: RegExp, value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};

describe("what a level is charged", () => {
  it("lists every line with its amount", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Tuition/);
    expect(text).toMatch(/82,000 RWF/);
    expect(text).toMatch(/Boarding/);
  });

  /**
   * The number a parent asks for on the phone. Working it out by adding up
   * which lines apply is the arithmetic this page exists to stop.
   */
  it("shows the boarder and day totals side by side", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Boarder pays/);
    expect(text).toMatch(/140,000 RWF/);
    expect(text).toMatch(/Day student pays/);
    expect(text).toMatch(/106,000 RWF/);
  });

  // Only where it narrows the charge: "Everyone" on four lines in five is
  // noise that hides the two that matter.
  it("marks only the lines that do not apply to everybody", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Boarders/);
    expect(text).toMatch(/Day students/);
    expect(text).not.toMatch(/Everyone/);
  });

  it("says a level with no lines cannot be invoiced", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/cannot be invoiced/i);
  });

  it("says prices are not bills", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/These are prices, not bills/i);
  });

  it("says so when the term has no price list at all", async () => {
    serve(h.api, {
      ...routes,
      "/finance/structure": feeStructure.map((l) => ({ ...l, items: [] })),
    });
    renderPage(FeeStructurePage, { role: "BURSAR" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/no fee lines yet/i),
    );
  });

  it("does not go blank when the price list fails to load", async () => {
    serveFailure(h.api);
    renderPage(FeeStructurePage, { role: "BURSAR" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("changing a line", () => {
  it("opens with what the line already says", async () => {
    await mount();
    await click(screen.getByLabelText(/Edit Tuition/i));
    expect(screen.getByLabelText(/What it is for/i)).toHaveValue("Tuition");
    expect(screen.getByLabelText(/Amount/i)).toHaveValue(82000);
  });

  it("saves the change against the line it opened", async () => {
    serve(h.api, { ...routes, "/finance/structure/item": { id: "item-1" } });
    await mount();
    await click(screen.getByLabelText(/Edit Tuition/i));
    await type(/Amount/i, "90000");
    await click(button(/^Save$/));

    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith(
        "/finance/structure/item",
        expect.objectContaining({
          id: "item-1",
          name: "Tuition",
          amount: 90000,
          classLevelId: "level-1",
        }),
      ),
    );
  });

  it("adds a new line without an id", async () => {
    serve(h.api, { ...routes, "/finance/structure/item": { id: "item-9" } });
    await mount();
    await click(button(/Add a line/));
    await type(/What it is for/i, "Uniform");
    await type(/Amount/i, "15000");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Who pays it/i), {
        target: { value: "BOARDER" },
      });
    });
    await click(button(/^Save$/));

    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith(
        "/finance/structure/item",
        expect.objectContaining({
          id: undefined,
          name: "Uniform",
          amount: 15000,
          appliesTo: "BOARDER",
        }),
      ),
    );
  });

  it("will not save a line with no name", async () => {
    await mount();
    await click(button(/Add a line/));
    await type(/Amount/i, "1000");
    const dialog = screen.getByRole("dialog");
    const save = within(dialog)
      .getAllByRole("button")
      .find((b) => /^Save$/.test(b.textContent ?? ""));
    expect(save).toBeDisabled();
  });

  it("leaves the line alone when the editor is cancelled", async () => {
    await mount();
    await click(screen.getByLabelText(/Edit Tuition/i));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.put).not.toHaveBeenCalled();
  });

  it("says so when the API refuses the change", async () => {
    await mount();
    h.api.put.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "A fee line needs a name" } },
    });
    await click(screen.getByLabelText(/Edit Tuition/i));
    await type(/Amount/i, "90000");
    await click(button(/^Save$/));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("A fee line needs a name"),
    );
  });

  // Where a student sleeps decides which lines they get, so moving them into
  // the dormitory changes their next bill on its own.
  it("explains that boarding decides which lines a student gets", async () => {
    await mount();
    await click(button(/Add a line/));
    expect(screen.getByRole("dialog").textContent).toMatch(
      /follows from where they sleep/i,
    );
  });
});

describe("removing a line", () => {
  /**
   * The reassurance that makes this safe to do mid-term: an invoice keeps its
   * own copy of the line, so a family is never re-billed for a price the
   * school has since dropped.
   */
  it("says invoices already raised are not changed", async () => {
    await mount();
    await click(screen.getByLabelText(/Remove Tuition/i));
    expect(screen.getByRole("dialog").textContent).toMatch(
      /already raised keep their own copy/i,
    );
  });

  it("keeps the line when the removal is cancelled", async () => {
    await mount();
    await click(screen.getByLabelText(/Remove Tuition/i));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("removes it once confirmed", async () => {
    serve(h.api, { ...routes, "/finance/structure/item/item-1": { deleted: true } });
    await mount();
    await click(screen.getByLabelText(/Remove Tuition/i));
    await click(button(/Remove it/));
    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith("/finance/structure/item/item-1"),
    );
  });
});

/**
 * Copying a term across. Fees change a little between terms and not at all
 * between most of them, so the alternative is typing forty lines again.
 */
describe("copying another term's prices", () => {
  it("says lines this term already has are left alone", async () => {
    await mount();
    await click(button(/Copy from another term/));
    expect(screen.getByRole("dialog").textContent).toMatch(
      /left as they are/i,
    );
  });

  it("will not copy until a term is chosen", async () => {
    await mount();
    await click(button(/Copy from another term/));
    const dialog = screen.getByRole("dialog");
    const copy = within(dialog)
      .getAllByRole("button")
      .find((b) => /Copy the lines/i.test(b.textContent ?? ""));
    expect(copy).toBeDisabled();
  });

  it("copies from the term chosen", async () => {
    serve(h.api, {
      ...routes,
      "/finance/structure/copy": { copied: 6, skipped: 0 },
    });
    await mount();
    await click(button(/Copy from another term/));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Copy from/i), {
        target: { value: "term-0" },
      });
    });
    await click(button(/Copy the lines/));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/finance/structure/copy", {
        fromTermId: "term-0",
        toTermId: "term-1",
      }),
    );
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith("6 lines copied."),
    );
  });

  it("says how many were skipped when some already existed", async () => {
    serve(h.api, {
      ...routes,
      "/finance/structure/copy": { copied: 4, skipped: 2 },
    });
    await mount();
    await click(button(/Copy from another term/));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Copy from/i), {
        target: { value: "term-0" },
      });
    });
    await click(button(/Copy the lines/));
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/2 were already there/),
      ),
    );
  });

  it("closes without copying when cancelled", async () => {
    await mount();
    await click(button(/Copy from another term/));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("lists a term that carries no academic year", async () => {
    serve(h.api, {
      ...routes,
      "/academic/terms": [
        { id: "term-1", name: "Term 1", isCurrent: true },
        { id: "term-9", name: "Term 3" },
      ],
    });
    await mount();
    await click(button(/Copy from another term/));
    const options = within(screen.getByLabelText(/Copy from/i) as HTMLElement)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toContain("Term 3");
  });

  // Copying a term onto itself is always a slip, so it is not offered.
  it("does not offer the term already open as a source", async () => {
    await mount();
    await click(button(/Copy from another term/));
    const options = within(screen.getByLabelText(/Copy from/i) as HTMLElement)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).not.toContain("term-1");
  });
});
