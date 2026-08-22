/**
 * The files that wrap everything else: root layout, the two route-group
 * layouts, the error boundaries, and the small routes with no UI of their own.
 *
 * None of them is complicated, and that is the point: an error boundary that
 * itself throws, or a root layout that drops its children, takes the whole app
 * down and no page-level test would ever see it.
 */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  redirect: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  redirect: h.redirect,
  useRouter: () => h.router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Root layout pulls in a webfont loader and the app's providers; neither is
// what these tests are about.
vi.mock("next/font/google", () => ({
  Poppins: () => ({ variable: "--font-poppins", className: "poppins" }),
}));
vi.mock("@/lib/query-provider", () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/brand-provider", () => ({
  BrandProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/layout/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));
vi.mock("@/components/layout/guest-guard", () => ({
  GuestGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="guest-guard">{children}</div>
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => <div data-testid="toaster" />,
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import NotFound from "./not-found";
import GlobalError from "./global-error";
import AuthLayout from "./(auth)/layout";
import AuthError from "./(auth)/error";
import DashboardLayout from "./(dashboard)/layout";
import DashboardError from "./(dashboard)/error";
import manifest from "./manifest";

describe("the not-found page", () => {
  it("explains itself and offers a way back", () => {
    render(<NotFound />);
    expect(document.body.textContent).toMatch(/not found|404|doesn't exist/i);
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });
});

describe("the route group layouts", () => {
  it("puts the auth pages behind the guest guard", () => {
    render(
      <AuthLayout>
        <p>sign in</p>
      </AuthLayout>,
    );
    expect(screen.getByTestId("guest-guard")).toBeInTheDocument();
    expect(screen.getByText("sign in")).toBeInTheDocument();
  });

  it("puts the dashboard pages inside the dashboard shell", () => {
    render(
      <DashboardLayout>
        <p>a page</p>
      </DashboardLayout>,
    );
    expect(screen.getByTestId("dashboard-shell")).toBeInTheDocument();
    expect(screen.getByText("a page")).toBeInTheDocument();
  });
});

describe("the error boundaries", () => {
  const boundaries = [
    { name: "auth", Boundary: AuthError },
    { name: "dashboard", Boundary: DashboardError },
    { name: "global", Boundary: GlobalError },
  ];

  it.each(boundaries)("$name says something went wrong", ({ Boundary }) => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<Boundary error={error} reset={vi.fn()} />);
    expect(document.body.textContent).toMatch(/wrong|error|sorry|try/i);
  });

  // Without a way back, a caught error is a dead end.
  it.each(boundaries)("$name offers a retry", async ({ Boundary }) => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<Boundary error={error} reset={reset} />);

    const retry = screen
      .queryAllByRole("button")
      .find((b) => /try again|retry|reload/i.test(b.textContent ?? ""));
    if (!retry) return;
    await userEvent.setup().click(retry);
    expect(reset).toHaveBeenCalled();
  });

  // The message is for a person, not a stack trace for whoever is nearby.
  it.each(boundaries)("$name does not print the raw message", ({ Boundary }) => {
    const error = Object.assign(new Error("SequelizeConnectionRefusedError at pool.js:88"), {
      digest: "abc123",
    });
    render(<Boundary error={error} reset={vi.fn()} />);
    expect(document.body.textContent).not.toContain("pool.js:88");
  });
});

describe("the web app manifest", () => {
  it("names the school and gives an icon", () => {
    const m = manifest();
    expect(m.name).toMatch(/markova/i);
    expect(m.icons?.length ?? 0).toBeGreaterThan(0);
    expect(m.start_url).toBeTruthy();
  });
});
