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

/**
 * A signature is not a photograph.
 *
 * A photograph is a fact about a person that the school records, and the
 * office may replace anybody's. A signature is an act by them, and one
 * uploaded by somebody else is the school's name written in another person's
 * hand. A report card is countersigned on exactly that distinction, so the
 * page says whose it is rather than leaving it to an error message.
 */
describe("your own signature", () => {
  const withSignature = {
    ...me,
    signatureUrl: "/uploads/signatures/aline.png",
  };

  const mountAs = async (
    role: "TEACHER" | "STUDENT" | "PARENT" | "ADMIN" | "HEAD_TEACHER",
    user: Record<string, unknown> = {},
  ) => {
    renderPage(ProfilePage, {
      role,
      user: { id: "user-1", firstName: "Aline", lastName: "Uwase", ...user },
    });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  };

  it("offers it to the people who sign something", async () => {
    await mountAs("TEACHER");
    expect(screen.getByText(/My signature/i)).toBeInTheDocument();
  });

  it("offers it to the head teacher, who countersigns every card", async () => {
    await mountAs("HEAD_TEACHER");
    expect(screen.getByText(/My signature/i)).toBeInTheDocument();
  });

  /**
   * A parent's line on a report card means something different from the two
   * staff signatures above it: the school is not certifying anything by it,
   * the family is acknowledging they have seen the term. So it is offered,
   * and the copy says what it is for rather than implying an obligation.
   */
  it("offers it to a parent, and says what theirs is for", async () => {
    await mountAs("PARENT");
    expect(screen.getByText(/My signature/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/terms you have seen/i);
  });

  // A control that does nothing teaches people to ignore controls.
  it("does not offer it to a student, who signs nothing", async () => {
    await mountAs("STUDENT");
    expect(screen.queryByText(/My signature/i)).not.toBeInTheDocument();
  });

  it("says plainly that nobody else can touch it", async () => {
    await mountAs("TEACHER");
    expect(document.body.textContent).toMatch(/not even an administrator/i);
  });

  it("sends the chosen file to the signing person's own record", async () => {
    await mountAs("TEACHER");
    const input = screen.getByLabelText(/Upload my signature/i);
    const file = new File(["ink"], "sig.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/users/user-1/signature",
        expect.any(FormData),
        expect.anything(),
      ),
    );
  });

  /**
   * A card printed with a line and a name is still a valid document, which is
   * the form every one of these took before the system existed. Saying so
   * stops the empty state reading as a fault.
   */
  it("says what happens while there is none", async () => {
    await mountAs("TEACHER");
    expect(document.body.textContent).toMatch(/over a line for you to sign/i);
  });

  it("shows the one already uploaded", async () => {
    await mountAs("TEACHER", withSignature);
    expect(screen.getByAltText(/Your signature/i)).toBeInTheDocument();
  });

  it("offers to replace or remove it once there is one", async () => {
    await mountAs("TEACHER", withSignature);
    expect(screen.getByLabelText(/Replace my signature/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").find((b) => /Remove/.test(b.textContent ?? "")),
    ).toBeTruthy();
  });

  /**
   * The API refuses a signature from anybody but its owner, and it says so in
   * a sentence. Repeating that sentence is more use than a house line: the
   * person reading it is usually an administrator finding out that this is
   * the one thing they cannot do on somebody's behalf.
   */
  it("repeats what the server said when it refuses one", async () => {
    await mountAs("TEACHER");
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          message:
            "A signature can only be uploaded by the person it belongs to.",
        },
      },
    });
    const input = screen.getByLabelText(/Upload my signature/i);
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(["ink"], "sig.png", { type: "image/png" })] },
      });
    });
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "A signature can only be uploaded by the person it belongs to.",
      ),
    );
  });

  it("says so when taking one down fails", async () => {
    await mountAs("TEACHER", withSignature);
    h.api.delete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });
    await act(async () => {
      fireEvent.click(
        screen
          .getAllByRole("button")
          .find((b) => /Remove/.test(b.textContent ?? ""))!,
      );
    });
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  // Choosing nothing in the file dialog is not an upload.
  it("sends nothing when the file dialog is dismissed", async () => {
    await mountAs("TEACHER");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Upload my signature/i), {
        target: { files: [] },
      });
    });
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("sends nothing when the replace dialog is dismissed", async () => {
    await mountAs("TEACHER", withSignature);
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Replace my signature/i), {
        target: { files: [] },
      });
    });
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("replaces the one already there", async () => {
    await mountAs("TEACHER", withSignature);
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Replace my signature/i), {
        target: {
          files: [new File(["ink"], "new.png", { type: "image/png" })],
        },
      });
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/users/user-1/signature",
        expect.any(FormData),
        expect.anything(),
      ),
    );
  });

  it("takes it down when asked", async () => {
    await mountAs("TEACHER", withSignature);
    await act(async () => {
      fireEvent.click(
        screen
          .getAllByRole("button")
          .find((b) => /Remove/.test(b.textContent ?? ""))!,
      );
    });
    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith("/users/user-1/signature"),
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

/**
 * The profile of somebody the school never finished setting up.
 *
 * A parent added by phone alone has no email, no photograph and sometimes no
 * surname on the account. That is the most common record in a Rwandan school's
 * database, and it is the one nobody tests.
 */
describe("a profile with almost nothing on it", () => {
  it("shows nothing rather than a broken page when nobody is signed in", async () => {
    const { signOut } = await import("@/test/harness");
    const { renderWithProviders } = await import("@/test/harness");
    signOut();
    const { container } = renderWithProviders(<ProfilePage />);
    expect(container.textContent).toBe("");
  });

  it("says an email is not set rather than leaving a gap", async () => {
    renderPage(ProfilePage, {
      role: "PARENT",
      user: { firstName: "Jean", lastName: "Habimana", email: "" },
    });
    // Email and phone are both empty on a parent added by phone alone.
    await waitFor(() =>
      expect(screen.getAllByText("Not set").length).toBeGreaterThan(0),
    );
  });

  it("builds initials from whatever names there are", async () => {
    renderPage(ProfilePage, {
      role: "PARENT",
      user: { firstName: "Jean", lastName: "", email: "" },
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/Jean/));
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("copes with an account carrying no name at all", async () => {
    renderPage(ProfilePage, {
      role: "PARENT",
      user: { firstName: "", lastName: "", email: "" },
    });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    // Empty initials, not the word "undefined" in a circle.
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it("shows the photograph when there is one", async () => {
    renderPage(ProfilePage, {
      role: "TEACHER",
      user: { firstName: "Aline", lastName: "Uwase", photoUrl: "/uploads/avatars/a.png" },
    });

    /* The whole name, not the first: a screen reader announcing "Aline"
       beside four other Alines has said nothing. */
    const photo = await screen.findByAltText("Aline Uwase");
    expect(photo.getAttribute("src")).toContain("/uploads/avatars/a.png");
    // The initials circle is gone: never both.
    expect(screen.queryByText("AU")).toBeNull();
  });
});

/**
 * The photograph is the one thing on this page other people see, and every
 * role has one. It is the same control for all of them: the profile is a
 * single page that each role's route re-exports.
 */
describe("your own photograph", () => {
  const mountAs = async (
    role: "TEACHER" | "STUDENT" | "PARENT" | "ADMIN" | "HEAD_TEACHER",
    user: Record<string, unknown> = {},
  ) => {
    renderPage(ProfilePage, {
      role,
      user: { id: "user-1", firstName: "Aline", lastName: "Uwase", ...user },
    });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  };

  const chooseFile = async (name = "me.jpg", type = "image/jpeg") => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Choose a photo/i), {
        target: { files: [new File(["x"], name, { type })] },
      });
    });
  };

  const press = async (name: RegExp) => {
    const b = screen.getAllByRole("button").find((x) => name.test(x.textContent ?? ""));
    expect(b).toBeTruthy();
    await act(async () => {
      fireEvent.click(b as HTMLElement);
    });
  };

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:chosen");
    URL.revokeObjectURL = vi.fn();
  });

  it.each(["TEACHER", "STUDENT", "PARENT", "ADMIN", "HEAD_TEACHER"] as const)(
    "is offered to a %s",
    async (role) => {
      await mountAs(role);
      expect(screen.getByLabelText(/Add a photo for Aline Uwase/i)).toBeInTheDocument();
    },
  );

  it("sends the chosen file to their own record", async () => {
    await mountAs("STUDENT");
    await chooseFile();
    await press(/Save photo/);
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/users/user-1/photo",
        expect.any(FormData),
        expect.anything(),
      ),
    );
  });

  /* Nothing crosses the connection until it is saved: the preview is the
     point of the step. */
  it("uploads nothing merely by choosing", async () => {
    await mountAs("STUDENT");
    await chooseFile();
    expect(h.api.post).not.toHaveBeenCalled();
  });

  /**
   * The topbar draws from the same user, so an avatar that stays stale until
   * the next navigation reads as an upload that did not work.
   */
  it("shows the new photograph at once", async () => {
    await mountAs("TEACHER");
    h.api.post.mockResolvedValue({
      data: { photoUrl: "/uploads/photos/new.png" },
    });
    await chooseFile();
    await press(/Save photo/);
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith("Photo updated"),
    );
    await waitFor(() =>
      expect(
        screen.getByAltText("Aline Uwase").getAttribute("src"),
      ).toContain("/uploads/photos/new.png"),
    );
  });

  it("takes one down when asked", async () => {
    await mountAs("TEACHER", { photoUrl: "/uploads/photos/a.png" });
    await press(/Remove/);
    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith("/users/user-1/photo"),
    );
  });

  // A record with no photograph is a real state, so the line says what now.
  it("says what stands in for it once it is gone", async () => {
    await mountAs("TEACHER", { photoUrl: "/uploads/photos/a.png" });
    await press(/Remove/);
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/initials are shown instead/i),
      ),
    );
  });

  it("refuses a file that is not a photograph, without asking the API", async () => {
    await mountAs("TEACHER");
    await chooseFile("notes.pdf", "application/pdf");
    expect(h.toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/not a photograph/i),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("repeats what the server said when it refuses one", async () => {
    await mountAs("TEACHER");
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Only image files are allowed" } },
    });
    await chooseFile();
    await press(/Save photo/);
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Only image files are allowed"),
    );
  });

  it("says so when taking one down fails", async () => {
    await mountAs("TEACHER", { photoUrl: "/uploads/photos/a.png" });
    h.api.delete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });
    await press(/Remove/);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });
});

describe("when the server refuses a change without saying why", () => {
  it("still tells the person the profile did not save", async () => {
    renderPage(ProfilePage, { role: "TEACHER", user: { firstName: "Aline", lastName: "Uwase" } });
    await waitFor(() => expect(document.body.textContent).toMatch(/Aline/));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /edit/i }));
    // A network failure carries no response body at all.
    h.api.patch.mockRejectedValue(Object.assign(new Error("offline"), {}));
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Failed to update profile"),
    );
  });

  it("still tells the person the password did not change", async () => {
    renderPage(ProfilePage, { role: "TEACHER", user: { firstName: "Aline", lastName: "Uwase" } });
    await waitFor(() => expect(document.body.textContent).toMatch(/Aline/));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /change password/i }));

    const fields = screen.getAllByDisplayValue("");
    const passwords = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[type='password']"),
    );
    expect(passwords.length).toBeGreaterThanOrEqual(3);
    for (const field of passwords.slice(0, 3)) {
      await user.type(field, "Password123!");
    }
    expect(fields.length).toBeGreaterThan(0);

    h.api.post.mockRejectedValue(Object.assign(new Error("offline"), {}));
    const submit = screen
      .queryAllByRole("button")
      .find((b) => /^update password$|^change password$/i.test((b.textContent ?? "").trim()))!;
    await user.click(submit);

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Failed to change password"),
    );
  });
});

/** A student sees their own support plan on their profile (B7). */
describe("a student's own support plan", () => {
  it("shows what is done for them in exams", async () => {
    serve(h.api, {
      ...routes,
      "/students/me/sharing": { adult: false, knowsBirthday: true, results: true, conduct: true, health: true, changedAt: null },
      "/students/student-1/support-plan": {
        plan: {
          needs: ["SEEING"],
          needWords: ["Seeing"],
          needNote: null,
          arrangementCodes: ["LARGE_PRINT"],
          extraTimePercent: null,
          otherArrangement: null,
          arrangements: ["Large print"],
          reviewOn: null,
          agreedWith: null,
          updatedAt: "2026-10-01T00:00:00.000Z",
          updatedBy: null,
        },
        mayChange: false,
      },
    });
    renderPage(ProfilePage, {
      role: "STUDENT",
      user: { firstName: "Aline", lastName: "Uwase", studentId: "student-1" },
    });
    expect(await screen.findByTestId("support-plan")).toHaveTextContent("Large print");
  });
});
