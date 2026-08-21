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
import ParentDashboard from "./page";

describe("parent dashboard", () => {
  it("greets the parent and offers the four child views", () => {
    renderPage(ParentDashboard, { role: "PARENT", user: { firstName: "Mukamana" } });
    expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
    expect(screen.getByText(/Mukamana/)).toBeInTheDocument();
    for (const label of ["View Marks", "Attendance", "Discipline", "Reports"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders without a first name rather than showing undefined", () => {
    renderPage(ParentDashboard, { role: "PARENT", user: { firstName: "" } });
    expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("undefined");
  });
});
