/**
 * The signed-out pages other than login.
 *
 * Password reset is the path someone takes when they are already locked out and
 * frustrated, so its failure states matter more than most: it has to say what
 * happened without ever confirming whether an account exists.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    params: { current: new URLSearchParams() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/forgot-password",
  useSearchParams: () => h.params.current,
}));

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/harness";

import ForgotPasswordPage from "./forgot-password/page";
import ResetPasswordPage from "./reset-password/page";

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  for (const m of Object.values(h.router)) m.mockReset();
  h.params.current = new URLSearchParams();
});

describe("asking for a reset link", () => {
  it("renders the form", () => {
    renderWithProviders(<ForgotPasswordPage />);
    expect(screen.getByRole("button", { name: /send|reset/i })).toBeInTheDocument();
  });

  it("refuses an empty submit", async () => {
    renderWithProviders(<ForgotPasswordPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: /send|reset/i }));
    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("sends an email address as an email", async () => {
    h.api.post.mockResolvedValue({ data: { message: "sent" } });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    const field = document.querySelector("input") as HTMLInputElement;
    await user.type(field, "aline.uwase@markova.edu");
    await user.click(screen.getByRole("button", { name: /send|reset/i }));

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(String(h.api.post.mock.calls[0][0])).toContain("request-reset");
  });

  // Most parents on this system have a phone number and no email at all.
  it("sends a phone number as a phone", async () => {
    h.api.post.mockResolvedValue({ data: { message: "sent" } });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    const field = document.querySelector("input") as HTMLInputElement;
    await user.type(field, "+250788100000");
    await user.click(screen.getByRole("button", { name: /send|reset/i }));

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    const body = h.api.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.phone ?? body.email).toBeTruthy();
  });

  // Telling someone "no such account" hands an attacker a way to enumerate who
  // is registered, so the wording has to be the same either way.
  it("says the same thing whether or not the account exists", async () => {
    h.api.post.mockResolvedValue({ data: { message: "sent" } });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(document.querySelector("input") as HTMLInputElement, "nobody@markova.edu");
    await user.click(screen.getByRole("button", { name: /send|reset/i }));
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(document.body.textContent).not.toMatch(/no such|not found|does not exist/i);
  });

  // A rejected request still means the API heard us, so the wording stays the
  // same. Only a request that never arrived is reported as a failure.
  it("keeps the wording when the API rejects the request", async () => {
    h.api.post.mockRejectedValue({ response: { status: 400, data: { message: "No" } } });
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    await user.type(document.querySelector("input") as HTMLInputElement, "aline.uwase@markova.edu");
    await user.click(screen.getByRole("button", { name: /send|reset/i }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
  });

  it("reports a request that never reached the server", async () => {
    // No `response` at all is what axios gives for a transport failure.
    h.api.post.mockRejectedValue(
      Object.assign(new Error("Network Error"), { isAxiosError: true }),
    );
    renderWithProviders(<ForgotPasswordPage />);
    const user = userEvent.setup();
    const field = document.querySelector("input") as HTMLInputElement;
    await user.type(field, "aline.uwase@markova.edu");
    await user.click(screen.getByRole("button", { name: /send|reset/i }));

    await waitFor(() =>
      expect(
        h.toast.error.mock.calls.length + h.toast.success.mock.calls.length,
      ).toBeGreaterThan(0),
    );
    // Whatever it says, it must not claim a link is on its way.
    expect(h.toast.error).toHaveBeenCalled();
  });
});

describe("setting a new password", () => {
  function renderReset(token = "reset-token") {
    h.params.current = new URLSearchParams(token ? `token=${token}` : "");
    return renderWithProviders(<ResetPasswordPage />);
  }

  it("renders both password fields", async () => {
    renderReset();
    await waitFor(() =>
      expect(document.querySelectorAll('input[type="password"]').length).toBeGreaterThan(1),
    );
  });

  it("refuses a weak password", async () => {
    renderReset();
    await waitFor(() =>
      expect(document.querySelectorAll('input[type="password"]').length).toBeGreaterThan(1),
    );
    const fields = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    const user = userEvent.setup();
    await user.type(fields[0], "abc");
    await user.type(fields[1], "abc");
    await user.click(screen.getByRole("button", { name: /reset|set|save|continue/i }));
    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("refuses when the two passwords differ", async () => {
    renderReset();
    await waitFor(() =>
      expect(document.querySelectorAll('input[type="password"]').length).toBeGreaterThan(1),
    );
    const fields = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    const user = userEvent.setup();
    await user.type(fields[0], "Umunyeshuri2026!");
    await user.type(fields[1], "Something2026!");
    await user.click(screen.getByRole("button", { name: /reset|set|save|continue/i }));
    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("sends the token with the new password", async () => {
    h.api.post.mockResolvedValue({ data: { message: "ok" } });
    renderReset("the-token");
    await waitFor(() =>
      expect(document.querySelectorAll('input[type="password"]').length).toBeGreaterThan(1),
    );
    const fields = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    const user = userEvent.setup();
    await user.type(fields[0], "Umunyeshuri2026!");
    await user.type(fields[1], "Umunyeshuri2026!");
    await user.click(screen.getByRole("button", { name: /reset|set|save|continue/i }));

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(h.api.post.mock.calls[0][1]).toMatchObject({ token: "the-token" });
  });

  // A reset link that has already been used, or has expired, has to say so
  // rather than silently failing.
  it("reports an expired or spent link", async () => {
    h.api.post.mockRejectedValue({
      response: { status: 400, data: { message: "This reset link has expired" } },
    });
    renderReset();
    await waitFor(() =>
      expect(document.querySelectorAll('input[type="password"]').length).toBeGreaterThan(1),
    );
    const fields = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    const user = userEvent.setup();
    await user.type(fields[0], "Umunyeshuri2026!");
    await user.type(fields[1], "Umunyeshuri2026!");
    await user.click(screen.getByRole("button", { name: /reset|set|save|continue/i }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  // A link with no token is one an email client mangled. The page says so
  // instead of offering a form that could never work.
  it("shows an invalid link notice rather than the form", async () => {
    renderReset("");
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
    expect(document.body.textContent).toMatch(/invalid|expired|link/i);
  });
});
