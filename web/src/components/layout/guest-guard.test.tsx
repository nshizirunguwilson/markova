import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), back: fn(), refresh: fn(), prefetch: fn() },
    pathname: { current: "/login" },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => h.pathname.current,
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, waitFor } from "@testing-library/react";
import { GuestGuard } from "./guest-guard";
import { signIn, signOut } from "@/test/harness";

const Child = () => <div>the sign in form</div>;

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  h.pathname.current = "/login";
  localStorage.clear();
  signOut();
});

describe("GuestGuard with no session", () => {
  it("shows the page when there is no token at all", async () => {
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(screen.getByText(/the sign in form/i)).toBeInTheDocument());
    expect(h.api.get).not.toHaveBeenCalled();
  });

  // A token in storage is not proof of a live session. It may be revoked, past
  // refreshing, or belong to a since-deactivated user.
  it("shows the page when the stored token turns out to be dead", async () => {
    localStorage.setItem("access_token", "stale");
    h.api.get.mockRejectedValue({ response: { status: 401 } });
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(screen.getByText(/the sign in form/i)).toBeInTheDocument());
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("hides the form while it is still checking", () => {
    localStorage.setItem("access_token", "maybe-valid");
    h.api.get.mockImplementation(() => new Promise(() => {}));
    render(<GuestGuard><Child /></GuestGuard>);
    expect(screen.queryByText(/the sign in form/i)).not.toBeInTheDocument();
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
  });
});

describe("GuestGuard with a live session", () => {
  it("sends an already-resolved user to their dashboard", async () => {
    signIn("TEACHER");
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/teacher"));
    expect(screen.queryByText(/the sign in form/i)).not.toBeInTheDocument();
  });

  it("verifies a stored token with the API before redirecting", async () => {
    localStorage.setItem("access_token", "good");
    h.api.get.mockResolvedValue({
      data: { id: "u-1", role: "ADMIN", firstName: "Aline", forcePasswordChange: false },
    });
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/admin"));
    expect(h.api.get).toHaveBeenCalledWith("/auth/profile");
  });

  it.each([
    ["ADMIN", "/admin"],
    ["STUDENT", "/student"],
    ["PARENT", "/parent"],
    ["LIBRARIAN", "/librarian"],
  ])("sends a %s to %s", async (role, path) => {
    signIn(role as "ADMIN");
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith(path));
  });

  // Already resolved in this tab and mid forced-change: the store already
  // holds the user, so the guard must not ask the API again, and must not
  // redirect away from the step that handles it.
  it("leaves a resolved user who must change their password on the page", async () => {
    signIn("ADMIN", { forcePasswordChange: true });
    localStorage.setItem("access_token", "good");
    h.api.get.mockClear();

    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(screen.getByText(/the sign in form/i)).toBeInTheDocument());

    expect(h.router.replace).not.toHaveBeenCalled();
    expect(h.api.get).not.toHaveBeenCalled();
  });

  // A token in storage is not proof of a live session, so a rejected profile
  // call has to clear it rather than leave a half-signed-in tab.
  it("clears a dead token and shows the form", async () => {
    localStorage.setItem("access_token", "revoked");
    h.api.get.mockRejectedValue({ response: { status: 401 } });

    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(screen.getByText(/the sign in form/i)).toBeInTheDocument());

    expect(localStorage.getItem("access_token")).toBeNull();
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  // Someone mid forced-change has a live token but must not be waved through:
  // the step that handles it lives on the login page.
  it("leaves a user who must change their password on the page", async () => {
    localStorage.setItem("access_token", "good");
    h.api.get.mockResolvedValue({
      data: { id: "u-1", role: "ADMIN", forcePasswordChange: true },
    });
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(screen.getByText(/the sign in form/i)).toBeInTheDocument());
    expect(h.router.replace).not.toHaveBeenCalled();
  });
});

describe("GuestGuard exemptions", () => {
  // A reset link arrives by email with its own single-use token. The recipient
  // is often already signed in on this browser, and bouncing them would burn
  // the link for nothing.
  it("lets a signed-in user reach the reset page", async () => {
    h.pathname.current = "/reset-password";
    signIn("ADMIN");
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(screen.getByText(/the sign in form/i)).toBeInTheDocument());
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it("still guards the forgot-password page", async () => {
    h.pathname.current = "/forgot-password";
    signIn("ADMIN");
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/admin"));
  });
});

/**
 * The welfare roles.
 *
 * A patron and a matron share /boarding - the same job on opposite sides of
 * the school - and the nurse has /nurse. Before those existed both were sent
 * to a working page under /admin instead.
 */
describe("GuestGuard and the welfare roles", () => {
  it.each([
    ["PATRON", "/boarding"],
    ["MATRON", "/boarding"],
    ["NURSE", "/nurse"],
  ])("sends a %s to %s", async (role, path) => {
    signIn(role as "ADMIN");
    render(<GuestGuard><Child /></GuestGuard>);
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith(path));
  });

  it("sends a matron there after verifying a stored token", async () => {
    localStorage.setItem("access_token", "good");
    h.api.get.mockResolvedValue({
      data: { id: "u-9", role: "MATRON", firstName: "Grace", forcePasswordChange: false },
    });

    render(<GuestGuard><Child /></GuestGuard>);

    await waitFor(() =>
      expect(h.router.replace).toHaveBeenCalledWith("/boarding"),
    );
  });
});

describe("GuestGuard when the page is left mid-check", () => {
  it("does not resolve after the component has gone", async () => {
    localStorage.setItem("access_token", "good");
    let settle: (v: unknown) => void = () => {};
    h.api.get.mockImplementation(
      () => new Promise((resolve) => { settle = resolve; }),
    );

    const { unmount } = render(<GuestGuard><Child /></GuestGuard>);
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();

    unmount();
    // The profile lands after the user has already navigated away. Nothing
    // must be redirected or set on a component that is gone.
    settle({ data: { id: "u-1", role: "ADMIN", forcePasswordChange: false } });
    await Promise.resolve();

    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it("does not sign anyone out after the component has gone", async () => {
    localStorage.setItem("access_token", "stale");
    let fail: (e: unknown) => void = () => {};
    h.api.get.mockImplementation(
      () => new Promise((_, reject) => { fail = reject; }),
    );

    const { unmount } = render(<GuestGuard><Child /></GuestGuard>);
    unmount();
    fail({ response: { status: 401 } });
    await Promise.resolve();

    // The token is still there: clearing it would sign the user out of the
    // page they navigated to.
    expect(localStorage.getItem("access_token")).toBe("stale");
  });
});
