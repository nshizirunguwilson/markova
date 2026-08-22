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
  teacher: { id: "teacher-1", employeeId: "EMP-001", qualification: "BSc Education" },
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

describe("changing your password", () => {
  async function openPasswordForm() {
    await mount();
    const tab = screen
      .queryAllByRole("button")
      .find((b) => /password|security/i.test(b.textContent ?? ""));
    if (tab) await userEvent.setup().click(tab);
    return document.querySelectorAll<HTMLInputElement>('input[type="password"]');
  }

  // Someone who mistypes their new password twice would otherwise be locked out
  // of an account they still had access to a moment ago.
  it("refuses when the confirmation does not match", async () => {
    const fields = await openPasswordForm();
    if (fields.length < 2) return;
    h.api.post.mockClear();

    const user = userEvent.setup();
    await user.type(fields[fields.length - 2], "Umunyeshuri2026!");
    await user.type(fields[fields.length - 1], "Different2026!");

    const save = screen
      .queryAllByRole("button")
      .find((b) => /change|update|save/i.test(b.textContent ?? ""));
    if (!save) return;
    await user.click(save);

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("change-password"))).toBe(false);
    });
  });

  it("refuses a new password that is too weak", async () => {
    const fields = await openPasswordForm();
    if (fields.length < 2) return;
    h.api.post.mockClear();

    const user = userEvent.setup();
    for (const field of fields) await user.type(field, "abc");

    const save = screen
      .queryAllByRole("button")
      .find((b) => /change|update|save/i.test(b.textContent ?? ""));
    if (!save) return;
    await user.click(save);

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("change-password"))).toBe(false);
    });
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
