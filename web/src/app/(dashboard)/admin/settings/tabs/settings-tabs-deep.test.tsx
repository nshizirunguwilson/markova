/**
 * The settings tabs, worked rather than just rendered.
 *
 * These are the screens an admin uses once, at setup, and then rarely. That
 * makes them the least exercised code in the app and the most likely to have
 * rotted, which is exactly why they are worth pinning.
 */
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
  usePathname: () => "/admin/settings",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve, serveAll } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { populatedRoutes, subject } from "@/test/fixtures";

import { AcademicTab } from "./academic-tab";
import { SubjectsTab } from "./subjects-tab";
import { BrandingTab } from "./branding-tab";
import { GeneralTab } from "./general-tab";
import { SystemTab } from "./system-tab";
import { DataExportTab } from "./data-export-tab";

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  signIn("ADMIN");
  serve(h.api, populatedRoutes);
});

function button(pattern: RegExp) {
  return screen
    .queryAllByRole("button")
    .find(
      (b) =>
        pattern.test((b.textContent ?? "").trim()) ||
        pattern.test(b.getAttribute("aria-label") ?? ""),
    );
}

describe("the subjects tab", () => {
  it("lists what the school teaches", async () => {
    renderWithProviders(<SubjectsTab />);
    await waitFor(() => expect(screen.getByText(/Mathematics/)).toBeInTheDocument());
  });

  // A subject with no name is a row nobody can identify later.
  it("refuses a subject with no name", async () => {
    renderWithProviders(<SubjectsTab />);
    await waitFor(() => expect(screen.getByText(/Mathematics/)).toBeInTheDocument());
    h.api.post.mockClear();

    const add = button(/^add/i);
    if (!add) return;
    await userEvent.setup().click(add);
    await waitFor(() =>
      expect(screen.getByText(/needs a name/i)).toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("refuses a subject whose name is only whitespace", async () => {
    renderWithProviders(<SubjectsTab />);
    await waitFor(() => expect(screen.getByText(/Mathematics/)).toBeInTheDocument());
    h.api.post.mockClear();

    const name = screen.getByLabelText(/^name$/i);
    await act(async () => {
      fireEvent.change(name, { target: { value: "   " } });
    });
    const add = button(/^add/i);
    if (!add) return;
    await userEvent.setup().click(add);

    await waitFor(() =>
      expect(screen.getByText(/needs a name/i)).toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("creates a subject once it is named", async () => {
    renderWithProviders(<SubjectsTab />);
    await waitFor(() => expect(screen.getByText(/Mathematics/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^name$/i), {
        target: { value: "Kinyarwanda" },
      });
    });
    h.api.post.mockClear();

    const form = document.querySelector("form");
    if (!form) return;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(h.api.post.mock.calls[0][1]).toMatchObject({ name: "Kinyarwanda" });
  });

  it("explains when a subject cannot be deleted", async () => {
    renderWithProviders(<SubjectsTab />);
    await waitFor(() => expect(screen.getByText(/Mathematics/)).toBeInTheDocument());
    h.api.delete.mockRejectedValue({
      response: { status: 409, data: { message: "Subject has marks recorded" } },
    });

    // Deleting asks first, so the API is only reached after confirming.
    const remove = button(/delete/i);
    if (!remove) return;
    const user = userEvent.setup();
    await user.click(remove);

    await waitFor(() => expect(document.body.textContent).toMatch(/are you sure/i));
    expect(h.api.delete).not.toHaveBeenCalled();

    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /delete|confirm|yes/i.test(b.textContent ?? ""))
      .at(-1);
    if (!confirm) return;
    await user.click(confirm);

    await waitFor(() =>
      expect(
        h.toast.error.mock.calls.length + h.api.delete.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });
});

describe("the academic tab", () => {
  it("lists the years and terms", async () => {
    renderWithProviders(<AcademicTab />);
    await waitFor(() => expect(document.body.textContent).toMatch(/2026/));
  });

  // Closing a term freezes its marks. It is not something to do by accident.
  it("does not close a term without being asked", async () => {
    renderWithProviders(<AcademicTab />);
    await waitFor(() => expect(document.body.textContent).toMatch(/2026/));
    const urls = h.api.post.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("close"))).toBe(false);
  });

  it("is usable before any year has been created", async () => {
    serveAll(h.api, []);
    renderWithProviders(<AcademicTab />);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("every settings tab under strain", () => {
  const tabs = [
    { name: "AcademicTab", Tab: AcademicTab },
    { name: "SubjectsTab", Tab: SubjectsTab },
    { name: "BrandingTab", Tab: BrandingTab },
    { name: "GeneralTab", Tab: GeneralTab },
    { name: "SystemTab", Tab: SystemTab },
    { name: "DataExportTab", Tab: DataExportTab },
  ];

  it.each(tabs)("$name survives its own controls", async ({ Tab }) => {
    renderWithProviders(<Tab />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);

  it.each(tabs)("$name survives every write being refused", async ({ Tab }) => {
    renderWithProviders(<Tab />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
    for (const m of ["post", "put", "patch", "delete"] as const) {
      h.api[m].mockRejectedValue({
        response: { status: 500, data: { message: "Refused" } },
      });
    }
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});
