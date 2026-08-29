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
  usePathname: () => "/student/fees",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";
import { financeRoutes } from "@/test/fee-fixtures";
import StudentFeesPage from "./page";

/**
 * A student's own account.
 *
 * Here rather than only in the parent portal because a student who cannot see
 * their marks is owed an explanation they can read themselves.
 */
describe("a student's fee account", () => {
  beforeEach(() => {
    for (const m of Object.values(h.api)) m.mockReset();
    serve(h.api, { ...populatedRoutes, ...financeRoutes });
  });

  it("reads the signed-in student's own account", async () => {
    renderPage(StudentFeesPage, {
      role: "STUDENT",
      user: { studentId: "student-1" },
    });
    await waitFor(() =>
      expect(h.api.get).toHaveBeenCalledWith("/finance/history/student-1"),
    );
    await waitFor(() =>
      expect(screen.getByText(/Every term/)).toBeInTheDocument(),
    );
  });

  // An account with no student record behind it, which is a broken link
  // rather than a family with nothing to pay.
  it("says so when no student record is linked", async () => {
    renderPage(StudentFeesPage, { role: "STUDENT" });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/No student record is linked/i),
    );
  });
});
