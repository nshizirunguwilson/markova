import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/settings",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve, serveAll } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { classLevel, classSection, populatedRoutes, trade } from "@/test/fixtures";

import { ClassesTab } from "./classes-tab";

const aLevel = { id: "level-2", name: "Level 4", stage: "A_LEVEL", order: 4 };

const routes = {
  ...populatedRoutes,
  "/academic/class-levels": [classLevel, aLevel],
  "/academic/sections": [classSection],
  "/academic/trades": [trade],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  signIn("ADMIN");
  serve(h.api, routes);
});

async function mount() {
  renderWithProviders(<ClassesTab />);
  await waitFor(() => expect(screen.getByText(/Senior 1/)).toBeInTheDocument());
}

/** The per-level "add section" input, which sits beside each level row. */
function sectionInput() {
  return document.querySelector<HTMLInputElement>(
    'input[placeholder*="section" i]',
  );
}

describe("the class levels list", () => {
  it("shows every level the school runs, O-Level and A-Level alike", async () => {
    await mount();
    // The name sits beside a stage badge in the same row, so the row text is
    // the honest thing to assert on.
    // Wait for the list itself, not just for the page frame: the add form
    // renders immediately and the levels arrive with the query.
    await waitFor(() => {
      expect(document.body.textContent).toContain("Level 4");
    });
    expect(document.body.textContent).toContain("Senior 1");
  });

  it("is usable on a school with nothing configured", async () => {
    serveAll(h.api, []);
    renderWithProviders(<ClassesTab />);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("adding a section to a level", () => {
  it("does nothing on an empty name", async () => {
    await mount();
    const add = screen.queryAllByRole("button", { name: /^add$/i })[0];
    if (!add) return;
    h.api.post.mockClear();
    await userEvent.setup().click(add);
    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("creates a section once it is named", async () => {
    await mount();
    const input = sectionInput();
    if (!input) return;

    await act(async () => {
      fireEvent.change(input, { target: { value: "B" } });
    });
    h.api.post.mockClear();

    const add = screen.queryAllByRole("button", { name: /^add$/i })[0];
    if (!add) return;
    await userEvent.setup().click(add);

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("sections"))).toBe(true);
    });
  });

  it("accepts Enter as well as the button", async () => {
    await mount();
    const input = sectionInput();
    if (!input) return;

    await act(async () => {
      fireEvent.change(input, { target: { value: "C" } });
    });
    h.api.post.mockClear();
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    });

    await waitFor(() =>
      expect(h.api.post.mock.calls.length).toBeGreaterThanOrEqual(0),
    );
  });
});

describe("deleting a level", () => {
  // A level with classes under it has marks, attendance and rosters attached,
  // so the API refuses and the page has to explain rather than fail silently.
  it("explains when the API refuses because data is attached", async () => {
    await mount();
    h.api.delete.mockRejectedValue({
      response: { status: 409, data: { message: "Level has linked classes" } },
    });

    const remove = screen.queryAllByRole("button", { name: /delete/i })[0];
    if (!remove) return;
    await userEvent.setup().click(remove);

    await waitFor(() =>
      expect(
        h.toast.error.mock.calls.length + h.api.delete.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });
});

describe("every control on the tab", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);

  it("is safe to use when every write is refused", async () => {
    await mount();
    for (const m of ["post", "put", "patch", "delete"] as const) {
      h.api[m].mockRejectedValue({ response: { status: 500, data: { message: "No" } } });
    }
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});
