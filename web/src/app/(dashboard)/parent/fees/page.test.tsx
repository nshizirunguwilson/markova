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
  usePathname: () => "/parent/fees",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";
import { financeRoutes } from "@/test/fee-fixtures";
import ParentFeesPage from "./page";

/**
 * A parent's account, one child at a time.
 */
describe("a parent's fee account", () => {
  /*
    `useMyChildren` reads the parent's own user record and maps the links on
    it, so the fixture is that record rather than a list of children.
  */
  const child = (id: string, firstName: string, lastName: string) => ({
    student: {
      id,
      studentIdNumber: `STD-2026-${id}`,
      classSection: { name: "A" },
      user: { firstName, lastName },
    },
  });
  const parentRecord = (...links: ReturnType<typeof child>[]) => ({
    "/users/user-1": { id: "user-1", parentStudents: links },
  });
  const children = [
    child("student-1", "Divine", "Niyonkuru"),
    child("student-2", "Keza", "Mutesi"),
  ];

  beforeEach(() => {
    for (const m of Object.values(h.api)) m.mockReset();
  });

  it("opens on the first child without being asked", async () => {
    serve(h.api, {
      ...populatedRoutes,
      ...financeRoutes,
      ...parentRecord(...children),
    });
    renderPage(ParentFeesPage, { role: "PARENT" });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith("/finance/history/student-1"),
    );
  });

  it("switches to another child when one is chosen", async () => {
    serve(h.api, {
      ...populatedRoutes,
      ...financeRoutes,
      ...parentRecord(...children),
      "/finance/history/student-2": [],
    });
    renderPage(ParentFeesPage, { role: "PARENT" });
    await waitFor(() => expect(screen.getByLabelText(/Child/i)).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Child/i), {
        target: { value: "student-2" },
      });
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith("/finance/history/student-2"),
    );
  });

  /*
    A select box with one option in it is a control that cannot be used, which
    is the rule the rest of the parent section follows.
  */
  it("does not offer a picker to a parent with one child", async () => {
    serve(h.api, {
      ...populatedRoutes,
      ...financeRoutes,
      ...parentRecord(children[0]),
    });
    renderPage(ParentFeesPage, { role: "PARENT" });
    await waitFor(() => expect(screen.getByText(/Every term/)).toBeInTheDocument());
    expect(screen.queryByLabelText(/Child/i)).not.toBeInTheDocument();
  });

  it("says so when no children are linked", async () => {
    serve(h.api, { ...populatedRoutes, ...parentRecord() });
    renderPage(ParentFeesPage, { role: "PARENT" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/No linked children/i),
    );
  });
});
