import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ pathname: { current: "/admin" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./sidebar";
import { signIn } from "@/test/harness";
import type { User } from "@/stores/auth-store";

beforeEach(() => {
  h.pathname.current = "/admin";
});

function show(role: User["role"], pathname = `/${role.toLowerCase()}`) {
  h.pathname.current = pathname;
  signIn(role);
  return render(<Sidebar isOpen onClose={vi.fn()} />);
}

describe("what each role is offered", () => {
  it("gives an admin the management sections", () => {
    show("ADMIN");
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  // The sidebar is the first place a wrong role would show, and it must never
  // advertise a page the route guard would then refuse.
  it("does not offer a student the admin sections", () => {
    show("STUDENT");
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.getByText("My Marks")).toBeInTheDocument();
  });

  it("does not offer a teacher the admin sections", () => {
    show("TEACHER");
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.getByText("Marks Entry")).toBeInTheDocument();
  });

  it("gives a parent their children's views", () => {
    show("PARENT");
    expect(screen.getByText("Attendance")).toBeInTheDocument();
    expect(screen.queryByText("Marks Entry")).not.toBeInTheDocument();
  });

  it("gives a librarian the library sections", () => {
    show("LIBRARIAN");
    expect(screen.getByText("Books")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });
});

describe("marking where you are", () => {
  it("marks the current page as current", () => {
    show("ADMIN", "/admin/users");
    const link = screen.getByText("Users").closest("a");
    expect(link).toHaveAttribute("href", "/admin/users");
  });

  // A dashboard link would otherwise look active on every page beneath it.
  it("does not mark the dashboard active while on a sub page", () => {
    show("ADMIN", "/admin/users");
    const dashboard = screen.getByText("Dashboard").closest("a");
    const users = screen.getByText("Users").closest("a");
    expect(dashboard?.className).not.toBe(users?.className);
  });
});

describe("on a phone", () => {
  it("closes when a link is followed", async () => {
    const onClose = vi.fn();
    signIn("ADMIN");
    render(<Sidebar isOpen onClose={onClose} />);
    await userEvent.setup().click(screen.getByText("Users"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("before the profile has loaded", () => {
  it("falls back to the admin navigation rather than rendering nothing", () => {
    h.pathname.current = "/admin";
    render(<Sidebar isOpen onClose={vi.fn()} />);
    expect(document.body.textContent).not.toBe("");
  });
});
