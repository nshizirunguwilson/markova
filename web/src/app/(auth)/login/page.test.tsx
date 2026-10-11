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
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/login",
}));

import { renderWithProviders } from "@/test/harness";
import { screen, waitFor } from "@testing-library/react";
import LoginPage from "./page";

const tokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: { id: "u-1", role: "TEACHER", firstName: "Aline", forcePasswordChange: false },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  localStorage.clear();
});

async function fillAndSubmit(identifier: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email or phone/i), identifier);
  await user.type(screen.getByLabelText(/^password$/i), password);
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  return user;
}

describe("login form", () => {
  it("refuses an empty submit and does not call the API", async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(/email or phone is required/i)).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("requires a password of at least six characters", async () => {
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "abc");
    await waitFor(() => expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // Parents are registered by phone and often have no email at all, so the form
  // has to work out which field the API is being given.
  it("sends an email as email", async () => {
    h.api.post.mockResolvedValue({ data: tokens });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(h.api.post.mock.calls[0][1]).toMatchObject({ email: "aline.uwase@markova.edu" });
  });

  it("sends a phone number as phone", async () => {
    h.api.post.mockResolvedValue({ data: tokens });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("+250788100000", "Password123!");
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(h.api.post.mock.calls[0][1]).toMatchObject({ phone: "+250788100000" });
  });

  it("stores both tokens and routes to the role dashboard", async () => {
    h.api.post.mockResolvedValue({ data: tokens });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/teacher"));
    expect(localStorage.getItem("access_token")).toBe("access-token");
    expect(localStorage.getItem("refresh_token")).toBe("refresh-token");
  });

  it.each([
    ["ADMIN", "/admin"],
    ["STUDENT", "/student"],
    ["PARENT", "/parent"],
    ["LIBRARIAN", "/librarian"],
  ])("routes a %s to %s", async (role, path) => {
    h.api.post.mockResolvedValue({ data: { ...tokens, user: { ...tokens.user, role } } });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("someone@markova.edu", "Password123!");
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith(path));
  });

  it("shows the API's own message when the credentials are wrong", async () => {
    h.api.post.mockRejectedValue({
      response: { status: 401, data: { message: "Invalid credentials" } },
    });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "WrongPass1!");
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.router.push).not.toHaveBeenCalled();
  });

  it("reveals and re-hides the password", async () => {
    renderWithProviders(<LoginPage />);
    const user = userEvent.setup();
    const field = screen.getByLabelText(/^password$/i);
    expect(field).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(field).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(field).toHaveAttribute("type", "password");
  });
});

describe("the OTP step", () => {
  beforeEach(() => {
    h.api.post.mockResolvedValue({ data: { requiresOtp: true, sessionId: "session-1" } });
  });

  it("swaps the form for the code entry when the API asks for one", async () => {
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /verify & continue/i })).toBeInTheDocument();
  });

  // The sixth digit used to submit on its own, which spent the code on a typo.
  it("does not verify on the sixth keystroke", async () => {
    renderWithProviders(<LoginPage />);
    const user = await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
    h.api.post.mockClear();
    await user.type(screen.getByLabelText(/verification code/i), "123456");
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("verifies only when the button is pressed", async () => {
    renderWithProviders(<LoginPage />);
    const user = await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
    h.api.post.mockClear();
    h.api.post.mockResolvedValue({ data: tokens });
    await user.type(screen.getByLabelText(/verification code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify & continue/i }));
    await waitFor(() => expect(h.api.post).toHaveBeenCalledWith("/auth/verify-otp", {
      sessionId: "session-1",
      otp: "123456",
    }));
  });

  it("offers a way back to the password form", async () => {
    renderWithProviders(<LoginPage />);
    const user = await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /back to login/i }));
    await waitFor(() => expect(screen.getByLabelText(/email or phone/i)).toBeInTheDocument());
  });

  it("tells a phone user the code went to their phone", async () => {
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("+250788100000", "Password123!");
    await waitFor(() => expect(h.toast.info).toHaveBeenCalledWith(expect.stringMatching(/phone/i)));
  });
});

/**
 * The code is no longer written to the API log, so without a mail server a
 * developer had nowhere to read it. Outside production the API returns it as
 * devOtp, and the page offers it, the same way the reset page offers its link.
 * In production the field is never sent, so there is nothing to show.
 */
describe("the code during development", () => {
  it("offers the code when the API hands it back, and fills it in", async () => {
    h.api.post.mockResolvedValue({
      data: { requiresOtp: true, sessionId: "session-1", devOtp: "482913" },
    });
    renderWithProviders(<LoginPage />);
    const user = await fillAndSubmit("aline.uwase@markova.edu", "Password123!");

    const shortcut = await screen.findByRole("button", { name: /use code 482913/i });
    await user.click(shortcut);
    expect(screen.getByLabelText(/verification code/i)).toHaveValue("482913");
  });

  it("offers nothing when the API does not send it", async () => {
    h.api.post.mockResolvedValue({ data: { requiresOtp: true, sessionId: "session-1" } });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");

    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /use code/i })).toBeNull();
  });
});

describe("a forced password change", () => {
  it("asks for a new password instead of going to the dashboard", async () => {
    h.api.post.mockResolvedValue({
      data: { ...tokens, user: { ...tokens.user, forcePasswordChange: true } },
    });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() =>
      expect(screen.getByText(/must change your password/i)).toBeInTheDocument(),
    );
    expect(h.router.push).not.toHaveBeenCalled();
  });

  /** Signs in as someone the server says must change their password. */
  async function reachChangePassword() {
    h.api.post.mockResolvedValue({
      data: { ...tokens, user: { ...tokens.user, forcePasswordChange: true } },
    });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() =>
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument(),
    );
  }

  async function fillChange(current: string, next: string, confirm = next) {
    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/current password/i), {
        target: { value: current },
      });
      fireEvent.change(screen.getByLabelText(/^new password$/i), {
        target: { value: next },
      });
      fireEvent.change(screen.getByLabelText(/confirm/i), {
        target: { value: confirm },
      });
    });
  }

  async function submitChange() {
    const { act, fireEvent } = await import("@testing-library/react");
    const form = screen.getByLabelText(/current password/i).closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });
  }

  // The tokens are already stored by then, so an interrupted change would
  // leave a half signed-in session behind.
  it("keeps the session it was given while the change is pending", async () => {
    await reachChangePassword();
    expect(localStorage.getItem("access_token")).toBe("access-token");
  });

  it("changes the password and goes on to the dashboard", async () => {
    await reachChangePassword();
    await fillChange("Password123!", "Umwarimu2026!");

    h.api.post.mockClear();
    h.api.post.mockResolvedValue({ data: { success: true } });
    await submitChange();

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("change-password"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).newPassword).toBe("Umwarimu2026!");
    });
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/teacher"));
  });

  // A typo in the confirmation would set a password the person does not know.
  it("refuses a confirmation that does not match", async () => {
    await reachChangePassword();
    await fillChange("Password123!", "Umwarimu2026!", "Umwarimu2027!");

    h.api.post.mockClear();
    await submitChange();

    await waitFor(() => expect(screen.getByText(/do not match/i)).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("refuses a new password that is too weak", async () => {
    await reachChangePassword();
    await fillChange("Password123!", "abc");

    h.api.post.mockClear();
    await submitChange();

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  // Getting the current password wrong is ordinary, and the person has to stay
  // on this step to try again rather than be dropped back to sign in.
  it("stays on the step when the server refuses the change", async () => {
    await reachChangePassword();
    await fillChange("Wrong123!", "Umwarimu2026!");

    h.api.post.mockClear();
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401, data: { message: "Current password is incorrect" } },
    });
    h.router.push.mockClear();
    await submitChange();

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Current password is incorrect"),
    );
    expect(h.router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  it("does not send the confirmation field to the server", async () => {
    await reachChangePassword();
    await fillChange("Password123!", "Umwarimu2026!");

    h.api.post.mockClear();
    h.api.post.mockResolvedValue({ data: { success: true } });
    await submitChange();

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("change-password"),
      );
      expect(call).toBeTruthy();
      expect(call![1]).not.toHaveProperty("confirmPassword");
    });
  });
});

/**
 * Resending the code.
 *
 * A code that never arrived is the commonest way an OTP login stalls, and the
 * resend is rate limited by the server. The cooldown exists so someone does not
 * tap it five times and lock themselves out of their own sign in.
 */
describe("resending the OTP", () => {
  async function reachOtp() {
    h.api.post.mockResolvedValue({ data: { requiresOtp: true, sessionId: "session-1" } });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() =>
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument(),
    );
  }

  it("counts down before offering a resend", async () => {
    await reachOtp();
    const resend = screen.getByRole("button", { name: /resend/i });
    expect(resend).toBeDisabled();
    expect(resend.textContent).toMatch(/\d+s/);
  });

  it("asks the server for a new code once the wait is over", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachOtp();

    const { act } = await import("@testing-library/react");
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    h.api.post.mockClear();
    h.api.post.mockResolvedValue({ data: { sessionId: "session-2", cooldownSeconds: 30 } });

    const resend = screen.getByRole("button", { name: /resend/i });
    await act(async () => {
      resend.click();
    });

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/auth/resend-otp", {
        sessionId: "session-1",
      }),
    );
    vi.useRealTimers();
  }, 20000);

  it("verifies against the new session after a resend", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachOtp();

    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    h.api.post.mockResolvedValue({ data: { sessionId: "session-2" } });
    await act(async () => {
      screen.getByRole("button", { name: /resend/i }).click();
    });
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());

    h.api.post.mockClear();
    h.api.post.mockResolvedValue({ data: tokens });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/verification code/i), {
        target: { value: "654321" },
      });
    });
    await act(async () => {
      screen.getByRole("button", { name: /verify & continue/i }).click();
    });

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/auth/verify-otp", {
        sessionId: "session-2",
        otp: "654321",
      }),
    );
    vi.useRealTimers();
  }, 20000);

  it("says so when the resend is refused", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachOtp();

    const { act } = await import("@testing-library/react");
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    h.api.post.mockRejectedValue({
      response: { status: 429, data: { message: "Too many requests" } },
    });
    h.toast.error.mockClear();

    await act(async () => {
      screen.getByRole("button", { name: /resend/i }).click();
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    vi.useRealTimers();
  }, 20000);

  // The code expires before the session does, and saying so is kinder than
  // letting someone type a dead code and be told it is wrong.
  it("says when the code has expired", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachOtp();

    const { act } = await import("@testing-library/react");
    await act(async () => {
      vi.advanceTimersByTime(301_000);
    });

    await waitFor(() => expect(document.body.textContent).toMatch(/expired/i));
    vi.useRealTimers();
  }, 20000);

  it("reports a wrong code without losing the step", async () => {
    await reachOtp();
    h.api.post.mockRejectedValue({
      response: { status: 400, data: { message: "Invalid OTP" } },
    });

    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/verification code/i), {
        target: { value: "000000" },
      });
    });
    await act(async () => {
      screen.getByRole("button", { name: /verify & continue/i }).click();
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
  });
});

/**
 * Where each role lands, and the resend's own guards.
 *
 * A role the app does not know about still has to land somewhere real rather
 * than on a blank screen, and the resend button has to refuse a second press
 * while the first is still in flight: two codes issued a second apart is how
 * someone locks themselves out.
 */
describe("where signing in sends each role", () => {
  it.each([
    ["ADMIN", "/admin"],
    ["TEACHER", "/teacher"],
    ["STUDENT", "/student"],
    ["PARENT", "/parent"],
    ["LIBRARIAN", "/librarian"],
  ])("sends a %s to %s", async (role, path) => {
    h.api.post.mockResolvedValue({
      data: { ...tokens, user: { ...tokens.user, role } },
    });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");

    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith(path));
  });

  /* The newer roles, from the one place that knows each role's home
     (homeFor). The sign in page used to keep its own list, which sent
     them all to /admin first. */
  it.each([
    ["BURSAR", "/admin/finance"],
    ["HEAD_TEACHER", "/head-teacher"],
    ["PATRON", "/boarding"],
    ["MATRON", "/boarding"],
    ["NURSE", "/nurse"],
  ])("sends a %s straight to %s", async (role, path) => {
    h.api.post.mockResolvedValue({
      data: { ...tokens, user: { ...tokens.user, role } },
    });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");

    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith(path));
  });
});

/**
 * Somebody who belongs to more than one school and has never chosen is asked
 * which, before anything else is shown. Aline teaches at Markova Academy and
 * is a parent at G.S. Umucyo.
 */
describe("choosing a school", () => {
  const schools = [
    {
      userId: "u-1",
      role: "TEACHER",
      school: { id: "s-1", name: "Markova Academy", slug: "markova-academy" },
    },
    {
      userId: "u-2",
      role: "PARENT",
      school: { id: "s-2", name: "G.S. Umucyo", slug: "gs-umucyo" },
    },
  ];

  async function reachChoice() {
    h.api.post.mockResolvedValueOnce({
      data: { ...tokens, schools, chooseSchool: true },
    });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await screen.findByText("Which school?");
  }

  it("lists every school, with the role held there", async () => {
    await reachChoice();
    expect(screen.getByText("Markova Academy")).toBeInTheDocument();
    expect(screen.getByText("G.S. Umucyo")).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(h.router.push).not.toHaveBeenCalled();
  });

  it("goes straight in to the school the sign in already opened", async () => {
    await reachChoice();
    await userEvent.click(screen.getByRole("button", { name: /Markova Academy/ }));
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/teacher"));
    expect(h.api.post).toHaveBeenCalledTimes(1);
  });

  it("moves the session to another school, then goes in", async () => {
    await reachChoice();
    h.api.post.mockResolvedValueOnce({
      data: {
        accessToken: "access-2",
        refreshToken: "refresh-2",
        user: { id: "u-2", role: "PARENT", forcePasswordChange: false },
      },
    });
    h.api.get.mockResolvedValueOnce({
      data: { id: "u-2", role: "PARENT", firstName: "Aline", forcePasswordChange: false },
    });
    await userEvent.click(screen.getByRole("button", { name: /G\.S\. Umucyo/ }));

    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/parent"));
    expect(h.api.post).toHaveBeenLastCalledWith("/auth/switch", {
      userId: "u-2",
      refreshToken: "refresh-token",
    });
    expect(localStorage.getItem("access_token")).toBe("access-2");
  });

  it("does not ask somebody who has chosen before", async () => {
    h.api.post.mockResolvedValueOnce({
      data: { ...tokens, schools, chooseSchool: false },
    });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/teacher"));
    expect(screen.queryByText("Which school?")).not.toBeInTheDocument();
  });

  it("says so when a school cannot be opened", async () => {
    await reachChoice();
    h.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { message: "That school is not on your list" } },
    });
    await userEvent.click(screen.getByRole("button", { name: /G\.S\. Umucyo/ }));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("That school is not on your list"),
    );
    expect(h.router.push).not.toHaveBeenCalled();
  });
});

describe("the resend button's own guard", () => {
  async function reachOtpStep() {
    h.api.post.mockResolvedValue({ data: { requiresOtp: true, sessionId: "session-1" } });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit("aline.uwase@markova.edu", "Password123!");
    await waitFor(() =>
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument(),
    );
  }

  it("sends nothing while the cooldown is still running", async () => {
    await reachOtpStep();
    h.api.post.mockClear();

    const { act } = await import("@testing-library/react");
    const resend = screen.getByRole("button", { name: /resend/i });
    await act(async () => {
      resend.click();
    });

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/auth/resend-otp"),
      ),
    ).toBeUndefined();
  });

  it("keeps the old session when the server sends no new one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachOtpStep();

    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    // A resend that reuses the session answers without a sessionId.
    h.api.post.mockResolvedValue({ data: {} });
    await act(async () => {
      screen.getByRole("button", { name: /resend/i }).click();
    });
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());

    h.api.post.mockClear();
    h.api.post.mockResolvedValue({ data: tokens });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/verification code/i), {
        target: { value: "123456" },
      });
    });
    await act(async () => {
      screen.getByRole("button", { name: /verify & continue/i }).click();
    });

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/auth/verify-otp", {
        sessionId: "session-1",
        otp: "123456",
      }),
    );
    vi.useRealTimers();
  }, 20000);

  it("waits again when a resend that is not rate limited fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachOtpStep();

    const { act } = await import("@testing-library/react");
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    // A 500, not a 429: the button comes back rather than pretending to be
    // rate limited.
    h.api.post.mockRejectedValue({ response: { status: 500, data: {} } });
    await act(async () => {
      screen.getByRole("button", { name: /resend/i }).click();
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /resend/i })).toBeEnabled();
    vi.useRealTimers();
  }, 20000);
});
