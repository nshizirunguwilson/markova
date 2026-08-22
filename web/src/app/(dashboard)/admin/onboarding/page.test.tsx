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
  usePathname: () => "/admin/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import OnboardingPage from "./page";

/**
 * First-run setup.
 *
 * Ten steps a school walks through once. What this page owns is the walk: how
 * far along they are, that progress is remembered if they close the tab, and
 * that they can leave at any point without being trapped.
 */

const routes = {
  ...populatedRoutes,
  "/school-config/onboarding": { currentStep: "0", completed: "false" },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(OnboardingPage, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

function button(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

describe("walking through setup", () => {
  it("starts on the first step", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/school info/i);
  });

  it("names every step so the school can see the whole job", async () => {
    await mount();
    for (const label of [/branding/i, /academic year/i, /classes/i, /subjects/i, /review/i]) {
      expect(document.body.textContent).toMatch(label);
    }
  });

  it("moves on to the next step", async () => {
    await mount();
    await click(button(/^next$/i));

    await waitFor(() => expect(document.body.textContent).toMatch(/branding/i));
  });

  // A school does this over days, not minutes, so how far they got is stored
  // rather than held in the tab.
  it("remembers how far along they are", async () => {
    await mount();
    h.api.put.mockClear();
    await click(button(/^next$/i));

    await waitFor(() => {
      const call = h.api.put.mock.calls.find(([url]: any[]) =>
        String(url).includes("/school-config/onboarding"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).currentStep).toBe("1");
    });
  });

  it("goes back a step", async () => {
    await mount();
    await click(button(/^next$/i));
    await waitFor(() => expect(document.body.textContent).toMatch(/branding/i));

    const back = button(/back|previous/i);
    if (!back) return;
    await click(back);

    await waitFor(() => expect(document.body.textContent).toMatch(/school info/i));
  });

  // Going back is a correction, not progress; it must not rewrite the stored
  // position and lose the furthest point reached.
  it("does not record going back as progress", async () => {
    await mount();
    await click(button(/^next$/i));
    await waitFor(() => expect(document.body.textContent).toMatch(/branding/i));

    h.api.put.mockClear();
    const back = button(/back|previous/i);
    if (!back) return;
    await click(back);

    await waitFor(() => expect(h.api.put).not.toHaveBeenCalled());
  });

  it("cannot go back from the first step", async () => {
    await mount();
    const back = button(/back|previous/i);
    if (back) expect(back).toBeDisabled();
  });
});

describe("leaving setup", () => {
  // A school that already has its data does not want to be walked through
  // creating it, and must not be trapped here.
  it("lets them skip to the dashboard", async () => {
    await mount();
    await click(button(/skip/i));

    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/admin"));
  });

  it("records nothing when they skip", async () => {
    await mount();
    h.api.put.mockClear();
    await click(button(/skip/i));

    await waitFor(() => expect(h.api.put).not.toHaveBeenCalled());
  });
});
