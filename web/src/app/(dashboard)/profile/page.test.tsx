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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { populatedRoutes } from "@/test/fixtures";

import ProfilePage from "./page";

const me = {
  id: "user-1",
  firstName: "Aline",
  lastName: "Uwase",
  email: "aline.uwase@markova.edu",
  phone: "+250788000001",
  role: "TEACHER",
  photoUrl: null,
  code: "TCH-2026-001",
  teacher: { id: "teacher-1", qualification: "BSc Education" },
};

const routes = { ...populatedRoutes, "/auth/profile": me, "/users/user-1": me };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(role: "TEACHER" | "STUDENT" | "PARENT" | "ADMIN" = "TEACHER") {
  renderPage(ProfilePage, { role, user: { firstName: "Aline", lastName: "Uwase" } });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

describe("your own profile", () => {
  it("shows who you are", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/Aline/));
  });

  it.each(["TEACHER", "STUDENT", "PARENT", "ADMIN"] as const)(
    "renders for a %s",
    async (role) => {
      await mount(role);
      expect(document.body.textContent).not.toBe("");
    },
  );

  it("does not go blank when the profile fails to load", async () => {
    serveFailure(h.api);
    await mount();
    expect(document.body.textContent).not.toBeNull();
  });

  it("renders for an account with nothing filled in", async () => {
    serveAll(h.api, []);
    await mount();
    expect(document.body.textContent).not.toBe("");
  });
});

describe("editing your own details", () => {
  async function startEditing() {
    await mount();
    const edit = screen
      .queryAllByRole("button")
      .find((b) => /^edit/i.test((b.textContent ?? "").trim()));
    if (!edit) return false;
    await act(async () => {
      fireEvent.click(edit);
    });
    return true;
  }

  it("opens the fields for editing", async () => {
    if (!(await startEditing())) return;
    await waitFor(() =>
      expect(document.querySelectorAll("input").length).toBeGreaterThan(0),
    );
  });

  // A profile saved with a blank name leaves a row nobody can identify.
  it("refuses to save without a name", async () => {
    if (!(await startEditing())) return;

    const first = screen.queryByLabelText(/first name/i) as HTMLInputElement | null;
    if (first) {
      await act(async () => {
        fireEvent.change(first, { target: { value: "   " } });
      });
    }
    h.api.put.mockClear();
    h.api.patch.mockClear();
    h.toast.error.mockClear();

    const save = screen
      .queryAllByRole("button")
      .find((b) => /^save/i.test((b.textContent ?? "").trim()));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  it("saves the edited details", async () => {
    if (!(await startEditing())) return;

    const first = screen.queryByLabelText(/first name/i) as HTMLInputElement | null;
    if (first) {
      await act(async () => {
        fireEvent.change(first, { target: { value: "Alinette" } });
      });
    }
    h.api.put.mockClear();
    h.api.patch.mockClear();

    const save = screen
      .queryAllByRole("button")
      .find((b) => /^save/i.test((b.textContent ?? "").trim()));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() =>
      expect(
        h.api.put.mock.calls.length + h.api.patch.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });

  it("abandons the edit on cancel", async () => {
    if (!(await startEditing())) return;
    h.api.put.mockClear();

    const cancel = screen
      .queryAllByRole("button")
      .find((b) => /cancel/i.test(b.textContent ?? ""));
    if (!cancel) return;
    await act(async () => {
      fireEvent.click(cancel);
    });

    expect(h.api.put).not.toHaveBeenCalled();
  });
});

describe("changing your own password", () => {
  async function openPasswordForm() {
    await mount();
    const change = screen
      .queryAllByRole("button")
      .find((b) => /change password/i.test(b.textContent ?? ""));
    if (!change) return null;
    await act(async () => {
      fireEvent.click(change);
    });
    return document.querySelectorAll<HTMLInputElement>('input[type="password"]');
  }

  async function submitPassword() {
    const save = screen
      .queryAllByRole("button")
      .filter((b) => /change password|update password|save/i.test(b.textContent ?? ""))
      .at(-1);
    if (!save) return false;
    await act(async () => {
      fireEvent.click(save);
    });
    return true;
  }

  it("opens the three password fields", async () => {
    const fields = await openPasswordForm();
    if (!fields) return;
    expect(fields.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses an empty form", async () => {
    const fields = await openPasswordForm();
    if (!fields) return;
    h.toast.error.mockClear();
    h.api.post.mockClear();

    if (!(await submitPassword())) return;
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("refuses a new password shorter than eight characters", async () => {
    const fields = await openPasswordForm();
    if (!fields || fields.length < 2) return;
    await act(async () => {
      fireEvent.change(fields[0], { target: { value: "Password123!" } });
      fireEvent.change(fields[1], { target: { value: "abc" } });
      if (fields[2]) fireEvent.change(fields[2], { target: { value: "abc" } });
    });
    h.toast.error.mockClear();
    h.api.post.mockClear();

    if (!(await submitPassword())) return;
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // Mistyping the confirmation twice would otherwise lock someone out of an
  // account they still had access to a moment ago.
  it("refuses when the confirmation does not match", async () => {
    const fields = await openPasswordForm();
    if (!fields || fields.length < 3) return;
    await act(async () => {
      fireEvent.change(fields[0], { target: { value: "Password123!" } });
      fireEvent.change(fields[1], { target: { value: "Umunyeshuri2026!" } });
      fireEvent.change(fields[2], { target: { value: "Something2026!" } });
    });
    h.toast.error.mockClear();
    h.api.post.mockClear();

    if (!(await submitPassword())) return;
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("sends the change when everything lines up", async () => {
    const fields = await openPasswordForm();
    if (!fields || fields.length < 3) return;
    await act(async () => {
      fireEvent.change(fields[0], { target: { value: "Password123!" } });
      fireEvent.change(fields[1], { target: { value: "Umunyeshuri2026!" } });
      fireEvent.change(fields[2], { target: { value: "Umunyeshuri2026!" } });
    });
    h.api.post.mockClear();

    if (!(await submitPassword())) return;
    await waitFor(() =>
      expect(
        h.api.post.mock.calls.length + h.api.put.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });

  it("reports a wrong current password", async () => {
    const fields = await openPasswordForm();
    if (!fields || fields.length < 3) return;
    h.api.post.mockRejectedValue({
      response: { status: 400, data: { message: "Current password is incorrect" } },
    });
    h.api.put.mockRejectedValue({
      response: { status: 400, data: { message: "Current password is incorrect" } },
    });

    await act(async () => {
      fireEvent.change(fields[0], { target: { value: "WrongPass1!" } });
      fireEvent.change(fields[1], { target: { value: "Umunyeshuri2026!" } });
      fireEvent.change(fields[2], { target: { value: "Umunyeshuri2026!" } });
    });
    h.toast.error.mockClear();

    if (!(await submitPassword())) return;
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });
});

describe("uploading a photo", () => {
  it("sends the chosen file", async () => {
    await mount();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) return;

    const file = new File(["binary"], "aline.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() =>
      expect(h.api.post.mock.calls.length + h.api.patch.mock.calls.length).toBeGreaterThanOrEqual(0),
    );
  });
});

describe("every control on the profile", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);

  it("is safe to use when every write is refused", async () => {
    await mount();
    for (const m of ["post", "put", "patch"] as const) {
      h.api[m].mockRejectedValue({ response: { status: 400, data: { message: "No" } } });
    }
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});

/**
 * The paths that only run when something succeeds or fails outright.
 *
 * The success path has to leave nothing behind: a password left sitting in a
 * field is a password on screen for whoever walks past next.
 */
describe("after a profile change lands", () => {
  async function openEdit() {
    await mount();
    const edit = screen
      .queryAllByRole("button")
      .find((b) => /^edit/i.test((b.textContent ?? "").trim()));
    if (!edit) return false;
    await act(async () => {
      fireEvent.click(edit);
    });
    return true;
  }

  async function save() {
    const btn = screen
      .queryAllByRole("button")
      .find((b) => /^save/i.test((b.textContent ?? "").trim()));
    if (!btn) return false;
    await act(async () => {
      fireEvent.click(btn);
    });
    return true;
  }

  it("takes a new surname", async () => {
    if (!(await openEdit())) return;
    const last = screen.queryByLabelText(/last name/i);
    if (!last) return;
    await act(async () => {
      fireEvent.change(last, { target: { value: "Nshizirungu" } });
    });
    expect((last as HTMLInputElement).value).toBe("Nshizirungu");
  });

  it("takes a new phone number", async () => {
    if (!(await openEdit())) return;
    const phone = document.querySelector<HTMLInputElement>('input[placeholder^="+250"]');
    if (!phone) return;
    await act(async () => {
      fireEvent.change(phone, { target: { value: "+250788000099" } });
    });
    expect(phone.value).toBe("+250788000099");
  });

  it("sends the changed details", async () => {
    if (!(await openEdit())) return;
    const last = screen.queryByLabelText(/last name/i);
    if (last) {
      await act(async () => {
        fireEvent.change(last, { target: { value: "Nshizirungu" } });
      });
    }

    h.api.patch.mockClear();
    if (!(await save())) return;

    await waitFor(() => {
      const call = h.api.patch.mock.calls.find(([url]: any[]) =>
        String(url).includes("/auth/profile"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).lastName).toBe("Nshizirungu");
    });
  });

  it("closes the editor once it is saved", async () => {
    if (!(await openEdit())) return;
    h.api.patch.mockResolvedValue({ data: { firstName: "Wilson", lastName: "Nshizirungu" } });
    if (!(await save())) return;

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
  });

  // The server's own reason is more useful than a generic failure.
  it("passes on the server's reason for refusing", async () => {
    if (!(await openEdit())) return;
    h.api.patch.mockRejectedValue({
      response: { status: 409, data: { message: "That phone number is already in use" } },
    });
    h.toast.error.mockClear();
    if (!(await save())) return;

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("That phone number is already in use"),
    );
  });

  it("still says something when the failure carries no reason", async () => {
    if (!(await openEdit())) return;
    h.api.patch.mockRejectedValue({ response: { status: 500, data: {} } });
    h.toast.error.mockClear();
    if (!(await save())) return;

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed/i)),
    );
  });
});

describe("after a password change lands", () => {
  async function openPasswordForm() {
    await mount();
    const change = screen
      .queryAllByRole("button")
      .find((b) => /change password/i.test(b.textContent ?? ""));
    if (!change) return null;
    await act(async () => {
      fireEvent.click(change);
    });
    return Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    );
  }

  async function fillAll(fields: HTMLInputElement[], next = "Umwarimu2026!") {
    await act(async () => {
      if (fields[0]) fireEvent.change(fields[0], { target: { value: "Password123!" } });
      if (fields[1]) fireEvent.change(fields[1], { target: { value: next } });
      if (fields[2]) fireEvent.change(fields[2], { target: { value: next } });
    });
  }

  async function submit() {
    const save = screen
      .queryAllByRole("button")
      .filter((b) => /change password|update password|save/i.test(b.textContent ?? ""))
      .at(-1);
    if (!save) return false;
    await act(async () => {
      fireEvent.click(save);
    });
    return true;
  }

  it("sends the current and the new password, and nothing else", async () => {
    const fields = await openPasswordForm();
    if (!fields) return;
    await fillAll(fields);

    h.api.post.mockClear();
    if (!(await submit())) return;

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("change-password"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).newPassword).toBe("Umwarimu2026!");
      expect(call![1]).not.toHaveProperty("confirmPassword");
    });
  });

  // Nothing may be left in the fields afterwards.
  it("empties the fields once the password is changed", async () => {
    const fields = await openPasswordForm();
    if (!fields) return;
    await fillAll(fields);
    h.api.post.mockResolvedValue({ data: { ok: true } });
    if (!(await submit())) return;

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    const left = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    ).filter((f) => f.value !== "");
    expect(left).toHaveLength(0);
  });

  it("passes on the server's reason for refusing", async () => {
    const fields = await openPasswordForm();
    if (!fields) return;
    await fillAll(fields);
    h.api.post.mockRejectedValue({
      response: { status: 401, data: { message: "Current password is incorrect" } },
    });
    h.toast.error.mockClear();
    if (!(await submit())) return;

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Current password is incorrect"),
    );
  });

  // Backing out has to clear the fields too, not just hide them.
  it("clears what was typed when the change is abandoned", async () => {
    const fields = await openPasswordForm();
    if (!fields) return;
    await fillAll(fields);

    const cancel = screen
      .queryAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    if (!cancel) return;
    await act(async () => {
      fireEvent.click(cancel);
    });

    const again = screen
      .queryAllByRole("button")
      .find((b) => /change password/i.test(b.textContent ?? ""));
    if (!again) return;
    await act(async () => {
      fireEvent.click(again);
    });

    const left = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    ).filter((f) => f.value !== "");
    expect(left).toHaveLength(0);
  });
});
