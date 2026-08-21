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
});
