import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), back: fn(), refresh: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
}));

import { renderPage, screen, serve, serveFailure, serveNever, waitFor } from "@/test/page";
import StudentDashboard from "./page";

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
});

describe("student dashboard", () => {
  it("greets the student by name and lists the quick links", async () => {
    serve(h.api, { "/library/loans/my": [] });
    renderPage(StudentDashboard, { role: "STUDENT", user: { firstName: "Divine" } });
    await waitFor(() => expect(screen.getByText(/Welcome back/)).toBeInTheDocument());
    expect(screen.getByText(/Divine/)).toBeInTheDocument();
    for (const label of ["My Marks", "Homework", "Library", "Attendance"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows a spinner while the loans are still loading", () => {
    serveNever(h.api);
    renderPage(StudentDashboard, { role: "STUDENT" });
    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument();
  });

  // A library outage should not take the whole dashboard down with it.
  it("still renders when the loans request fails", async () => {
    serveFailure(h.api);
    renderPage(StudentDashboard, { role: "STUDENT", user: { firstName: "Divine" } });
    await waitFor(() => expect(screen.getByText(/Welcome back/)).toBeInTheDocument());
  });

  it("counts only loans that have not been returned", async () => {
    serve(h.api, {
      "/library/loans/my": [
        { id: "1", returnedAt: null },
        { id: "2", returnedAt: "2026-08-01" },
        { id: "3", returnedAt: null },
      ],
    });
    renderPage(StudentDashboard, { role: "STUDENT" });
    await waitFor(() => expect(screen.getByText(/Welcome back/)).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
