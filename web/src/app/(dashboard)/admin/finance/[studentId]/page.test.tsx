import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    // The term in the address, which a link into this page may not carry.
    search: { current: "termId=term-1" },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/finance/student-1",
  useSearchParams: () => new URLSearchParams(h.search.current),
  useParams: () => ({ studentId: "student-1" }),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";
import {
  feeAccount,
  feePayment,
  financeRoutes,
  standing,
} from "@/test/fee-fixtures";

import FeeAccountPage from "./page";

/**
 * One student's term, at the counter.
 *
 * The promises worth holding here are the ones that make the book trustworthy
 * rather than merely usable: a voided receipt stays on the page, a correction
 * cannot be made without a reason, and the bill a family was actually sent is
 * shown as it was sent.
 */

const routes = { ...populatedRoutes, ...financeRoutes };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.search.current = "termId=term-1";
  serve(h.api, routes);
});

async function mount() {
  renderPage(FeeAccountPage, { role: "BURSAR" });
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

const button = (name: RegExp) =>
  screen.queryAllByRole("button").find((b) => name.test(b.textContent ?? ""));

const type = async (label: RegExp, value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};

describe("what the counter shows", () => {
  it("leads with the balance, which is what somebody is standing there for", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/60,000 RWF/);
  });

  it("names the student, their number and whether they board", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/STD-2026-0001/);
    expect(text).toMatch(/Senior 1 A/);
    expect(text).toMatch(/Boarder/);
  });

  it("shows the bill line by line, as it was sent", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Tuition/);
    expect(text).toMatch(/82,000 RWF/);
    expect(text).toMatch(/Boarding/);
  });

  /*
    The lines are a copy taken when the bill was raised. Saying so is what
    stops an argument when the price list changes mid-year.
  */
  it("says the bill was fixed when it was raised", async () => {
    await mount();
    expect(document.body.textContent).toMatch(
      /fixed when the invoice was raised/i,
    );
  });

  it("shows each receipt with its number, method and reference", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/RCT-2026-0001/);
    expect(text).toMatch(/Mobile money/);
    expect(text).toMatch(/MP260212.4471.A18823/);
  });

  it("says who took each payment", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Taken by Straton Nsengiyumva/);
  });

  /**
   * A voided receipt keeps its place. It is the correction a bursar shows
   * somebody, and hiding it would leave an unexplained gap in the numbering.
   */
  it("keeps a voided receipt on the page, with its reason", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/RCT-2026-0002/);
    expect(text).toMatch(/Entered twice at the counter/);
  });

  it("shows what has been written off, and why", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/School bursary/);
    expect(text).toMatch(/District bursary, confirmed by the sector office/);
  });

  /*
    Entries the system makes itself carry no name. "the office" is the honest
    answer; a blank there reads as a missing record.
  */
  it("credits the office for an entry nobody is recorded against", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: {
          ...feeAccount.invoice,
          payments: [{ ...feePayment, recordedBy: null }],
          waivers: [{ ...feeAccount.invoice.waivers[0], grantedBy: null }],
        },
      },
    });
    await mount();
    expect(document.body.textContent).toMatch(/Taken by the office/);
    expect(document.body.textContent).toMatch(/by the office/);
  });

  it("says so when nothing has come in and nothing has been written off", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: { ...feeAccount.invoice, payments: [], waivers: [] },
      },
    });
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Nothing has come in yet/i);
    expect(text).toMatch(/Nothing has been written off/i);
  });

  /*
    A withdrawn waiver keeps its place for the same reason a voided receipt
    does: it is the record of a decision that was made and then reversed.
  */
  it("keeps a withdrawn waiver on the page, with its reason", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: {
          ...feeAccount.invoice,
          waivers: [
            {
              ...feeAccount.invoice.waivers[0],
              revokedAt: "2026-10-01T00:00:00.000Z",
              revokeReason: "Sponsor withdrew",
              revokedBy: { firstName: "Straton", lastName: "Nsengiyumva" },
            },
          ],
        },
      },
    });
    await mount();
    expect(document.body.textContent).toMatch(/Withdrawn 1 Oct 2026/);
    expect(document.body.textContent).toMatch(/Sponsor withdrew/);
  });

  it("offers no way to withdraw a waiver that is already withdrawn", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: {
          ...feeAccount.invoice,
          waivers: [
            { ...feeAccount.invoice.waivers[0], revokedAt: "2026-10-01T00:00:00.000Z" },
          ],
        },
      },
    });
    await mount();
    expect(
      screen.queryByLabelText(/Withdraw this waiver/i),
    ).not.toBeInTheDocument();
  });

  it("shows a dash rather than a figure when there is no standing", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: null,
        standing: null,
        status: "NOT_INVOICED",
      },
    });
    await mount();
    // The balance itself, not merely a hyphen somewhere on the page.
    expect(
      [...document.querySelectorAll("p")].map((p) => p.textContent?.trim()),
    ).toContain("-");
  });

  /*
    A link into this page need not carry a term - a bookmark, or a message
    from the office. The picker falls back to the current one rather than the
    page opening on nothing.
  */
  it("falls back to the current term when the address carries none", async () => {
    h.search.current = "";
    await mount();
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/finance/account/student-1",
        expect.objectContaining({ params: { termId: "term-1" } }),
      ),
    );
  });

  it("says no class rather than leaving a gap for a student without one", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        student: { ...feeAccount.student, classSection: null, isBoarder: false },
      },
    });
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/no class/);
    expect(text).toMatch(/Day student/);
  });

  // Voided by an older record that carried no reason: the void still shows.
  it("shows a void that carries no reason", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        invoice: {
          ...feeAccount.invoice,
          payments: [{ ...feePayment, voidedAt: "2026-09-14T00:00:00.000Z", voidReason: null, voidedBy: null }],
        },
      },
    });
    await mount();
    expect(document.body.textContent).toMatch(/Voided 14 Sept? 2026 by the office/);
  });

  it("does not go blank when the account fails to load", async () => {
    serveFailure(h.api);
    renderPage(FeeAccountPage, { role: "BURSAR" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("a student nobody has billed", () => {
  const unbilled = {
    ...routes,
    "/finance/account/student-1": {
      ...feeAccount,
      invoice: null,
      standing: null,
      status: "NOT_INVOICED",
    },
  };

  it("says so, and where to go about it", async () => {
    serve(h.api, unbilled);
    await mount();
    expect(document.body.textContent).toMatch(/has not been billed/i);
  });

  // Nothing to pay against and nothing to write off, so neither is offered.
  it("offers neither a payment nor a waiver", async () => {
    serve(h.api, unbilled);
    await mount();
    expect(button(/Record a payment/)).toBeUndefined();
    expect(button(/Grant a waiver/)).toBeUndefined();
  });
});

describe("taking a payment", () => {
  const open = async () => {
    await mount();
    await click(button(/Record a payment/));
    return screen.findByRole("dialog");
  };

  it("shows what is outstanding before anything is typed", async () => {
    const dialog = await open();
    expect(dialog.textContent).toMatch(/60,000 RWF outstanding/);
  });

  /*
    The reference is a different thing for each method - a deposit slip, a
    MoMo message, a cheque stub - and one generic "Reference" is what gets the
    wrong number typed into it.
  */
  it("asks for the reference by the name of whatever they are holding", async () => {
    await open();
    expect(screen.getByLabelText(/Deposit slip number/i)).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/How it was paid/i), {
        target: { value: "MOBILE_MONEY" },
      });
    });
    expect(screen.getByLabelText(/Transaction ID/i)).toBeInTheDocument();
  });

  it("will not send an empty amount", async () => {
    const dialog = await open();
    const submit = within(dialog)
      .getAllByRole("button")
      .find((b) => /Record it/i.test(b.textContent ?? ""));
    expect(submit).toBeDisabled();
  });

  it("sends what was typed and reports the receipt", async () => {
    serve(h.api, { ...routes, "/finance/payments": feePayment });
    await open();
    await type(/Amount/i, "60000");
    await type(/Deposit slip number/i, "BK/260912/447102");
    await click(button(/Record it and issue a receipt/));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/finance/payments",
        expect.objectContaining({
          studentId: "student-1",
          termId: "term-1",
          amount: 60000,
          method: "BANK_DEPOSIT",
          reference: "BK/260912/447102",
        }),
      ),
    );
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        "Receipt RCT-2026-0001 issued",
      ),
    );
  });

  it("records the date the money changed hands and any note", async () => {
    serve(h.api, { ...routes, "/finance/payments": feePayment });
    await open();
    await type(/Amount/i, "60000");
    await type(/Date the money changed hands/i, "2026-09-12");
    await type(/^Note$/i, "Handed in by the mother");
    await click(button(/Record it and issue a receipt/));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/finance/payments",
        expect.objectContaining({
          paidAt: "2026-09-12",
          note: "Handed in by the mother",
        }),
      ),
    );
  });

  it("closes without recording anything when cancelled", async () => {
    await open();
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("says so when the API refuses it", async () => {
    serve(h.api, routes);
    h.api.post.mockRejectedValue({
      // Shaped as axios shapes one, which is what errorMessage reads.
      isAxiosError: true,
      response: { status: 400, data: { message: "That student has no invoice" } },
    });
    await open();
    await type(/Amount/i, "1000");
    await click(button(/Record it and issue a receipt/));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("That student has no invoice"),
    );
  });
});

describe("writing part of a bill off", () => {
  const open = async () => {
    await mount();
    await click(button(/Grant a waiver/));
    return screen.findByRole("dialog");
  };

  /**
   * The point of a waiver is that a sponsored student can be shown their
   * results, and the screen says so rather than leaving it to be inferred.
   */
  it("explains that it clears the term exactly as a payment does", async () => {
    const dialog = await open();
    expect(dialog.textContent).toMatch(/clears the term exactly as a payment/i);
  });

  it("explains what each kind of waiver is for", async () => {
    const dialog = await open();
    expect(dialog.textContent).toMatch(/means-tested/i);
  });

  it("says the most that can be written off", async () => {
    const dialog = await open();
    expect(dialog.textContent).toMatch(/At most 60,000 RWF/);
  });

  // The common case is the whole balance, and making somebody retype it is
  // how the wrong figure gets in.
  it("offers the whole balance in one click", async () => {
    await open();
    await click(button(/Write off the whole balance/));
    expect(screen.getByLabelText(/Amount to write off/i)).toHaveValue(60000);
  });

  it("will not send one without a reason", async () => {
    const dialog = await open();
    await type(/Amount to write off/i, "60000");
    const submit = within(dialog)
      .getAllByRole("button")
      .find((b) => /Grant it/i.test(b.textContent ?? ""));
    expect(submit).toBeDisabled();
  });

  it("closes without writing anything off when cancelled", async () => {
    await open();
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("sends the kind that was chosen", async () => {
    serve(h.api, { ...routes, "/finance/waivers": { id: "w-3" } });
    await open();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/What kind/i), {
        target: { value: "SPONSORSHIP" },
      });
    });
    await type(/Amount to write off/i, "10000");
    await type(/^Why$/i, "Sector office");
    await click(button(/Grant it/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/finance/waivers",
        expect.objectContaining({ kind: "SPONSORSHIP" }),
      ),
    );
  });

  it("sends the kind, the amount and the reason", async () => {
    serve(h.api, { ...routes, "/finance/waivers": { id: "w-2" } });
    await open();
    await type(/Amount to write off/i, "60000");
    await type(/^Why$/i, "Sector office bursary");
    await click(button(/Grant it/));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/finance/waivers",
        expect.objectContaining({
          studentId: "student-1",
          termId: "term-1",
          kind: "BURSARY",
          amount: 60000,
          reason: "Sector office bursary",
        }),
      ),
    );
  });
});

/**
 * Corrections. Nothing is erased, and nothing is corrected silently: both of
 * these refuse to proceed without a reason, because an unexplained correction
 * is indistinguishable from a mistake.
 */
describe("correcting the book", () => {
  it("will not void a receipt without a reason", async () => {
    await mount();
    await click(screen.getByLabelText(/Void receipt RCT-2026-0001/i));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog)
      .getAllByRole("button")
      .find((b) => /Void it/i.test(b.textContent ?? ""));
    expect(submit).toBeDisabled();
  });

  it("says the receipt stays in the book", async () => {
    await mount();
    await click(screen.getByLabelText(/Void receipt RCT-2026-0001/i));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/stays in the book/i);
  });

  it("sends the void with its reason", async () => {
    serve(h.api, { ...routes, "/finance/payments/void": feePayment });
    await mount();
    await click(screen.getByLabelText(/Void receipt RCT-2026-0001/i));
    await type(/^Why$/i, "Bank reversed the deposit");
    await click(button(/Void it/));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/finance/payments/void", {
        paymentId: "pay-1",
        reason: "Bank reversed the deposit",
      }),
    );
  });

  // A voided receipt cannot be voided again: the second reason would overwrite
  // the first, so the control is simply not there.
  it("offers no way to void a receipt that is already void", async () => {
    await mount();
    expect(
      screen.queryByLabelText(/Void receipt RCT-2026-0002/i),
    ).not.toBeInTheDocument();
  });

  it("closes without voiding when the void is cancelled", async () => {
    await mount();
    await click(screen.getByLabelText(/Void receipt RCT-2026-0001/i));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("closes without withdrawing when the withdrawal is cancelled", async () => {
    await mount();
    await click(screen.getByLabelText(/Withdraw this waiver/i));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("will not withdraw a waiver without a reason", async () => {
    await mount();
    await click(screen.getByLabelText(/Withdraw this waiver/i));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog)
      .getAllByRole("button")
      .find((b) => /Withdraw it/i.test(b.textContent ?? ""));
    expect(submit).toBeDisabled();
  });

  it("sends the withdrawal with its reason", async () => {
    serve(h.api, { ...routes, "/finance/waivers/revoke": { id: "waiver-1" } });
    await mount();
    await click(screen.getByLabelText(/Withdraw this waiver/i));
    await type(/^Why$/i, "Sponsor pulled out");
    await click(button(/Withdraw it/));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/finance/waivers/revoke", {
        waiverId: "waiver-1",
        reason: "Sponsor pulled out",
      }),
    );
  });
});

describe("a term that has been settled", () => {
  it("shows nothing owed rather than a debt of zero dressed as one", async () => {
    serve(h.api, {
      ...routes,
      "/finance/account/student-1": {
        ...feeAccount,
        standing: standing(140000, 140000),
        status: "CLEARED",
      },
    });
    await mount();
    expect(document.body.textContent).toMatch(/Paid in full/);
  });
});
