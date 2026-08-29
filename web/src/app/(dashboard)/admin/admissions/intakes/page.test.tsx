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
  usePathname: () => "/admin/admissions/intakes",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classLevel, populatedRoutes } from "@/test/fixtures";
import { admissionsRoutes } from "@/test/admissions-fixtures";

import IntakesPage from "./page";

/**
 * The rounds a school is running.
 *
 * Where places live. What matters here is that the number shown is places
 * *left* rather than places total: an outstanding offer is a place spent, and
 * a school reading the wrong one offers the same forty places twice.
 */
const routes = {
  ...populatedRoutes,
  ...admissionsRoutes,
  "/academic/class-levels": [classLevel],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(IntakesPage, { role: "ADMIN" });
  await waitFor(() =>
    expect(screen.getByText(/Senior 1 intake, 2026/)).toBeInTheDocument(),
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

describe("the rounds", () => {
  it("lists each with the door it is for and its dates", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Senior 1/);
    expect(text).toMatch(/2026-2027/);
    expect(text).toMatch(/120 applications/);
  });

  it("shows places left, not places total", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/57/);
    expect(document.body.textContent).toMatch(/of 80 left/);
  });

  it("says which are open and which are closed", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Open/);
    expect(text).toMatch(/Closed/);
  });

  // A school with no rounds cannot take an application at all, and the page
  // says that rather than looking merely empty.
  it("says a family cannot apply until a round is open", async () => {
    serve(h.api, { ...routes, "/admissions/intakes": [] });
    renderPage(IntakesPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/cannot apply until one is open/i),
    );
  });

  it("does not go blank when the rounds fail to load", async () => {
    serveFailure(h.api);
    renderPage(IntakesPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("opening a round", () => {
  it("explains that each door asks for different documents", async () => {
    await mount();
    await click(button(/Open a round/));
    expect((await screen.findByRole("dialog")).textContent).toMatch(
      /no national exam slip to give/i,
    );
  });

  it("will not save until it has everything it needs", async () => {
    await mount();
    await click(button(/Open a round/));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^Save$/.test(b.textContent ?? "")),
    ).toBeDisabled();
  });

  it("opens with what the round already says when changing one", async () => {
    await mount();
    await click(button(/Change/));
    expect(screen.getByLabelText(/What it is called/i)).toHaveValue(
      "Senior 1 intake, 2026",
    );
    expect(screen.getByLabelText(/^Places$/i)).toHaveValue(80);
  });

  it("sends the round it opened against", async () => {
    serve(h.api, { ...routes, "/admissions/intakes": [] });
    renderPage(IntakesPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/cannot apply/i),
    );
    await click(button(/Open a round/));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/What it is called/i), {
        target: { value: "Senior 1 intake, 2027" },
      });
      fireEvent.change(screen.getByLabelText(/Academic year/i), {
        target: { value: "year-1" },
      });
      fireEvent.change(screen.getByLabelText(/Class level/i), {
        target: { value: "level-1" },
      });
      fireEvent.change(screen.getByLabelText(/^Places$/i), {
        target: { value: "80" },
      });
      fireEvent.change(screen.getByLabelText(/^Opens$/i), {
        target: { value: "2027-06-01" },
      });
      fireEvent.change(screen.getByLabelText(/^Closes$/i), {
        target: { value: "2027-08-15" },
      });
    });
    await click(button(/^Save$/));
    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith(
        "/admissions/intakes",
        expect.objectContaining({
          name: "Senior 1 intake, 2027",
          places: 80,
          entryPoint: "SENIOR_ONE",
        }),
      ),
    );
  });

  it("closes without saving when cancelled", async () => {
    await mount();
    await click(button(/Open a round/));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.put).not.toHaveBeenCalled();
  });
});
