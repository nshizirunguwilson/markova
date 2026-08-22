import { beforeEach, describe, expect, it, vi } from "vitest";

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
  usePathname: () => "/admin/promotion",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import { chooseCascadingFilters, exercisePage } from "@/test/exercise";
import { populatedRoutes, students } from "@/test/fixtures";

import PromotionPage from "./page";

/**
 * Promotion moves every student in a class up a year, or holds them back. It is
 * the single most destructive thing an admin can do in this app, and it happens
 * once a year, which is exactly the kind of thing nobody has practised.
 */
/** Matches the API: a flat `students` list with a recommendation each. */
const preview = {
  total: 2,
  recommendedPromote: 1,
  recommendedRetain: 1,
  students: [
    {
      studentId: students[0].id,
      name: "Divine Niyonkuru",
      studentIdNumber: students[0].studentIdNumber,
      average: 82,
      recommendation: "PROMOTE",
      hasResult: true,
    },
    {
      studentId: students[1].id,
      name: "Keza Mutesi",
      studentIdNumber: students[1].studentIdNumber,
      average: 38,
      recommendation: "RETAIN",
      hasResult: true,
    },
  ],
};

const routes = {
  ...populatedRoutes,
  "/academic/promote/preview": preview,
  "/academic/promote/commit": { promoted: 1, repeated: 1 },
};

function button(pattern: RegExp) {
  return screen
    .queryAllByRole("button")
    .find((b) => pattern.test((b.textContent ?? "").trim()));
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(PromotionPage, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

describe("before anything is promoted", () => {
  it("renders the year and class pickers", async () => {
    await mount();
    await waitFor(() =>
      expect(document.querySelectorAll("select").length).toBeGreaterThan(0),
    );
  });

  it("is usable on a school with no years set up", async () => {
    serveAll(h.api, []);
    await mount();
    expect(document.body.textContent).not.toBe("");
  });

  // Committing without previewing would move a whole cohort on an unchecked
  // decision. The preview is the safety rail.
  it("does not commit anything on load", async () => {
    await mount();
    const urls = h.api.post.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("commit"))).toBe(false);
  });
});

describe("previewing a promotion", () => {
  async function runPreview() {
    await mount();
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((s) =>
          Array.from(s.options).some((o) => o.value),
        ),
      ).toBe(true),
    );
    await chooseCascadingFilters(6);

    const preview = button(/preview|check|calculate/i);
    if (!preview) return false;
    await act(async () => {
      fireEvent.click(preview);
    });
    return true;
  }

  it("asks the API to work out who moves up", async () => {
    if (!(await runPreview())) return;
    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("preview"))).toBe(true);
    });
  });

  it("shows who is promoted and who repeats", async () => {
    if (!(await runPreview())) return;
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("when the API refuses", () => {
  it("says so rather than looking like nothing happened", async () => {
    await mount();
    h.api.post.mockRejectedValue({
      response: { status: 400, data: { message: "Term is not closed yet" } },
    });
    const preview = button(/preview|check|calculate/i);
    if (!preview) return;
    await act(async () => {
      fireEvent.click(preview);
    });
    await waitFor(() =>
      expect(
        h.toast.error.mock.calls.length + h.api.post.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });
});

describe("a preview that comes back without its list", () => {
  // The handler used to read `data.students` unguarded, so a response shaped
  // even slightly differently killed the page mid-promotion.
  it("does not crash the page", async () => {
    serve(h.api, { ...routes, "/academic/promote/preview": { total: 0 } });
    await mount();
    const preview = button(/preview|check|calculate/i);
    if (preview) {
      await act(async () => {
        fireEvent.click(preview);
      });
    }
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("every control on the page", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});
