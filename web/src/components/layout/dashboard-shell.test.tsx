import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), back: fn(), refresh: fn(), prefetch: fn() },
    pathname: { current: "/admin" },
    // The route below the shell, which is what the content region is keyed
    // on. Held apart from the pathname because the two can move separately.
    segments: { current: ["admin"] as string[] },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => h.pathname.current,
  useSearchParams: () => new URLSearchParams(),
  useSelectedLayoutSegments: () => h.segments.current,
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
  h.segments.current = ["admin"];
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
 * The head teacher, whose post is the academic side.
 *
 * They are not an administrator, so the rest of /admin is closed to them, but
 * the report cards, the mark book and the staff pages are the job. Those live
 * under /admin as one copy rather than as a second prefix holding the same
 * code, which is the same arrangement the bursar and the boarding staff have.
 */
describe("DashboardShell and the head teacher", () => {
  const land = (path: string, role = "HEAD_TEACHER") => {
    h.pathname.current = path;
    signIn(role as "ADMIN");
    localStorage.setItem("access_token", "good");
    render(wrap(<DashboardShell><Child /></DashboardShell>));
  };

  /**
   * A dashboard of their own, unlike the bursar's.
   *
   * The bursar has none because their question is "who has not paid" and the
   * register answers it. The head teacher's day is spent unblocking a
   * pipeline they do not run themselves, so the question that starts it -
   * what is stuck, and on whom - is genuinely spread across four screens and
   * worth answering in one.
   */
  it("lands on the dashboard that answers what is stuck", async () => {
    land("/teacher/marks");
    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/head-teacher"),
    );
  });

  it.each([
    "/head-teacher",
    "/admin/report-cards",
    "/admin/marks",
    "/admin/classes",
    "/admin/timetable",
    "/admin/teachers",
    "/admin/attendance",
  ])("lets them onto %s, which is the post", async (path) => {
    land(path);
    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  // Money, welfare and the account roll belong to other posts.
  it.each([
    "/admin/users",
    "/admin/settings",
    "/admin/finance",
    "/admin/health",
    "/boarding",
    "/nurse",
  ])("sends them off %s, which is not", async (path) => {
    land(path);
    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/head-teacher"),
    );
  });

  /**
   * The class teachers write on the report cards screen, so they reach it
   * too. It is one page shared rather than two copies, because the failure
   * it replaces is precisely two people disagreeing about whether a class is
   * finished.
   */
  it("lets a class teacher onto the report cards they write on", async () => {
    land("/admin/report-cards", "TEACHER");
    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  /**
   * The principal is on this list too, which is the whole point of item one:
   * report cards are the Director of Studies' to run.
   *
   * It is worth naming separately because it is where the first attempt got
   * it wrong. The screen was listed among the pages *shared* with `/admin`,
   * and that map adds roles to the prefix's own rather than replacing them -
   * so the principal quietly kept it while every menu said otherwise.
   */
  it.each(["STUDENT", "PARENT", "BURSAR", "NURSE", "ADMIN"])(
    "keeps a %s off the report cards screen",
    async (role) => {
      land("/admin/report-cards", role);
      await waitFor(() => expect(h.router.replace).toHaveBeenCalled());
    },
  );

  /* A path with no rule is open to every signed-in account, so the dashboard
     needs one of its own rather than relying on nobody guessing the URL. */
  it.each(["STUDENT", "PARENT", "TEACHER", "BURSAR"])(
    "keeps a %s off the dashboard itself",
    async (role) => {
      land("/head-teacher", role);
      await waitFor(() => expect(h.router.replace).toHaveBeenCalled());
    },
  );

  /**
   * The pages that moved off the principal's desk entirely.
   *
   * They still live under `/admin` because a second prefix would be a second
   * copy of the same screens, but the principal no longer reaches them. The
   * API refuses them, and a page that loads and then 403s on every request is
   * worse than a redirect.
   */
  it.each(["/admin/marks", "/admin/attendance", "/admin/reports"])(
    "sends the principal off %s, which is not theirs any more",
    async (path) => {
      land(path, "ADMIN");
      await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/admin"));
    },
  );

  it.each(["/admin/marks", "/admin/attendance", "/admin/reports"])(
    "lets the head teacher onto %s",
    async (path) => {
      land(path, "HEAD_TEACHER");
      await waitFor(() =>
        expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
      );
      expect(h.router.replace).not.toHaveBeenCalled();
    },
  );

  // The principal covering for them reads the same page.
  it("lets the admin read it", async () => {
    land("/head-teacher", "ADMIN");
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
 * data, and it was a hard cut. Opacity only, and keyed on the route so it
 * replays per page - nothing moves, and nothing is delayed, which is what
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

  /**
   * The key is the route, not the address.
   *
   * A page that rewrites its own URL without navigating - the chat, which
   * puts the open thread in the address - was being destroyed and faded back
   * in on every click, losing its scroll position and anything half written
   * in the process. That was the whole page being thrown away, not a
   * transition.
   */
  it("keeps the page it has when only the address changes", async () => {
    h.segments.current = ["messages"];
    h.pathname.current = "/messages";
    signIn("ADMIN");
    localStorage.setItem("access_token", "good");

    const view = render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    const before = document.querySelector("#main-content")!;

    h.pathname.current = "/messages/conv-1";
    view.rerender(wrap(<DashboardShell><Child /></DashboardShell>));

    expect(document.querySelector("#main-content")).toBe(before);
  });

  // A real move between pages still gets its fade.
  it("builds the region again when the route itself changes", async () => {
    h.segments.current = ["admin"];
    h.pathname.current = "/admin";
    signIn("ADMIN");
    localStorage.setItem("access_token", "good");

    const view = render(wrap(<DashboardShell><Child /></DashboardShell>));
    await waitFor(() =>
      expect(screen.getByText(/the dashboard/i)).toBeInTheDocument(),
    );
    const before = document.querySelector("#main-content")!;

    h.segments.current = ["admin", "students"];
    h.pathname.current = "/admin/students";
    view.rerender(wrap(<DashboardShell><Child /></DashboardShell>));

    expect(document.querySelector("#main-content")).not.toBe(before);
  });

  // The animation must never gate the content: it fades what is already
  // there, so a reader - or a test - finds it on the first frame.
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
