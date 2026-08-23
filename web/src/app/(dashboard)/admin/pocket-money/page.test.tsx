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
  usePathname: () => "/admin/pocket-money",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, classSection, populatedRoutes } from "@/test/fixtures";

import PocketMoneyPage from "./page";

/**
 * The counter a patron or matron stands at.
 *
 * The school is holding a child's money, so what these tests protect is not a
 * happy path but a set of promises: the balance is what the ledger says, a
 * refusal explains itself, and a correction never erases the original entry.
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
      id: "t-2",
      kind: "WITHDRAWAL",
      amount: 1200,
      signedAmount: -1200,
      note: "Canteen",
      createdAt: "2026-08-23T09:00:00Z",
      recordedBy: "Aline Uwase",
      reversesId: null,
      isReversed: false,
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
  meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
};

const overview = {
  items: [
    {
      studentId: "student-1",
      name: "Divine Niyonkuru",
      studentIdNumber: "STD-2025-231419-167",
      class: "Senior 1 A",
      balance: 8000,
      dailyLimit: 2000,
      isFrozen: false,
      hasAccount: true,
    },
    {
      studentId: "student-2",
      name: "Keza Mutesi",
      studentIdNumber: "STD-2025-231419-168",
      class: "Senior 1 B",
      balance: 0,
      dailyLimit: null,
      isFrozen: true,
      hasAccount: true,
    },
  ],
  totalHeld: 8000,
  meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
};

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel],
  "/academic/sections": [classSection],
  "/pocket-money/overview": overview,
  "/pocket-money/student/student-1/statement": statement,
  "/pocket-money/student/student-1": account,
  "/pocket-money/lookup": account,
  "/pocket-money/deposit": account,
  "/pocket-money/withdraw": account,
  "/pocket-money/refund": account,
  "/pocket-money/reverse": account,
  "/pocket-money/limits": account,
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(PocketMoneyPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function button(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

/** Opens one student's counter view. */
async function openCounter() {
  await mount();
  await click(screen.getAllByRole("button", { name: /^open$/i })[0]);
  return screen.findByRole("dialog");
}

describe("what the counter shows", () => {
  it("lists the students and what is held for them", async () => {
    await mount();
    expect(screen.getByText(/Keza Mutesi/)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/8,000/);
  });

  // The office needs one number: what the school is holding in total.
  it("shows the total the school is holding", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Held for students/i);
    expect(document.body.textContent).toMatch(/8,000 RWF/);
  });

  it("marks a frozen account as frozen", async () => {
    await mount();
    const row = screen.getByText(/Keza Mutesi/).closest("tr")!;
    expect(row.textContent).toMatch(/frozen/i);
  });

  it("does not go blank when the list fails to load", async () => {
    serveFailure(h.api);
    renderPage(PocketMoneyPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

/**
 * The scanner is the whole point of the counter: a queue moves at the speed of
 * scan, look, pay.
 */
describe("scanning a card at the counter", () => {
  it("looks the student up from a scanned code", async () => {
    await mount();
    const box = screen.getByLabelText(/scan a card/i);
    await act(async () => {
      fireEvent.change(box, { target: { value: "H0M2-H949-MPPX" } });
    });

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/pocket-money/lookup"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).identifier).toBe("H0M2-H949-MPPX");
    });
  });

  it("opens the account it found", async () => {
    await mount();
    const box = screen.getByLabelText(/scan a card/i);
    await act(async () => {
      fireEvent.change(box, { target: { value: "STD-2025-231419-167" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  // A scanner fires Enter after every code, so the box has to empty itself or
  // the next scan appends to the last.
  it("clears the box for the next student", async () => {
    await mount();
    const box = screen.getByLabelText(/scan a card/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(box, { target: { value: "STD-2025-231419-167" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => expect(box.value).toBe(""));
  });

  it("looks up nothing on an empty scan", async () => {
    await mount();
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/scan a card/i), {
        key: "Enter",
        code: "Enter",
      });
    });

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });
});

describe("one student's account", () => {
  it("shows the balance as the largest thing on it", async () => {
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/8,000 RWF/));
  });

  it("names the student and their number", async () => {
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/STD-2025-231419-167/));
  });

  // A daily limit is meaningless without saying how much of today is left.
  it("says what is left of today's limit", async () => {
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/800 RWF left of today/i));
  });

  it("shows the statement beneath it", async () => {
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/Canteen/));
    expect(dialog.textContent).toMatch(/Visiting day/);
  });

  // Money in and money out must never be confused on a statement.
  it("shows what went out as negative and what came in as positive", async () => {
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/Canteen/));
    expect(dialog.textContent).toMatch(/−1,200 RWF/);
    expect(dialog.textContent).toMatch(/\+10,000 RWF/);
  });

  it("names who was at the counter for each entry", async () => {
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/by Aline Uwase/));
  });
});

describe("moving money", () => {
  async function enterAmount(dialog: HTMLElement, amount: string) {
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/amount/i), {
        target: { value: amount },
      });
    });
  }

  it("takes money in", async () => {
    const dialog = await openCounter();
    await enterAmount(dialog, "5000");

    h.api.post.mockClear();
    await click(within(dialog).getAllByRole("button").find((b) => /take in/i.test(b.textContent ?? "")));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/pocket-money/deposit"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).amount).toBe(5000);
      expect((call![1] as any).studentId).toBe("student-1");
    });
  });

  it("pays money out", async () => {
    const dialog = await openCounter();
    await enterAmount(dialog, "1500");

    h.api.post.mockClear();
    await click(within(dialog).getAllByRole("button").find((b) => /pay out/i.test(b.textContent ?? "")));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/pocket-money/withdraw"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).amount).toBe(1500);
    });
  });

  it("returns money to the family", async () => {
    const dialog = await openCounter();
    await enterAmount(dialog, "8000");

    h.api.post.mockClear();
    await click(
      within(dialog).getAllByRole("button").find((b) => /return to family/i.test(b.textContent ?? "")),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/pocket-money/refund"),
      );
      expect(call).toBeTruthy();
    });
  });

  it("carries the note through", async () => {
    const dialog = await openCounter();
    await enterAmount(dialog, "2000");
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/note/i), {
        target: { value: "Bread and soap" },
      });
    });

    h.api.post.mockClear();
    await click(within(dialog).getAllByRole("button").find((b) => /pay out/i.test(b.textContent ?? "")));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/withdraw"),
      );
      expect((call![1] as any).note).toBe("Bread and soap");
    });
  });

  // A blank or zero amount is a slip, not an instruction.
  it("refuses to move nothing", async () => {
    const dialog = await openCounter();
    const takeIn = within(dialog)
      .getAllByRole("button")
      .find((b) => /take in/i.test(b.textContent ?? ""));
    expect(takeIn).toBeDisabled();
  });

  it("refuses a negative amount", async () => {
    const dialog = await openCounter();
    await enterAmount(dialog, "-500");

    const takeIn = within(dialog)
      .getAllByRole("button")
      .find((b) => /take in/i.test(b.textContent ?? ""));
    expect(takeIn).toBeDisabled();
  });

  it("clears the amount after the money moves", async () => {
    const dialog = await openCounter();
    await enterAmount(dialog, "5000");
    await click(within(dialog).getAllByRole("button").find((b) => /take in/i.test(b.textContent ?? "")));

    await waitFor(() =>
      expect((within(dialog).getByLabelText(/amount/i) as HTMLInputElement).value).toBe(""),
    );
  });

  // The server's refusal names the balance or the remaining allowance, which a
  // generic message cannot.
  it("passes the counter the server's own refusal", async () => {
    const dialog = await openCounter();
    await enterAmount(dialog, "99000");

    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Only 8000 RWF left" } },
    });
    h.toast.error.mockClear();
    await click(within(dialog).getAllByRole("button").find((b) => /pay out/i.test(b.textContent ?? "")));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Only 8000 RWF left"));
  });
});

describe("correcting a mistake", () => {
  // The original entry stays on the statement; a second entry cancels it. That
  // is what makes the ledger evidence rather than a running total.
  it("asks why, then reverses without erasing", async () => {
    vi.stubGlobal("prompt", vi.fn(() => "Entered twice"));
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/Canteen/));

    h.api.post.mockClear();
    await click(within(dialog).queryAllByRole("button", { name: /^reverse /i })[0]);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/pocket-money/reverse"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).transactionId).toBe("t-2");
      expect((call![1] as any).reason).toBe("Entered twice");
    });
    vi.unstubAllGlobals();
  });

  // An unexplained reversal is indistinguishable from a mistake.
  it("reverses nothing when no reason is given", async () => {
    vi.stubGlobal("prompt", vi.fn(() => null));
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/Canteen/));

    h.api.post.mockClear();
    await click(within(dialog).queryAllByRole("button", { name: /^reverse /i })[0]);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/reverse"),
      );
      expect(call).toBeUndefined();
    });
    vi.unstubAllGlobals();
  });

  it("offers no reversal on an entry already reversed", async () => {
    serve(h.api, {
      ...routes,
      "/pocket-money/student/student-1/statement": {
        ...statement,
        data: [{ ...statement.data[0], isReversed: true }],
      },
    });
    const dialog = await openCounter();
    await waitFor(() => expect(dialog.textContent).toMatch(/Canteen/));

    expect(within(dialog).queryAllByRole("button", { name: /^reverse /i })).toHaveLength(0);
  });
});

describe("the limits on an account", () => {
  it("saves a daily cap", async () => {
    const dialog = await openCounter();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/daily limit/i), {
        target: { value: "3000" },
      });
    });

    h.api.put.mockClear();
    await click(within(dialog).getAllByRole("button").find((b) => /save limit/i.test(b.textContent ?? "")));

    await waitFor(() => {
      const call = h.api.put.mock.calls.find(([url]: any[]) =>
        String(url).includes("/pocket-money/limits"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).dailyLimit).toBe(3000);
    });
  });

  // An empty box means no cap, not a cap of zero, which would stop all
  // spending.
  it("treats an empty cap as no cap", async () => {
    const dialog = await openCounter();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/daily limit/i), {
        target: { value: "" },
      });
    });

    h.api.put.mockClear();
    await click(within(dialog).getAllByRole("button").find((b) => /save limit/i.test(b.textContent ?? "")));

    await waitFor(() => {
      const call = h.api.put.mock.calls.find(([url]: any[]) =>
        String(url).includes("/limits"),
      );
      expect((call![1] as any).dailyLimit).toBeNull();
    });
  });

  it("freezes an account", async () => {
    const dialog = await openCounter();
    h.api.put.mockClear();
    await click(within(dialog).getAllByRole("button").find((b) => /freeze/i.test(b.textContent ?? "")));

    await waitFor(() => {
      const call = h.api.put.mock.calls.find(([url]: any[]) =>
        String(url).includes("/limits"),
      );
      expect((call![1] as any).isFrozen).toBe(true);
    });
  });
});

describe("finding a student in the list", () => {
  function lastQuery() {
    const call = [...h.api.get.mock.calls]
      .reverse()
      .find(([url]) => String(url).includes("/pocket-money/overview"));
    return (call?.[1] as any)?.params ?? {};
  }

  it("searches by name or student number", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search students/i), {
        target: { value: "keza" },
      });
    });

    await waitFor(() => expect(lastQuery().search).toBe("keza"), { timeout: 2000 });
  });

  it("narrows to one class", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/class level/i), {
        target: { value: "level-1" },
      });
    });

    const section = screen.getByLabelText(/class section/i) as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(section.options).some((o) => o.value)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(section, { target: { value: "section-1" } });
    });

    await waitFor(() => expect(lastQuery().classSectionId).toBe("section-1"));
  });

  it("keeps the class picker shut until a level is chosen", async () => {
    await mount();
    expect(screen.getByLabelText(/class section/i)).toBeDisabled();
  });

  // A card reader types the code and then sends Enter. A scan that only works
  // from the button would mean the reader is useless at the counter.
  it("scans on the Enter key, the way a card reader sends one", async () => {
    await mount();
    const box = screen.getByLabelText(/scan a card/i);
    await act(async () => {
      fireEvent.change(box, { target: { value: "MK-12345" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/pocket-money/lookup", {
        identifier: "MK-12345",
      }),
    );
  });
});
