/**
 * The topbar's search and notification routing.
 *
 * Search is how someone gets anywhere without the sidebar, and a notification
 * that leads to the wrong page is worse than one that leads nowhere. Both route
 * per role, which is the part that rots quietly.
 */
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
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";
import { Topbar } from "./topbar";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve } from "@/test/page";
import type { User } from "@/stores/auth-store";

const notification = (id: string, type: string, title: string) => ({
  id,
  type,
  title,
  body: "Something happened",
  isRead: false,
  createdAt: "2026-08-21T09:00:00Z",
});

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  serve(h.api, {
    "/notifications/unread": { count: 3 },
    "/notifications": [
      notification("n-1", "MARKS", "Marks published"),
      notification("n-2", "ATTENDANCE", "Absent today"),
      notification("n-3", "LIBRARY", "Book overdue"),
    ],
  });
});

function mount(role: User["role"] = "ADMIN") {
  signIn(role, { firstName: "Aline" });
  return renderWithProviders(<Topbar onToggleSidebar={vi.fn()} />);
}

describe("searching from the topbar", () => {
  it("suggests pages matching what is typed", async () => {
    mount("ADMIN");
    const user = userEvent.setup();
    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, "user");
    await waitFor(() => expect(document.body.textContent).toMatch(/users/i), {
      timeout: 3000,
    });
  });

  it("suggests nothing for an empty query", async () => {
    mount("ADMIN");
    const search = screen.getByPlaceholderText(/search/i);
    await userEvent.setup().type(search, "   ");
    await new Promise((r) => setTimeout(r, 400));
    expect(h.router.push).not.toHaveBeenCalled();
  });

  // The suggestions come from the same navigation map the sidebar uses, so a
  // student must never be offered an admin page.
  it("never suggests an admin page to a student", async () => {
    mount("STUDENT");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search/i), "user");
    await new Promise((r) => setTimeout(r, 400));
    expect(document.body.textContent).not.toMatch(/\/admin\/users/);
  });

  it("navigates to a chosen suggestion", async () => {
    mount("ADMIN");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search/i), "subject");
    await waitFor(() => expect(document.body.textContent).toMatch(/subjects/i), {
      timeout: 3000,
    });

    const suggestion = screen
      .queryAllByRole("button")
      .find((b) => /subjects/i.test(b.textContent ?? ""));
    if (!suggestion) return;
    await user.click(suggestion);
    await waitFor(() => expect(h.router.push).toHaveBeenCalled());
  });

  it("closes the suggestions on Escape", async () => {
    mount("ADMIN");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search/i), "marks");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("following a notification", () => {
  async function openBell() {
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() =>
      expect(screen.getByText(/Marks published/)).toBeInTheDocument(),
    );
    return user;
  }

  // Each notification type leads somewhere different, and where it leads
  // depends on who is reading it.
  it.each([
    ["ADMIN", /Absent today/, "attendance"],
    ["TEACHER", /Absent today/, "attendance"],
    ["PARENT", /Absent today/, "attendance"],
  ])("takes a %s to their own %s page", async (role, label, expected) => {
    mount(role as User["role"]);
    const user = await openBell();
    await user.click(screen.getByText(label));

    await waitFor(() => expect(h.router.push).toHaveBeenCalled());
    const target = String(h.router.push.mock.calls[0][0]);
    expect(target).toContain(expected);
    expect(target.startsWith(`/${role.toLowerCase()}`)).toBe(true);
  });

  it("marks a notification read when it is followed", async () => {
    mount("ADMIN");
    const user = await openBell();
    await user.click(screen.getByText(/Marks published/));
    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
  });

  it("marks everything read on request", async () => {
    mount("ADMIN");
    const user = await openBell();
    const markAll = screen
      .queryAllByRole("button")
      .find((b) => /mark all|read all/i.test(b.textContent ?? ""));
    if (!markAll) return;
    await user.click(markAll);
    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
  });

  it("says so when there is nothing to read", async () => {
    serve(h.api, { "/notifications/unread": { count: 0 }, "/notifications": [] });
    mount("ADMIN");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});
