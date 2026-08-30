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

/**
 * `type` is the channel a notice went out on - SMS, EMAIL, PUSH. It is NOT
 * what the notice is about, and the bell used to try to route on it, which is
 * why every branch was dead. `relatedEntityType` carries the subject.
 */
const notifications = [
  {
    id: "n-1",
    title: "Marks published",
    body: "Term 1 is out",
    isRead: false,
    type: "PUSH",
    relatedEntityType: "MARKS",
  },
  {
    id: "n-2",
    title: "Absent today",
    body: "Divine was absent",
    isRead: true,
    type: "SMS",
    relatedEntityType: "ATTENDANCE",
    relatedEntityId: "student-1",
  },
];

function mount(role: "ADMIN" | "STUDENT" | "TEACHER" = "ADMIN") {
  signIn(role, { firstName: "Aline", lastName: "Uwase" });
  return renderWithProviders(<Topbar onToggleSidebar={vi.fn()} />);
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  serve(h.api, {
    "/notifications/unread": { unreadCount: 1 },
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

/**
 * Jumping to a page from the search box.
 *
 * The box searches the pages this role can reach, so it is also the fastest way
 * to land somewhere the sidebar hides on a phone.
 */
describe("Topbar search", () => {
  const box = () => screen.getByLabelText(/search pages/i) as HTMLInputElement;

  async function type(text: string) {
    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(box(), { target: { value: text } });
    });
  }

  /**
   * Types and waits for the results.
   *
   * The query is debounced, so a key pressed straight after typing sees an
   * empty result list and does nothing.
   */
  async function typeAndWait(text: string, expected: RegExp) {
    await type(text);
    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => expected.test(b.textContent ?? "")),
      ).toBe(true),
    );
  }

  it("stays closed until something is typed", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    expect(box().value).toBe("");
  });

  it("offers the pages that match", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await type("class");

    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => /classes/i.test(b.textContent ?? "")),
      ).toBe(true),
    );
  });

  // Type and press Enter is the whole point; reaching for the mouse to pick
  // the first result defeats it.
  it("goes to the first match on Enter", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    mount();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await typeAndWait("class", /classes/i);

    h.router.push.mockClear();
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter", code: "Enter" });
    });

    await waitFor(() => expect(h.router.push).toHaveBeenCalled());
    expect(String(h.router.push.mock.calls[0][0])).toMatch(/classes/i);
  });

  it("goes nowhere on Enter when nothing matched", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    mount();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await type("zzzzzzz");
    // Long enough for the debounce to have produced results if any existed.
    await new Promise((r) => setTimeout(r, 400));

    h.router.push.mockClear();
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter", code: "Enter" });
    });

    expect(h.router.push).not.toHaveBeenCalled();
  });

  it("empties the box when cleared", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    mount();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await typeAndWait("class", /classes/i);

    const clear = screen.getByRole("button", { name: /clear search/i });
    await act(async () => {
      fireEvent.click(clear);
    });

    expect(box().value).toBe("");
  });

  it("closes the results on Escape without leaving the page", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    mount();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await typeAndWait("class", /classes/i);

    h.router.push.mockClear();
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Escape", code: "Escape" });
    });

    expect(h.router.push).not.toHaveBeenCalled();
  });

  it("reopens the results when the box is focused again", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    mount();
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await typeAndWait("class", /classes/i);
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Escape", code: "Escape" });
      fireEvent.focus(box());
    });

    await waitFor(() =>
      expect(
        screen.getAllByRole("button").some((b) => /classes/i.test(b.textContent ?? "")),
      ).toBe(true),
    );
  });

  // A student has no admin pages, so the box must not offer them one.
  it("only offers pages the role can reach", async () => {
    mount("STUDENT");
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await type("user");
    await new Promise((r) => setTimeout(r, 400));

    const hrefs = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .join("|");
    expect(hrefs).not.toMatch(/manage users/i);
  });
});

/**
 * Tapping a notification.
 *
 * The point of the notification is the thing it is about, so it has to land on
 * the page that holds it rather than just dismissing itself.
 */
describe("Topbar notification routing", () => {
  async function openNotifications() {
    const { act, fireEvent } = await import("@testing-library/react");
    mount("TEACHER");
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const bell = screen
      .getAllByRole("button")
      .find((b) => /notification/i.test(b.getAttribute("aria-label") ?? ""));
    expect(bell).toBeTruthy();
    await act(async () => {
      fireEvent.click(bell!);
    });
    await waitFor(() => expect(screen.getByText(/Marks published/)).toBeInTheDocument());
  }

  async function tap(title: RegExp) {
    const { act, fireEvent } = await import("@testing-library/react");
    const row = screen.getByText(title).closest("button") ?? screen.getByText(title);
    await act(async () => {
      fireEvent.click(row);
    });
  }

  it("takes a marks notification to the marks page", async () => {
    await openNotifications();
    h.router.push.mockClear();
    await tap(/Marks published/);

    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/teacher/marks"));
  });

  it("takes an attendance notification to the attendance page", async () => {
    await openNotifications();
    h.router.push.mockClear();
    await tap(/Absent today/);

    await waitFor(() =>
      expect(h.router.push).toHaveBeenCalledWith(
        expect.stringContaining("/teacher/attendance"),
      ),
    );
  });

  it("marks it read as well as opening it", async () => {
    await openNotifications();
    h.api.patch.mockClear();
    h.api.post.mockClear();
    h.api.put.mockClear();
    await tap(/Marks published/);

    await waitFor(() =>
      expect(
        h.api.patch.mock.calls.length +
          h.api.post.mock.calls.length +
          h.api.put.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });

  // Each role has their own inbox in the sidebar, and the notification has to
  // land in the same one.
  it("takes a message notification to that role's inbox", async () => {
    serve(h.api, {
      "/notifications/unread": { unreadCount: 1 },
      "/notifications": [
        {
          id: "n-3",
          title: "New message",
          body: "From Jean",
          isRead: false,
          type: "PUSH",
          relatedEntityType: "MESSAGE",
        },
      ],
    });
    await openNotificationsWithMessage();

    h.router.push.mockClear();
    await tap(/New message/);
    await waitFor(() =>
      expect(h.router.push).toHaveBeenCalledWith("/teacher/messages"),
    );
  });

  /**
   * The record the notice is about, not just the list it lives in. An
   * attendance alert names the student it concerns.
   */
  it("carries the record's id through to the page", async () => {
    await openNotifications();
    h.router.push.mockClear();
    await tap(/Absent today/);

    await waitFor(() =>
      expect(h.router.push).toHaveBeenCalledWith(
        "/teacher/attendance?highlight=student-1",
      ),
    );
  });

  /**
   * Everything raised before the subject column existed, and the whole demo
   * seed, has nothing declared. Reading the title keeps those working rather
   * than leaving half the bell inert.
   */
  it("works out where an older notice belongs from its title", async () => {
    serve(h.api, {
      "/notifications/unread": { unreadCount: 1 },
      "/notifications": [
        {
          id: "n-4",
          title: "Homework Graded",
          body: "Your homework was graded",
          isRead: false,
          type: "PUSH",
        },
      ],
    });
    mount("TEACHER");
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const { act, fireEvent } = await import("@testing-library/react");
    const bell = screen
      .getAllByRole("button")
      .find((b) => /notification/i.test(b.getAttribute("aria-label") ?? ""));
    await act(async () => {
      fireEvent.click(bell!);
    });
    await waitFor(() =>
      expect(screen.getByText(/Homework Graded/)).toBeInTheDocument(),
    );

    h.router.push.mockClear();
    await tap(/Homework Graded/);
    await waitFor(() =>
      expect(h.router.push).toHaveBeenCalledWith("/teacher/homework"),
    );
  });

  // A row that opens nothing should not look like a row that does.
  it("says which notices can be opened", async () => {
    await openNotifications();
    const openable = screen
      .getByText(/Marks published/)
      .closest("button")!;
    expect(openable.getAttribute("aria-label")).toMatch(/open$/);
  });

  async function openNotificationsWithMessage() {
    const { act, fireEvent } = await import("@testing-library/react");
    mount("TEACHER");
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const bell = screen
      .getAllByRole("button")
      .find((b) => /notification/i.test(b.getAttribute("aria-label") ?? ""));
    await act(async () => {
      fireEvent.click(bell!);
    });
    await waitFor(() => expect(screen.getByText(/New message/)).toBeInTheDocument());
  }

  // Not every notification has somewhere to go, and one that does not must
  // still close cleanly rather than navigating to a made-up path.
  it("stays put for a notification with no page behind it", async () => {
    serve(h.api, {
      "/notifications/unread": { unreadCount: 1 },
      "/notifications": [
        { id: "n-4", title: "School closed", body: "Friday", isRead: false, type: "GENERAL" },
      ],
    });
    const { act, fireEvent } = await import("@testing-library/react");
    mount("TEACHER");
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const bell = screen
      .getAllByRole("button")
      .find((b) => /notification/i.test(b.getAttribute("aria-label") ?? ""));
    await act(async () => {
      fireEvent.click(bell!);
    });
    await waitFor(() => expect(screen.getByText(/School closed/)).toBeInTheDocument());

    h.router.push.mockClear();
    await tap(/School closed/);
    expect(h.router.push).not.toHaveBeenCalled();
  });
});

/**
 * How long ago a notification arrived.
 *
 * A timestamp on a notification is only useful as a rough distance: "2h ago"
 * tells a teacher whether to act now, an ISO string tells them nothing. Each
 * band has to hand over at the right point, or a notification from last week
 * reads as one from this morning.
 */
describe("Topbar notification age", () => {
  function ago(ms: number) {
    return new Date(Date.now() - ms).toISOString();
  }

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  async function openWith(createdAt: string) {
    const { act, fireEvent } = await import("@testing-library/react");
    serve(h.api, {
      "/notifications/unread": { unreadCount: 1 },
      "/notifications": [
        { id: "n-1", title: "Marks published", body: "Term 1", isRead: false, type: "MARKS", createdAt },
      ],
    });
    mount("TEACHER");
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const bell = screen
      .getAllByRole("button")
      .find((b) => /notification/i.test(b.getAttribute("aria-label") ?? ""));
    await act(async () => {
      fireEvent.click(bell!);
    });
    await waitFor(() => expect(screen.getByText(/Marks published/)).toBeInTheDocument());
  }

  it("says just now for something seconds old", async () => {
    await openWith(ago(30 * SECOND));
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
  });

  it("counts in minutes under an hour", async () => {
    await openWith(ago(20 * MINUTE));
    expect(screen.getByText("20m ago")).toBeInTheDocument();
  });

  it("counts in hours under a day", async () => {
    await openWith(ago(5 * HOUR));
    expect(screen.getByText("5h ago")).toBeInTheDocument();
  });

  it("counts in days under a week", async () => {
    await openWith(ago(3 * DAY));
    expect(screen.getByText("3d ago")).toBeInTheDocument();
  });

  // Past a week the distance stops being useful and the date is clearer.
  it("gives the date once it is more than a week old", async () => {
    await openWith(ago(10 * DAY));
    expect(screen.queryByText(/ago/)).toBeNull();
    expect(document.body.textContent).toMatch(/\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/);
  });

  // The boundaries are where an off-by-one shows up.
  it("hands over from seconds to minutes at a minute", async () => {
    await openWith(ago(MINUTE + SECOND));
    expect(screen.getByText("1m ago")).toBeInTheDocument();
  });

  it("hands over from minutes to hours at an hour", async () => {
    await openWith(ago(HOUR + MINUTE));
    expect(screen.getByText("1h ago")).toBeInTheDocument();
  });

  it("hands over from hours to days at a day", async () => {
    await openWith(ago(DAY + HOUR));
    expect(screen.getByText("1d ago")).toBeInTheDocument();
  });
});

describe("Topbar account menu", () => {
  const openProfile = async (role: string) => {
    const { act, fireEvent } = await import("@testing-library/react");
    mount(role as "ADMIN");
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText(/Aline/));
    });
    const profile = screen
      .getAllByRole("button")
      .find((b) => /profile/i.test(b.textContent ?? ""));
    expect(profile).toBeTruthy();
    await act(async () => {
      fireEvent.click(profile as HTMLElement);
    });
  };

  /**
   * One profile route, for every role.
   *
   * This used to be built from the role name, which worked for the five
   * roles that happen to have a page of their own and sent everybody else
   * somewhere that does not exist: /bursar/profile, /nurse/profile,
   * /head_teacher/profile. The shell bounced them straight back to their
   * dashboard, so their own profile - the only place they can change their
   * password or their photograph - could not be opened from the one menu
   * that offers it.
   */
  it.each([
    "ADMIN",
    "TEACHER",
    "STUDENT",
    "PARENT",
    "LIBRARIAN",
    "HEAD_TEACHER",
    "BURSAR",
    "NURSE",
    "PATRON",
    "MATRON",
  ])("takes a %s to their own profile", async (role) => {
    await openProfile(role);
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/profile"));
  });

  // The bug in one line: no role builds a path out of its own name any more.
  it("never routes to a path built from the role name", async () => {
    await openProfile("HEAD_TEACHER");
    expect(h.router.push).not.toHaveBeenCalledWith("/head_teacher/profile");
  });

  // Backing out of signing out must leave the session alone.
  it("stays signed in when the confirmation is dismissed", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    localStorage.setItem("access_token", "a");
    mount("ADMIN");
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText(/Aline/));
    });
    const signOut = await screen.findByText(/sign out/i);
    await act(async () => {
      fireEvent.click(signOut);
    });

    const cancel = screen
      .getAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    if (!cancel) return;
    await act(async () => {
      fireEvent.click(cancel);
    });

    expect(h.router.push).not.toHaveBeenCalledWith("/login");
    expect(localStorage.getItem("access_token")).toBe("a");
  });
});

/**
 * Read and unread.
 *
 * A notification that has been opened must stop shouting: no tint, no dot, no
 * bold. The field is `isRead` on the server, and reading the wrong name here
 * made every notification permanently unread, which is the same as having no
 * read state at all.
 */
describe("Topbar read and unread notifications", () => {
  const opened = { ...notifications[1], isRead: true };
  const fresh = { ...notifications[0], isRead: false };

  async function openBell(rows: unknown[]) {
    serve(h.api, {
      "/notifications/unread": { unreadCount: 1 },
      "/notifications": rows,
    });
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() =>
      expect(screen.getByText("Notifications")).toBeInTheDocument(),
    );
  }

  it("marks an unopened one with a dot", async () => {
    await openBell([fresh]);
    const row = (await screen.findByText("Marks published")).closest("div")!
      .parentElement!;
    expect(row.querySelector(".bg-primary")).not.toBeNull();
  });

  it("leaves an opened one plain", async () => {
    await openBell([opened]);
    const row = (await screen.findByText("Absent today")).closest("div")!
      .parentElement!;
    expect(row.querySelector(".bg-primary")).toBeNull();
  });

  it("bolds only the unopened one", async () => {
    await openBell([fresh, opened]);

    const unread = await screen.findByText("Marks published");
    const read = screen.getByText("Absent today");
    expect(unread.className).toMatch(/font-medium/);
    expect(read.className).not.toMatch(/font-medium/);
  });

  it("tints only the unopened row", async () => {
    await openBell([fresh, opened]);

    const rowOf = (title: string) =>
      screen.getByText(title).closest("button")!;
    expect(rowOf("Marks published").className).toMatch(/bg-primary/);
    expect(rowOf("Absent today").className).not.toMatch(/bg-primary/);
  });
});

describe("Topbar unread badge", () => {
  /*
    The shape `/notifications/unread` actually answers with. This said
    `{ count }` and the bell read `.count` to match, so the test proved a
    badge that has never once appeared in the running app.
  */
  async function withCount(unreadCount: number) {
    serve(h.api, {
      "/notifications/unread": { unreadCount },
      "/notifications": notifications,
    });
    mount();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument(),
    );
  }

  it("shows the number when there are a few", async () => {
    await withCount(7);
    expect(await screen.findByText("7")).toBeInTheDocument();
  });

  it("caps a very large count so it still fits the badge", async () => {
    await withCount(348);
    expect(await screen.findByText("99+")).toBeInTheDocument();
  });

  it("shows no badge at all when nothing is waiting", async () => {
    await withCount(0);
    const bell = screen.getByRole("button", { name: /notifications/i });
    expect(bell.querySelector("span")).toBeNull();
  });
});
