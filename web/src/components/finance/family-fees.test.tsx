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
  usePathname: () => "/student/fees",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";
import {
  feeAccount,
  feeHistory,
  financeRoutes,
  standing,
} from "@/test/fee-fixtures";

import { FamilyFees } from "./family-fees";

/**
 * A family's own account.
 *
 * The page has nothing to act on, so what it owes the reader is an
 * explanation: what is owed, what has already been paid, and — where a term
 * is holding results back — that the two are the same question. A family told
 * only that they are blocked has nowhere to go with it.
 */

const routes = { ...populatedRoutes, ...financeRoutes };

const Page = () => <FamilyFees studentId="student-1" />;

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(Component: () => React.ReactElement = Page) {
  renderPage(Component, { role: "STUDENT" });
  await waitFor(() =>
    expect(screen.getByText(/Every term/)).toBeInTheDocument(),
  );
}

describe("the year at a glance", () => {
  it("lists every term that has been billed", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Term 1/);
    expect(text).toMatch(/2026-2027/);
    expect(text).toMatch(/Term 3/);
  });

  it("marks the live term", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/this term/);
  });

  it("says what is still to pay on each, and settles the rest", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/60,000 RWF to pay/);
    expect(text).toMatch(/Settled/);
  });

  it("opens on the live term rather than the oldest on record", async () => {
    await mount();
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/finance/account/student-1",
        expect.objectContaining({ params: { termId: "term-1" } }),
      ),
    );
  });

  it("shows another term when one is chosen", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByText(/Term 3/).closest("button")!);
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/finance/account/student-1",
        expect.objectContaining({ params: { termId: "term-0" } }),
      ),
    );
  });
});

/**
 * Said once, at the top, and only when it is true.
 */
describe("results being held", () => {
  it("names the term and the total, and says what releases it", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Term 1 results are held/);
    expect(text).toMatch(/60,000 RWF outstanding/);
    expect(text).toMatch(/balance reaches nil/);
  });

  it("counts the terms when more than one is held", async () => {
    serve(h.api, {
      ...routes,
      "/finance/history/student-1": feeHistory.map((entry) => ({
        ...entry,
        standing: standing(140000, 40000),
        status: "PART_PAID",
      })),
    });
    await mount();
    expect(document.body.textContent).toMatch(/2 terms of results are held/);
  });

  // A family that owes nothing must never be shown a warning about it.
  it("says nothing at all when every term is settled", async () => {
    serve(h.api, {
      ...routes,
      "/finance/history/student-1": feeHistory.map((entry) => ({
        ...entry,
        standing: standing(140000, 140000),
        status: "CLEARED",
      })),
    });
    await mount();
    expect(document.body.textContent).not.toMatch(/results are held/);
  });
});

describe("one term in detail", () => {
  /*
    The term's own card arrives on a second request, after the list of terms
    it is chosen from. Waiting for the list alone reads the page a beat too
    early and finds none of this.
  */
  async function mountTerm() {
    await mount();
    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /What is owed|Nothing has been billed/,
      ),
    );
  }

  it("leads with what is owed", async () => {
    await mountTerm();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/What is owed/);
    expect(text).toMatch(/60,000 RWF/);
  });

  it("breaks the bill down line by line", async () => {
    await mountTerm();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Tuition/);
    expect(text).toMatch(/82,000 RWF/);
    expect(text).toMatch(/Billed for the term/);
  });

  /*
    The receipt number and the reference are what a family checks against
    their own bank message, so both are here and not only in the office.
  */
  it("shows each payment with its receipt number and reference", async () => {
    await mountTerm();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/RCT-2026-0001/);
    expect(text).toMatch(/MP260212.4471.A18823/);
  });

  /**
   * A voided receipt is the office's own correction. Showing it to a family
   * as a payment they made would have them counting money twice.
   */
  it("leaves a voided receipt out of what a family sees", async () => {
    await mountTerm();
    expect(document.body.textContent).not.toMatch(/RCT-2026-0002/);
  });

  it("shows what the school is not charging, and why", async () => {
    await mountTerm();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/not charging/i);
    expect(text).toMatch(/District bursary/);
  });

  // Where to go when a payment they have made is not showing.
  it("explains that a payment can take a day or two to appear", async () => {
    await mountTerm();
    expect(document.body.textContent).toMatch(/day or two after a bank deposit/i);
  });

  // Cash handed over the counter has no reference to quote, and a dangling
  // separator after the method reads as something missing.
  it("leaves out the reference when there is none", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: {
          ...feeAccount.invoice,
          payments: [
            { ...feeAccount.invoice.payments[0], method: "CASH", reference: null },
          ],
        },
      },
    });
    await mountTerm();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Receipt RCT-2026-0001 · Cash/);
    expect(text).not.toMatch(/Cash ·/);
  });

  it("says so when a term has no bill at all", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: null,
        standing: null,
        status: "NOT_INVOICED",
      },
    });
    await mountTerm();
    expect(document.body.textContent).toMatch(/Nothing has been billed/i);
  });

  it("says so when nothing has come in yet", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: { ...feeAccount.invoice, payments: [], waivers: [] },
        standing: standing(140000, 0),
        status: "UNPAID",
      },
    });
    await mountTerm();
    expect(document.body.textContent).toMatch(/Nothing has been received/i);
  });
});

describe("the edges", () => {
  it("says so when the student has never been billed", async () => {
    serve(h.api, { ...routes, "/finance/history/student-1": [] });
    renderPage(Page, { role: "STUDENT" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/has not billed this student/i),
    );
  });

  // A parent whose account has no children linked, or a staff account that
  // somehow reached the page.
  it("says so when there is no student on the account at all", async () => {
    renderPage(() => <FamilyFees studentId="" />, { role: "PARENT" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/no fee account/i),
    );
  });

  it("does not go blank when the account fails to load", async () => {
    serveFailure(h.api);
    renderPage(Page, { role: "STUDENT" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});
