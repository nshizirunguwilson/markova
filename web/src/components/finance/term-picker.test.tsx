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
  usePathname: () => "/admin/finance",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";
import { feeTerms } from "@/test/fee-fixtures";
import { TermPicker } from "./term-picker";

/**
 * Every question a bursar is asked is about one term, so the term is the
 * first control on every fee screen and the last thing to move on its own.
 */
describe("choosing a term", () => {
  const chosen: string[] = [];
  const Harness = () => (
    <TermPicker value={chosen[chosen.length - 1] ?? ""} onChange={(t) => chosen.push(t)} />
  );

  beforeEach(() => {
    chosen.length = 0;
    for (const m of Object.values(h.api)) m.mockReset();
    serve(h.api, { ...populatedRoutes, "/academic/terms": feeTerms });
  });

  it("opens on the current term without being asked", async () => {
    renderPage(Harness, { role: "BURSAR" });
    await waitFor(() => expect(chosen[0]).toBe("term-1"));
  });

  /*
    A school looking at February is usually chasing money from November, and
    "Term 1" on its own does not say which year that is.
  */
  it("labels each term with its academic year", async () => {
    renderPage(Harness, { role: "BURSAR" });
    await waitFor(() =>
      expect(screen.getByRole("combobox").textContent).toMatch(/2026-2027/),
    );
  });

  it("marks which one is current", async () => {
    renderPage(Harness, { role: "BURSAR" });
    await waitFor(() =>
      expect(screen.getByRole("combobox").textContent).toMatch(/\(current\)/),
    );
  });

  it("reports a different term when one is picked", async () => {
    renderPage(Harness, { role: "BURSAR" });
    await waitFor(() => expect(chosen.length).toBeGreaterThan(0));
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "term-0" },
      });
    });
    expect(chosen[chosen.length - 1]).toBe("term-0");
  });

  it("says it is loading before the terms arrive", async () => {
    serve(h.api, { ...populatedRoutes, "/academic/terms": [] });
    renderPage(Harness, { role: "BURSAR" });
    await waitFor(() =>
      expect(screen.getByRole("combobox").textContent).toMatch(/Loading/),
    );
  });

  // A term with no year attached still lists, without a dangling separator.
  it("copes with a term that carries no academic year", async () => {
    serve(h.api, {
      ...populatedRoutes,
      "/academic/terms": [{ id: "term-x", name: "Term 1", isCurrent: true }],
    });
    renderPage(Harness, { role: "BURSAR" });
    await waitFor(() => expect(chosen[0]).toBe("term-x"));
    expect(screen.getByRole("combobox").textContent).not.toMatch(/·/);
  });

  // Falls back to the newest term rather than choosing nothing, so the pages
  // behind it are never left with no term at all.
  it("falls back to the last term when none is current", async () => {
    serve(h.api, {
      ...populatedRoutes,
      "/academic/terms": feeTerms.map((t) => ({ ...t, isCurrent: false })),
    });
    renderPage(Harness, { role: "BURSAR" });
    await waitFor(() => expect(chosen[0]).toBe("term-0"));
  });
});
