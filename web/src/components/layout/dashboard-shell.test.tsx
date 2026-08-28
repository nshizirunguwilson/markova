import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), back: fn(), refresh: fn(), prefetch: fn() },
    pathname: { current: "/admin" },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => h.pathname.current,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-socket", () => ({ useSocketConnection: () => undefined }));
// The stub reports the props the shell hands it, so the sidebar toggle can be
// exercised without pulling in the real navigation tree.
vi.mock("./sidebar", () => ({
  Sidebar: (props: { isOpen?: boolean; onClose?: () => void }) => (
    <nav data-open={props.isOpen ? "yes" : "no"}>
      sidebar
      <button onClick={() => props.onClose?.()}>close sidebar</button>
    </nav>
  ),
}));
vi.mock("./topbar", () => ({
  Topbar: (props: { onToggleSidebar?: () => void }) => (
    <header>
      topbar
      <button onClick={() => props.onToggleSidebar?.()}>toggle sidebar</button>
    </header>
  ),
}));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { DashboardShell } from "./dashboard-shell";
import { makeQueryClient, signIn, signOut } from "@/test/harness";

const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={makeQueryClient()}>{ui}</QueryClientProvider>
);
const Child = () => <main>the dashboard</main>;

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  h.pathname.current = "/admin";
  localStorage.clear();
  signOut();
});

describe("DashboardShell authentication", () => {
  it("sends a visitor with no token to the login page", async () => {
    render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(/the dashboard/i)).not.toBeInTheDocument();
  });

  it("loads the profile when a token is present but the store is empty", async () => {
    localStorage.setItem("access_token", "good");
    h.api.get.mockResolvedValue({ data: { id: "u-1", role: "ADMIN", firstName: "Aline" } });
    render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() => expect(screen.getByText(/the dashboard/i)).toBeInTheDocument());
    expect(h.api.get).toHaveBeenCalledWith("/auth/profile");
  });

  it("signs the user out when the profile call is rejected", async () => {
    localStorage.setItem("access_token", "stale");
    h.api.get.mockRejectedValue({ response: { status: 401 } });
    render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/login"));
  });

  it("renders the shell for an already-signed-in user", async () => {
    signIn("ADMIN");
    localStorage.setItem("access_token", "good");
    render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() => expect(screen.getByText(/the dashboard/i)).toBeInTheDocument());
    expect(screen.getByText("sidebar")).toBeInTheDocument();
    expect(screen.getByText("topbar")).toBeInTheDocument();
  });
});

// The API enforces data access on its own, but a student should never even
// reach /admin by typing the URL.
describe("DashboardShell role guarding", () => {
  it.each([
    ["STUDENT", "/admin", "/student"],
    ["TEACHER", "/admin/users", "/teacher"],
    ["PARENT", "/teacher/marks", "/parent"],
    ["LIBRARIAN", "/admin", "/librarian"],
  ])("moves a %s away from %s to %s", async (role, path, expected) => {
    h.pathname.current = path;
    signIn(role as "ADMIN");
    localStorage.setItem("access_token", "good");
    render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith(expected));
    expect(screen.queryByText(/the dashboard/i)).not.toBeInTheDocument();
  });

  it("leaves a user on their own subtree", async () => {
    h.pathname.current = "/teacher/marks";
    signIn("TEACHER");
    localStorage.setItem("access_token", "good");
    render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() => expect(screen.getByText(/the dashboard/i)).toBeInTheDocument());
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  // /messages and /help are shared, so they carry no role prefix and everyone
  // is allowed through.
  it.each(["STUDENT", "PARENT", "TEACHER", "ADMIN", "LIBRARIAN"])(
    "lets a %s reach the shared pages",
    async (role) => {
      h.pathname.current = "/messages";
      signIn(role as "ADMIN");
      localStorage.setItem("access_token", "good");
      render(wrap(<DashboardShell><Child /></DashboardShell>));
      await waitFor(() => expect(screen.getByText(/the dashboard/i)).toBeInTheDocument());
      expect(h.router.replace).not.toHaveBeenCalled();
    },
  );

  it("honours an explicit allowedRoles list", async () => {
    h.pathname.current = "/messages";
    signIn("STUDENT");
    localStorage.setItem("access_token", "good");
    render(wrap(<DashboardShell allowedRoles={["ADMIN"]}><Child /></DashboardShell>));
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/student"));
  });
});

/**
 * The sidebar on a phone.
 *
 * On a narrow screen the navigation is a drawer: the topbar opens it and
 * choosing something has to close it again, or the page a teacher just tapped
 * is hidden behind the menu they tapped it from.
 */
describe("DashboardShell sidebar", () => {
  async function shell() {
    signIn("ADMIN");
    localStorage.setItem("access_token", "good");
    render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() => expect(screen.getByText(/the dashboard/i)).toBeInTheDocument());
  }

  it("starts closed", async () => {
    await shell();
    expect(screen.getByRole("navigation").getAttribute("data-open")).toBe("no");
  });

  it("opens from the topbar", async () => {
    await shell();
    await act(async () => {
      fireEvent.click(screen.getByText("toggle sidebar"));
    });

    await waitFor(() =>
      expect(screen.getByRole("navigation").getAttribute("data-open")).toBe("yes"),
    );
  });

  it("closes again from the same control", async () => {
    await shell();
    await act(async () => {
      fireEvent.click(screen.getByText("toggle sidebar"));
    });
    await waitFor(() =>
      expect(screen.getByRole("navigation").getAttribute("data-open")).toBe("yes"),
    );

    await act(async () => {
      fireEvent.click(screen.getByText("toggle sidebar"));
    });
    await waitFor(() =>
      expect(screen.getByRole("navigation").getAttribute("data-open")).toBe("no"),
    );
  });

  // Choosing a destination has to dismiss the drawer covering it.
  it("closes when the sidebar asks to be closed", async () => {
    await shell();
    await act(async () => {
      fireEvent.click(screen.getByText("toggle sidebar"));
    });
    await waitFor(() =>
      expect(screen.getByRole("navigation").getAttribute("data-open")).toBe("yes"),
    );

    await act(async () => {
      fireEvent.click(screen.getByText("close sidebar"));
    });
    await waitFor(() =>
      expect(screen.getByRole("navigation").getAttribute("data-open")).toBe("no"),
    );
  });

  // Nothing of the app may render while the profile is still being fetched:
  // the role is not known yet, so a guarded page could flash.
  it("shows only a spinner while the profile loads", async () => {
    localStorage.setItem("access_token", "good");
    let settle: (v: unknown) => void = () => {};
    h.api.get.mockImplementation(
      () => new Promise((resolve) => { settle = resolve; }),
    );

    render(wrap(<DashboardShell><Child /></DashboardShell>));
    // The spinner carries no text, so the check is that the app is not there.
    expect(screen.queryByText(/the dashboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText("sidebar")).not.toBeInTheDocument();

    settle({ data: { id: "u-1", role: "ADMIN", firstName: "Aline" } });
    await waitFor(() => expect(screen.getByText(/the dashboard/i)).toBeInTheDocument());
  });
});

/**
 * The welfare staff.
 *
 * A patron and a matron do the same job on opposite sides of the school, so
 * they share /boarding; the nurse has /nurse. Both used to be dropped
 * straight onto a working page instead, because neither dashboard existed.
 */
describe("DashboardShell and the welfare roles", () => {
  it.each([
    ["PATRON", "/boarding"],
    ["MATRON", "/boarding"],
    ["NURSE", "/nurse"],
  ])("sends a %s to %s rather than to a page that does not exist", async (role, expected) => {
    h.pathname.current = "/teacher/marks";
    signIn(role as "ADMIN");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith(expected));
  });

  it("lets a matron onto the pocket money page itself", async () => {
    h.pathname.current = "/admin/pocket-money";
    signIn("MATRON" as "ADMIN");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it("lets a nurse onto the clinic page", async () => {
    h.pathname.current = "/admin/health";
    signIn("NURSE" as "ADMIN");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it("keeps a matron off the rest of /admin", async () => {
    h.pathname.current = "/admin/users";
    signIn("MATRON" as "ADMIN");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/boarding"),
    );
  });

  it.each([
    ["PATRON", "/boarding"],
    ["MATRON", "/boarding"],
    ["NURSE", "/nurse"],
  ])("lets a %s onto %s, which is theirs", async (role, path) => {
    h.pathname.current = path;
    signIn(role as "ADMIN");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  // Their homes are theirs alone: the boarding staff have no business on the
  // nurse's ward, and nobody else belongs on either.
  it.each([
    ["NURSE", "/boarding", "/nurse"],
    ["PATRON", "/nurse", "/boarding"],
    ["STUDENT", "/boarding", "/student"],
    ["TEACHER", "/nurse", "/teacher"],
  ])("sends a %s away from %s", async (role, path, expected) => {
    h.pathname.current = path;
    signIn(role as "ADMIN");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith(expected),
    );
  });

  it("lets any signed-in role onto a path no rule covers", async () => {
    // A route outside every known prefix carries no rule, so the shell defers
    // to the API rather than inventing a redirect.
    h.pathname.current = "/somewhere-new";
    signIn("STUDENT");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    expect(h.router.replace).not.toHaveBeenCalled();
  });
});

/**
 * Motion on the content region.
 *
 * The most-seen transition in the app is a page swapping its spinner for
 * data, and it was a hard cut. Opacity only, and keyed on the path so it
 * replays per page — nothing moves, and nothing is delayed, which is what
 * separates this from a sliding route transition in a tool people use all
 * day.
 */
describe("DashboardShell content motion", () => {
  it("fades the content region in", async () => {
    h.pathname.current = "/admin";
    signIn("ADMIN");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    const main = document.querySelector("#main-content")!;
    expect(main.className).toContain("motion-fade-in");
  });

  // The animation must never gate the content: it fades what is already
  // there, so a reader — or a test — finds it on the first frame.
  it("has the page in the document straight away", async () => {
    h.pathname.current = "/admin";
    signIn("ADMIN");
    localStorage.setItem("access_token", "good");

    render(wrap(<DashboardShell><Child /></DashboardShell>));

    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    expect(
      document.querySelector("#main-content")!.textContent,
    ).toMatch(/the dashboard/i);
  });
});
