import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { screen, waitFor } from "@testing-library/react";
import { SignInDetails } from "./sign-in-details";
import { ResetSignIn } from "./reset-sign-in";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve } from "@/test/page";
import { useAuthStore } from "@/stores/auth-store";

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

/**
 * How the person signs in: shared by all their schools, changed only by
 * them, and only after a code sent to the new address comes back.
 */
describe("how you sign in", () => {
  const mount = () => {
    signIn("TEACHER", {
      id: "u-1",
      email: "contact@school.rw",
      login: { email: "aline.uwase@markova.edu", phone: null },
    });
    return renderWithProviders(<SignInDetails />);
  };

  it("shows the login, not the school's contact details", () => {
    mount();
    expect(screen.getByText("aline.uwase@markova.edu")).toBeInTheDocument();
    expect(screen.queryByText("contact@school.rw")).not.toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("changes nothing until the code comes back", async () => {
    mount();
    serve(h.api, {
      "/auth/login-details": { sessionId: "s-1", devOtp: "123456" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Change the email you sign in with" }),
    );
    await userEvent.type(screen.getByLabelText("New email"), "aline@gmail.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(h.api.post).toHaveBeenCalledWith("/auth/login-details", {
      email: "aline@gmail.com",
    });
    expect(await screen.findByLabelText("Code sent to aline@gmail.com")).toBeInTheDocument();
    expect(h.api.post).toHaveBeenCalledTimes(1);
  });

  it("changes the login once the code is entered", async () => {
    mount();
    serve(h.api, {
      "/auth/login-details/confirm": {
        id: "u-1",
        login: { email: null, phone: "+250788123456" },
      },
      "/auth/login-details": { sessionId: "s-1", devOtp: "654321" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Change the phone number you sign in with" }),
    );
    await userEvent.type(screen.getByLabelText("New phone number"), "+250788123456");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Dev shortcut: use code 654321" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenLastCalledWith("/auth/login-details/confirm", {
        sessionId: "s-1",
        code: "654321",
      }),
    );
    await waitFor(() =>
      expect(useAuthStore.getState().user?.login?.phone).toBe("+250788123456"),
    );
    expect(h.toast.success).toHaveBeenCalledWith("You now sign in with +250788123456");
  });

  it("says why a new one is refused", async () => {
    mount();
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: "That email is already used to sign in to Markova" },
      },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Change the email you sign in with" }),
    );
    await userEvent.type(screen.getByLabelText("New email"), "taken@markova.edu");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "That email is already used to sign in to Markova",
      ),
    );
  });

  it("keeps the form open when the code is wrong", async () => {
    mount();
    serve(h.api, { "/auth/login-details": { sessionId: "s-1" } });
    await userEvent.click(
      screen.getByRole("button", { name: "Change the email you sign in with" }),
    );
    await userEvent.type(screen.getByLabelText("New email"), "aline@gmail.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await screen.findByLabelText("Code sent to aline@gmail.com"),
      "000000",
    );
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "That code is not right. Ask for a new one." },
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "That code is not right. Ask for a new one.",
      ),
    );
    expect(screen.getByLabelText("Code sent to aline@gmail.com")).toBeInTheDocument();
  });

  it("can be abandoned", async () => {
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: "Change the email you sign in with" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New email")).not.toBeInTheDocument();
  });
});

/**
 * A school's reset for somebody who lost their phone, allowed only when the
 * school is the only one they belong to. The API decides.
 */
describe("resetting somebody's sign in", () => {
  const mount = () => {
    signIn("ADMIN");
    return renderWithProviders(<ResetSignIn userId="p-1" name="Ange Mukamana" />);
  };

  it("shows the new password once, with what to sign in with", async () => {
    mount();
    serve(h.api, {
      "/users/p-1/reset-login": {
        login: { email: null, phone: "+250788200000" },
        password: "Xy7!abcdEF",
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Reset sign in" }));
    /* The dialog focuses its first control a frame after it opens. */
    await new Promise((r) => requestAnimationFrame(r));
    await userEvent.type(screen.getByLabelText("New phone (optional)"), "+250788200000");
    await userEvent.click(
      screen.getByRole("button", { name: "Reset and make a password" }),
    );

    expect(await screen.findByText("Xy7!abcdEF")).toBeInTheDocument();
    expect(screen.getByText("+250788200000")).toBeInTheDocument();
    expect(h.api.post).toHaveBeenCalledWith("/users/p-1/reset-login", {
      phone: "+250788200000",
    });

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByText("Xy7!abcdEF")).not.toBeInTheDocument(),
    );
  });

  it("can be cancelled without a change", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Reset sign in" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Reset and make a password" }),
      ).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("explains a refusal for somebody in another school too", async () => {
    mount();
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          message:
            "Only this person can change how they sign in, from their own profile.",
        },
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Reset sign in" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Reset and make a password" }),
    );
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "Only this person can change how they sign in, from their own profile.",
      ),
    );
    expect(h.api.post).toHaveBeenCalledWith("/users/p-1/reset-login", {});
  });
});
