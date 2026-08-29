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
  usePathname: () => "/admin/admissions",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";
import { admissionsRoutes, queue } from "@/test/admissions-fixtures";

import AdmissionsDeskPage from "./page";

/**
 * The admissions desk.
 *
 * A reviewer's job here is triage, so what these tests hold is that the queue
 * answers the question they open it with: which of these can I decide now, and
 * which are waiting on somebody. The clock and the completeness are the two
 * things that answer it, and both have to be on the row.
 */

const routes = { ...populatedRoutes, ...admissionsRoutes };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(AdmissionsDeskPage, { role: "ADMIN" });
  await waitFor(() => expect(screen.getByText(/Aline Uwase/)).toBeInTheDocument());
}

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
};

const rowFor = (name: RegExp) => screen.getByText(name).closest("a")!;

describe("the queue", () => {
  it("lists every application waiting", async () => {
    await mount();
    expect(screen.getByText(/Jean Bosco Habimana/)).toBeInTheDocument();
    expect(screen.getByText(/Rose Mukamana/)).toBeInTheDocument();
  });

  it("carries the reference, the age and where they live", async () => {
    await mount();
    const row = rowFor(/Aline Uwase/).textContent ?? "";
    expect(row).toMatch(/APP-2026-0417/);
    expect(row).toMatch(/yrs/);
    expect(row).toMatch(/Gasabo/);
  });

  /**
   * "5 of 7, missing 2" is what decides whether an application can be acted on
   * at all, so it sits beside the name rather than three clicks in.
   */
  it("says how complete each one is, on the row", async () => {
    await mount();
    expect(rowFor(/Aline Uwase/).textContent).toMatch(/5 of 5 documents/);
    expect(rowFor(/Jean Bosco Habimana/).textContent).toMatch(
      /2 of 5, missing 3/,
    );
  });

  /**
   * The state alone says nothing about whether to chase. "Asked 9 days ago"
   * and "expires in 4 days" are what a reviewer needs.
   */
  it("puts the clock on the badge, not just the state", async () => {
    await mount();
    expect(rowFor(/Jean Bosco Habimana/).textContent).toMatch(/asked .* ago/);
    expect(rowFor(/Rose Mukamana/).textContent).toMatch(/expires in/);
    expect(rowFor(/Aline Uwase/).textContent).toMatch(/waiting .* ago/);
  });

  it("says what each is applying for, and whether they board", async () => {
    await mount();
    expect(rowFor(/Aline Uwase/).textContent).toMatch(/Senior 1 · Boarder/);
    expect(rowFor(/Jean Bosco Habimana/).textContent).toMatch(/Day/);
  });

  // A transfer has no national exam mark, so the row shows where they are
  // coming from instead of an empty field.
  it("shows the exam mark where there is one", async () => {
    await mount();
    expect(rowFor(/Aline Uwase/).textContent).toMatch(/68 \/ 100/);
  });

  it("opens an application from anywhere on the row", async () => {
    await mount();
    expect(rowFor(/Aline Uwase/)).toHaveAttribute(
      "href",
      "/admin/admissions/app-1",
    );
  });

  it("does not go blank when the queue fails to load", async () => {
    serveFailure(h.api);
    renderPage(AdmissionsDeskPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

/**
 * The tabs are questions, not states: somebody opening the page wants their
 * pile rather than a taxonomy.
 */
describe("the piles", () => {
  it("counts each one", async () => {
    await mount();
    const tab = screen.getByRole("button", { name: /Needs a decision/ });
    expect(tab.textContent).toMatch(/1/);
  });

  it("opens on the pile a reviewer came for", async () => {
    await mount();
    expect(
      screen.getByRole("button", { name: /Needs a decision/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("asks the API for the pile that was chosen", async () => {
    await mount();
    await click(screen.getByRole("button", { name: /Waiting on family/ }));
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/admissions/applications",
        expect.objectContaining({
          params: expect.objectContaining({ bucket: "WAITING" }),
        }),
      ),
    );
  });

  // The desk being clear is a good outcome and should read like one.
  it("says the desk is clear rather than showing an error", async () => {
    serve(h.api, {
      ...routes,
      "/admissions/applications": { ...queue, data: [], total: 0, buckets: {} },
    });
    renderPage(AdmissionsDeskPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/desk is clear/i),
    );
  });
});

/**
 * An outstanding offer is a place spent, so this is the number that decides
 * whether the school can offer at all.
 */
describe("places left", () => {
  it("shows them for each round still taking applications", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Senior 1 intake, 2026/);
    expect(text).toMatch(/57/);
    expect(text).toMatch(/of 80 left/);
  });

  /*
    A closed round's places are history, and a card for one invites an offer
    against a round nobody can apply to. It still appears in the intake picker,
    because its applications are worth reading.
  */
  it("gives a closed round no places card", async () => {
    await mount();
    expect(document.body.textContent).not.toMatch(/of 12 left/);
    expect(
      (screen.getByLabelText(/Intake/i) as HTMLSelectElement).textContent,
    ).toMatch(/Transfers, 2025/);
  });
});

describe("narrowing the queue", () => {
  it("searches by name, reference or phone", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Search applications/i), {
        target: { value: "  Uwase  " },
      });
    });
    await waitFor(
      () =>
        expect(h.api.get).toHaveBeenCalledWith(
          "/admissions/applications",
          expect.objectContaining({
            params: expect.objectContaining({ search: "Uwase", page: 1 }),
          }),
        ),
      { timeout: 3000 },
    );
  });

  it("narrows to one intake", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Intake/i), {
        target: { value: "intake-1" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith(
        "/admissions/applications",
        expect.objectContaining({
          params: expect.objectContaining({ intakeId: "intake-1" }),
        }),
      ),
    );
  });
});

/**
 * A place held by a family who stopped replying is a place the school cannot
 * give to the waitlist, so the expiry has to actually do something.
 */
describe("releasing places nobody answered", () => {
  it("is offered only where it would do something", async () => {
    await mount();
    expect(
      screen.queryByRole("button", { name: /Release expired/i }),
    ).not.toBeInTheDocument();
    await click(screen.getByRole("button", { name: /^Offered/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Release expired/i }),
      ).toBeInTheDocument(),
    );
  });

  it("says how many places came back", async () => {
    serve(h.api, { ...routes, "/admissions/offers/expire": { expired: 3 } });
    await mount();
    await click(screen.getByRole("button", { name: /^Offered/ }));
    await click(screen.getByRole("button", { name: /Release expired/i }));
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith("3 places released."),
    );
  });

  it("says so plainly when none had run out", async () => {
    serve(h.api, { ...routes, "/admissions/offers/expire": { expired: 0 } });
    await mount();
    await click(screen.getByRole("button", { name: /^Offered/ }));
    await click(screen.getByRole("button", { name: /Release expired/i }));
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith("No offers had run out."),
    );
  });
});
