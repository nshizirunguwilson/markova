import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    pathname: { current: "/admin" },
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));

vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./sidebar";
import { renderWithProviders, signIn } from "@/test/harness";
import type { User } from "@/stores/auth-store";

beforeEach(() => {
  h.pathname.current = "/admin";
  for (const m of Object.values(h.api)) m.mockReset();
});

function show(role: User["role"], pathname = `/${role.toLowerCase()}`) {
  h.pathname.current = pathname;
  signIn(role);
  return renderWithProviders(<Sidebar isOpen onClose={vi.fn()} />);
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
    renderWithProviders(<Sidebar isOpen onClose={onClose} />);
    await userEvent.setup().click(screen.getByText("Users"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("before the profile has loaded", () => {
  it("falls back to the admin navigation rather than rendering nothing", () => {
    h.pathname.current = "/admin";
    renderWithProviders(<Sidebar isOpen onClose={vi.fn()} />);
    expect(document.body.textContent).not.toBe("");
  });
});

/**
 * The quietest of the three ways of being told a message arrived: no notice,
 * no sound, just a number that is there when you next look at the sidebar.
 */
describe("how many messages are waiting", () => {
  /*
    The shape `/messaging/unread` actually answers with.

    This fixture used to say `{ count }`, which the API has never sent, and
    the sidebar read `.count` to match - so the test proved the badge worked
    against a response nobody serves, while the real badge read undefined and
    never appeared once. A fixture shaped to the code rather than to the API
    is a test that cannot fail.
  */
  function withUnread(unreadCount: number, mentionCount = 0) {
    h.api.get.mockImplementation(async (path: string) =>
      path.includes("/messaging/unread")
        ? { data: { unreadCount, mentionCount } }
        : { data: [] },
    );
    return show("ADMIN");
  }

  it("shows the count beside Messages", async () => {
    withUnread(3);
    expect(await screen.findByText("3")).toBeInTheDocument();
  });

  it("says what the number means, for anyone not reading the screen", async () => {
    withUnread(3);
    expect(
      await screen.findByLabelText(/3 unread messages/i),
    ).toBeInTheDocument();
  });

  /**
   * A mention is somebody waiting on an answer, which is not the same as one
   * more message in a group of thirty. The row has space for one number, so
   * the badge changes colour rather than growing a second.
   */
  it("marks the badge differently when something mentions you", async () => {
    withUnread(7, 2);
    const badge = await screen.findByText("7");
    expect(badge.className).toContain("bg-danger");
  });

  it("says so too, for anyone not reading the screen", async () => {
    withUnread(7, 2);
    expect(
      await screen.findByLabelText(/2 mentioning you/i),
    ).toBeInTheDocument();
  });

  it("keeps the ordinary colour when nothing mentions you", async () => {
    withUnread(7);
    const badge = await screen.findByText("7");
    expect(badge.className).toContain("bg-primary");
  });

  it("counts one message in the singular", async () => {
    withUnread(1);
    expect(await screen.findByLabelText(/1 unread message$/i)).toBeInTheDocument();
  });

  // Past ninety-nine the exact number stops meaning anything and starts
  // breaking the row.
  it("stops counting exactly past ninety-nine", async () => {
    withUnread(250);
    expect(await screen.findByText("99+")).toBeInTheDocument();
  });

  // An empty inbox needs no decoration.
  it("shows nothing when there is nothing waiting", async () => {
    withUnread(0);
    await screen.findByText("Messages");
    expect(screen.queryByLabelText(/unread message/i)).toBeNull();
  });

  // And nothing before the count has arrived, rather than a flash of zero.
  it("shows nothing before the count is known", async () => {
    h.api.get.mockImplementation(async () => ({ data: undefined }));
    show("ADMIN");
    await screen.findByText("Messages");
    expect(screen.queryByLabelText(/unread message/i)).toBeNull();
  });
});

/**
 * The panel as a floating card, and what an overlay owes the reader.
 *
 * The shape is not decoration here: the panel lifts off the edge so that
 * below `lg` it can get out of the page's way entirely. At 768px a permanent
 * 15rem column left the messages screen 496px to hold a conversation list and
 * a thread side by side, so the pane was present and unusable.
 */
describe("the floating panel", () => {
  const panel = () => document.getElementById("app-sidebar")!;

  it("is a card with the panel corner rather than a column on the edge", () => {
    show("ADMIN");
    expect(panel().className).toContain("rounded-panel");
    expect(panel().className).toContain("squircle");
  });

  it("is inset on every side, so the corners are corners", () => {
    show("ADMIN");
    for (const side of ["left-3", "top-3", "bottom-3"]) {
      expect(panel().className).toContain(side);
    }
  });

  /* It floats, so it needs elevation: without a shadow a card on a ground of
     nearly the same colour is just a differently shaped patch. */
  it("carries elevation", () => {
    show("ADMIN");
    expect(panel().className).toContain("shadow-card");
  });

  /*
    The one that was a real bug. A closed drawer was only translated
    off-screen, so on a phone every one of its links was still reachable by
    Tab and still announced - two dozen invisible stops between the hamburger
    and the page. `inert` is the single attribute that removes both.
  */
  it("is inert while it is off-screen", () => {
    signIn("ADMIN");
    renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />);
    expect(panel()).toHaveAttribute("inert");
  });

  it("is reachable again once it is open", () => {
    signIn("ADMIN");
    renderWithProviders(<Sidebar isOpen onClose={vi.fn()} />);
    expect(panel()).not.toHaveAttribute("inert");
  });

  /* Tapping the scrim and pressing Escape both close it, but neither is on
     the screen. A panel covering what you were reading should show the way
     back rather than assume you know it. */
  it("offers a way out that can be seen", async () => {
    const onClose = vi.fn();
    signIn("ADMIN");
    renderWithProviders(<Sidebar isOpen onClose={onClose} />);
    const close = screen.getByRole("button", { name: /close the menu/i });
    close.click();
    expect(onClose).toHaveBeenCalled();
  });
});
