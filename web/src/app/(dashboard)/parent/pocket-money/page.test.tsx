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
  usePathname: () => "/parent/pocket-money",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import ParentPocketMoneyPage from "./page";

/**
 * Where the money went.
 *
 * The school is holding someone else's child's cash, so what these tests
 * protect is not a happy path: the statement has to agree with the balance
 * even when an entry was corrected, and the controls a parent sets have to
 * reach the API as the values they typed rather than as zeroes.
 */

const account = {
  studentId: "student-1",
  student: {
    name: "Divine Niyonkuru",
    studentIdNumber: "STD-2025-231419-167",
    level: "Senior 1",
    photoUrl: null,
  },
  balance: 8000,
  spentToday: 1200,
  dailyLimit: 2000,
  remainingToday: 800,
  lowBalanceAlert: 1000,
  isFrozen: false,
  isLow: false,
};

const statement = {
  data: [
    {
      id: "t-3",
      kind: "REVERSAL",
      amount: 500,
      signedAmount: 500,
      note: "Charged twice at the canteen",
      createdAt: "2026-08-23T10:00:00Z",
      recordedBy: "Aline Uwase",
      reversesId: "t-2",
      isReversed: false,
    },
    {
      id: "t-2",
      kind: "WITHDRAWAL",
      amount: 500,
      signedAmount: -500,
      note: "Canteen",
      createdAt: "2026-08-23T09:00:00Z",
      recordedBy: "Aline Uwase",
      reversesId: null,
      isReversed: true,
    },
    {
      id: "t-1",
      kind: "DEPOSIT",
      amount: 10000,
      signedAmount: 10000,
      note: "Visiting day",
      createdAt: "2026-08-20T09:00:00Z",
      recordedBy: "Aline Uwase",
      reversesId: null,
      isReversed: false,
    },
  ],
  meta: { total: 3, page: 1, limit: 50, totalPages: 1 },
};

const parentUser = {
  id: "user-1",
  parentStudents: [
    {
      student: {
        id: "student-1",
        studentIdNumber: "STD-2025-231419-167",
        user: { firstName: "Divine", lastName: "Niyonkuru" },
      },
    },
  ],
};

const twoChildren = {
  ...parentUser,
  parentStudents: [
    ...parentUser.parentStudents,
    {
      student: {
        id: "student-2",
        studentIdNumber: "STD-2025-231419-168",
        user: { firstName: "Keza", lastName: "Mutesi" },
      },
    },
  ],
};

const routes: Record<string, unknown> = {
  ...populatedRoutes,
  "/pocket-money/student/student-1/statement": statement,
  "/pocket-money/student/student-1": account,
  "/pocket-money/student/student-2/statement": {
    data: [],
    meta: { total: 0, page: 1, limit: 50, totalPages: 1 },
  },
  "/pocket-money/student/student-2": { ...account, studentId: "student-2" },
  "/pocket-money/limits": account,
  "/users/user-1": parentUser,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function button(name: RegExp) {
  return screen
    .queryAllByRole("button")
    .find((b) => name.test((b.textContent ?? "").trim()));
}

async function mount(over: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, ...over });
  renderPage(ParentPocketMoneyPage, { role: "PARENT", user: { id: "user-1" } });
  await waitFor(() => expect(screen.getByText(/8,000 RWF/)).toBeInTheDocument());
}

describe("what a parent sees", () => {
  it("leads with what the school is holding", async () => {
    await mount();
    expect(screen.getByText(/held by the school/i)).toBeInTheDocument();
    expect(screen.getByText("8,000 RWF")).toBeInTheDocument();
  });

  it("says how much of today's allowance has gone", async () => {
    await mount();
    expect(screen.getByText(/1,200 RWF spent today/)).toBeInTheDocument();
  });

  it("warns when the balance is running out", async () => {
    await mount({ "/pocket-money/student/student-1": { ...account, isLow: true } });
    expect(screen.getByText(/running low/i)).toBeInTheDocument();
  });

  it("says when the school has frozen the account", async () => {
    await mount({
      "/pocket-money/student/student-1": { ...account, isFrozen: true },
    });
    expect(screen.getByText(/frozen by the school/i)).toBeInTheDocument();
  });

  it("hides the daily limit line when there is none", async () => {
    await mount({
      "/pocket-money/student/student-1": { ...account, dailyLimit: null },
    });
    // The label on the control box says "Daily limit" too, so this asks about
    // the summary line specifically.
    expect(screen.queryByText(/daily limit 2,000 RWF/i)).not.toBeInTheDocument();
  });

  it("lists every entry with what it was for and who recorded it", async () => {
    await mount();
    const row = screen.getByText("Visiting day").closest("tr")!;
    expect(within(row).getByText("Money in")).toBeInTheDocument();
    expect(within(row).getByText("Aline Uwase")).toBeInTheDocument();
  });

  // Hiding a corrected entry would make the statement disagree with the
  // balance, which is exactly the confusion this page exists to end.
  it("keeps a corrected entry visible and marks it", async () => {
    await mount();
    const row = screen.getByText("Canteen").closest("tr")!;
    expect(within(row).getByText(/reversed/i)).toBeInTheDocument();
    expect(screen.getByText("Correction")).toBeInTheDocument();
  });

  it("says so when nothing has moved", async () => {
    await mount({
      "/pocket-money/student/student-1/statement": {
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 1 },
      },
    });
    expect(screen.getByText(/nothing has moved/i)).toBeInTheDocument();
  });

  it("says so when the account has no children linked", async () => {
    serve(h.api, { ...routes, "/users/user-1": { id: "user-1", parentStudents: [] } });
    renderPage(ParentPocketMoneyPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText(/no linked children/i)).toBeInTheDocument(),
    );
  });

  it("survives the API being down", async () => {
    serveFailure(h.api);
    renderPage(ParentPocketMoneyPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText("Pocket money")).toBeInTheDocument(),
    );
  });
});

/**
 * A daily limit is what makes a term's money last a term, so the values a
 * parent types have to arrive as those values.
 */
describe("the controls a parent sets", () => {
  it("fills the boxes with what is already set", async () => {
    await mount();
    expect(screen.getByLabelText(/daily limit/i)).toHaveValue(2000);
    expect(screen.getByLabelText(/warn me below/i)).toHaveValue(1000);
  });

  it("sends the numbers typed", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/daily limit/i), {
        target: { value: "1500" },
      });
      fireEvent.change(screen.getByLabelText(/warn me below/i), {
        target: { value: "500" },
      });
    });
    await click(button(/^save$/i));
    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith("/pocket-money/limits", {
        studentId: "student-1",
        dailyLimit: 1500,
        lowBalanceAlert: 500,
      }),
    );
  });

  // An empty box means "no limit", and Number("") is 0, which would freeze
  // the child out of the canteen entirely.
  it("sends null rather than zero for an empty box", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/daily limit/i), {
        target: { value: "" },
      });
      fireEvent.change(screen.getByLabelText(/warn me below/i), {
        target: { value: "" },
      });
    });
    await click(button(/^save$/i));
    await waitFor(() => {
      const call = h.api.put.mock.calls.find((c: any[]) =>
        String(c[0]).includes("/limits"),
      );
      expect(call?.[1]).toMatchObject({
        dailyLimit: null,
        lowBalanceAlert: null,
      });
    });
  });
});

describe("more than one child", () => {
  it("offers no chooser to a parent with one child", async () => {
    await mount();
    expect(screen.queryByLabelText("Child")).not.toBeInTheDocument();
  });

  it("switches which child is shown", async () => {
    serve(h.api, { ...routes, "/users/user-1": twoChildren });
    renderPage(ParentPocketMoneyPage, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByLabelText("Child")).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Child"), {
        target: { value: "student-2" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith("/pocket-money/student/student-2"),
    );
  });
});

/**
 * A line on the statement that nobody signed.
 *
 * A top-up made through a payment gateway is not recorded by a member of
 * staff, so there is no name to show. A parent reading the statement must see
 * a blank rather than the word "undefined" against their child's money.
 */
describe("a statement line nobody signed", () => {
  it("draws an em dash where the name would be", async () => {
    await mount({
      "/pocket-money/student/student-1/statement": {
        data: [
          {
            id: "t-9",
            kind: "DEPOSIT",
            amount: 5000,
            signedAmount: 5000,
            note: "Mobile money top-up",
            createdAt: "2026-08-23T08:00:00Z",
            recordedBy: null,
            isReversed: false,
          },
        ],
        meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
      },
    });

    const row = (await screen.findByText("Mobile money top-up")).closest("tr")!;
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/undefined|null/);
  });
});
