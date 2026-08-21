import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

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
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";
import { Topbar } from "./topbar";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve } from "@/test/page";
import { useAuthStore } from "@/stores/auth-store";

const notifications = [
  { id: "n-1", title: "Marks published", body: "Term 1 is out", isRead: false, type: "MARKS" },
  { id: "n-2", title: "Absent today", body: "Divine was absent", isRead: true, type: "ATTENDANCE" },
];

function mount(role: "ADMIN" | "STUDENT" | "TEACHER" = "ADMIN") {
  signIn(role, { firstName: "Aline", lastName: "Uwase" });
  return renderWithProviders(<Topbar onToggleSidebar={vi.fn()} />);
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  serve(h.api, {
    "/notifications/unread": { count: 1 },
    "/notifications": notifications,
  });
  localStorage.clear();
});

describe("Topbar", () => {
  it("shows the signed-in user's name", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
  });

  it("calls the sidebar toggle when the menu button is pressed", async () => {
    const onToggle = vi.fn();
    signIn("ADMIN");
    renderWithProviders(<Topbar onToggleSidebar={onToggle} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /toggle sidebar/i }));
    expect(onToggle).toHaveBeenCalled();
  });
});

describe("Topbar notifications", () => {
  it("shows the unread badge", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
  });

  it("lists notifications when the bell is opened", async () => {
    mount();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() =>
      expect(screen.getByText(/Marks published/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Absent today/i)).toBeInTheDocument();
  });

  it("marks one read when it is clicked", async () => {
    mount();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText(/Marks published/i)).toBeInTheDocument());
    await user.click(screen.getByText(/Marks published/i));
    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
  });

  it("closes the notification menu on Escape", async () => {
    mount();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText(/Marks published/i)).toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(/Marks published/i)).toBeNull());
  });
});

// Signing out has to clear the stored tokens, not just the in-memory store,
// or a reload would put the user straight back in.
describe("Topbar sign out", () => {
  it("asks for confirmation before signing out", async () => {
    mount();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await user.click(screen.getByText(/Aline/));
    await waitFor(() => expect(screen.getByText(/sign out/i)).toBeInTheDocument());
    await user.click(screen.getByText(/sign out/i));
    expect(h.router.push).not.toHaveBeenCalledWith("/login");
  });

  it("clears tokens and leaves for the login page once confirmed", async () => {
    localStorage.setItem("access_token", "a");
    localStorage.setItem("refresh_token", "r");
    mount();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await user.click(screen.getByText(/Aline/));
    await user.click(await screen.findByText(/sign out/i));

    // The confirmation dialog repeats the wording, so take the last match:
    // the menu item opened it, the dialog button commits it.
    const commit = screen.getAllByRole("button", { name: /sign out/i }).at(-1)!;
    await user.click(commit);

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(localStorage.getItem("access_token")).toBeNull();
      expect(h.router.push).toHaveBeenCalledWith("/login");
    });
  });
});
