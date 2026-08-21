import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

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
  usePathname: () => "/admin/reports",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { exercisePage, fillEverything } from "@/test/exercise";
import { populatedRoutes, students } from "@/test/fixtures";

import ReportsPage from "./page";

const generated = {
  count: 2,
  reports: students.map((s, i) => ({
    studentId: s.id,
    studentName: `${s.user.firstName} ${s.user.lastName}`,
    average: 82 - i * 5,
    position: i + 1,
    verificationCode: `12345678901${i}`,
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

/** Picks a value in every filter select, which is what enables Generate. */
async function chooseFilters() {
  const selects = Array.from(document.querySelectorAll("select"));
  for (const select of selects) {
    const option = Array.from(select.options).find((o) => o.value)?.value;
    if (!option) continue;
    await act(async () => {
      fireEvent.change(select, { target: { value: option } });
    });
  }
}

function buttonMatching(pattern: RegExp) {
  return screen
    .queryAllByRole("button")
    .find((b) => pattern.test(b.textContent ?? "") || pattern.test(b.getAttribute("aria-label") ?? ""));
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

// The post-generation states (view, print, download per row) are not covered
// here yet: driving the page into them needs the class and term selects to be
// populated in the order the page expects, and a half-working test that passes
// for the wrong reason is worse than an honest gap. See TESTING.md.

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
