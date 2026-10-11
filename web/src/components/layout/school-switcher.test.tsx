import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  usePathname: () => "/teacher",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";
import { SchoolSwitcher } from "./school-switcher";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve } from "@/test/page";

/**
 * The school open now, and the way to another. Aline teaches at Markova
 * Academy and is a parent at G.S. Umucyo.
 */
const ACADEMY = { id: "s-1", name: "Markova Academy", slug: "markova-academy" };
const UMUCYO = { id: "s-2", name: "G.S. Umucyo", slug: "gs-umucyo" };
const both = [
  { userId: "u-1", role: "TEACHER", school: ACADEMY, current: true, unreadMessages: 0 },
  { userId: "u-2", role: "PARENT", school: UMUCYO, current: false, unreadMessages: 3 },
];

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  assign.mockReset();
  localStorage.clear();
  localStorage.setItem("refresh_token", "refresh-1");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

const mount = (schools: unknown[]) => {
  serve(h.api, { "/auth/schools": schools });
  signIn("TEACHER", { id: "u-1", school: ACADEMY });
  return renderWithProviders(<SchoolSwitcher />);
};

describe("the school switcher", () => {
  it("shows only the name for somebody in one school", async () => {
    mount([both[0]]);
    expect(await screen.findByText("Markova Academy")).toBeInTheDocument();
    await waitFor(() => expect(h.api.get).toHaveBeenCalledWith("/auth/schools"));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers the others to somebody in several", async () => {
    mount(both);
    const button = await screen.findByRole("button", {
      name: /School: Markova Academy\. Switch school, 3 unread messages elsewhere/,
    });
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /G\.S\. Umucyo, Parent, 3 unread messages/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Markova Academy, Teacher, open now/ }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("opens the other school without asking for the password", async () => {
    mount(both);
    serve(h.api, {
      "/auth/schools": both,
      "/auth/switch": {
        accessToken: "access-2",
        refreshToken: "refresh-2",
        user: { id: "u-2", role: "PARENT" },
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: /Switch school/ }));
    await userEvent.click(screen.getByRole("button", { name: /G\.S\. Umucyo/ }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/parent"));
    expect(h.api.post).toHaveBeenCalledWith("/auth/switch", {
      userId: "u-2",
      refreshToken: "refresh-1",
    });
    expect(localStorage.getItem("access_token")).toBe("access-2");
    expect(localStorage.getItem("refresh_token")).toBe("refresh-2");
  });

  it("does nothing when the open school is chosen", async () => {
    mount(both);
    await userEvent.click(await screen.findByRole("button", { name: /Switch school/ }));
    await userEvent.click(screen.getByRole("button", { name: /open now/ }));
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("says so when the other school cannot be opened", async () => {
    mount(both);
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { message: "That school is not on your list" } },
    });
    await userEvent.click(await screen.findByRole("button", { name: /Switch school/ }));
    await userEvent.click(screen.getByRole("button", { name: /G\.S\. Umucyo/ }));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("That school is not on your list"),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    mount(both);
    const button = await screen.findByRole("button", { name: /Switch school/ });
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("shows nothing before the school is known", () => {
    serve(h.api, { "/auth/schools": both });
    signIn("TEACHER", { id: "u-1" });
    const { container } = renderWithProviders(<SchoolSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });
});
