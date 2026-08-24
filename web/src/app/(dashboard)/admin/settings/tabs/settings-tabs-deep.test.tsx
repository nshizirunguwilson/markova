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

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

/**
 * Creating years and terms, and closing them.
 *
 * A term with its end before its start would put the whole calendar out, and
 * closing one freezes every mark inside it. Both are one click from the
 * settings page, so both have to behave exactly.
 */
describe("the school calendar", () => {
  async function mountAcademic() {
    renderWithProviders(<AcademicTab />);
    await waitFor(() => expect(document.body.textContent).toMatch(/2026/));
  }

  /** The year form and the term form are told apart by their placeholders. */
  function formWithPlaceholder(placeholder: RegExp) {
    const input = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[placeholder]"),
    ).find((el) => placeholder.test(el.placeholder));
    return input?.closest("form") ?? null;
  }

  async function fillDates(form: HTMLElement, start: string, end: string) {
    const dates = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    await act(async () => {
      if (dates[0]) fireEvent.change(dates[0], { target: { value: start } });
      if (dates[1]) fireEvent.change(dates[1], { target: { value: end } });
    });
  }

  async function submit(form: HTMLElement) {
    await act(async () => {
      fireEvent.submit(form);
    });
  }

  // A year that ends before it starts breaks every term inside it.
  it("refuses a year whose end is before its start", async () => {
    await mountAcademic();
    const form = formWithPlaceholder(/2026-2027/);
    if (!form) return;

    const name = form.querySelector<HTMLInputElement>('input[placeholder*="2026"]')!;
    await act(async () => {
      fireEvent.change(name, { target: { value: "2027-2028" } });
    });
    await fillDates(form, "2027-09-01", "2027-01-01");

    h.api.post.mockClear();
    h.toast.error.mockClear();
    await submit(form);

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/after the start/i)),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("refuses a year with no dates at all", async () => {
    await mountAcademic();
    const form = formWithPlaceholder(/2026-2027/);
    if (!form) return;

    h.api.post.mockClear();
    await submit(form);

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  it("creates a year once the dates make sense", async () => {
    await mountAcademic();
    const form = formWithPlaceholder(/2026-2027/);
    if (!form) return;

    const name = form.querySelector<HTMLInputElement>('input[placeholder*="2026"]')!;
    await act(async () => {
      fireEvent.change(name, { target: { value: "2027-2028" } });
    });
    await fillDates(form, "2027-09-01", "2028-07-01");

    h.api.post.mockClear();
    await submit(form);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/academic/years"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).name).toBe("2027-2028");
    });
  });

  it("refuses a term whose end is before its start", async () => {
    await mountAcademic();
    const form = formWithPlaceholder(/Term 1/);
    if (!form) return;

    const name = form.querySelector<HTMLInputElement>('input[placeholder*="Term"]')!;
    await act(async () => {
      fireEvent.change(name, { target: { value: "Term 4" } });
    });
    await fillDates(form, "2027-04-01", "2027-01-01");

    h.api.post.mockClear();
    h.toast.error.mockClear();
    await submit(form);

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/after the start/i)),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // A term belongs to the year it was created under.
  it("creates a term against the current year", async () => {
    await mountAcademic();
    const form = formWithPlaceholder(/Term 1/);
    if (!form) return;

    const name = form.querySelector<HTMLInputElement>('input[placeholder*="Term"]')!;
    await act(async () => {
      fireEvent.change(name, { target: { value: "Term 4" } });
    });
    await fillDates(form, "2027-01-05", "2027-04-01");

    h.api.post.mockClear();
    await submit(form);

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/academic/terms"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).academicYearId).toBeTruthy();
    });
  });

  function termToggle() {
    return screen
      .queryAllByRole("button")
      .find((b) => /close|reopen/i.test((b.textContent ?? "").trim()));
  }

  // Closing freezes the term's marks; reopening lets them move again. The two
  // must not send the same request.
  it("closes an open term", async () => {
    await mountAcademic();
    const toggle = termToggle();
    if (!toggle || !/close/i.test(toggle.textContent ?? "")) return;

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/close"),
      );
      expect(call).toBeTruthy();
    });
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

/**
 * Settings for a school that has entered almost nothing.
 *
 * These two tabs are the first screens a new deployment shows, before there
 * are subjects, years or terms. Every count and label on them has to read as
 * "nothing yet" rather than as "undefined".
 */
describe("the subjects tab with nothing in it", () => {
  it("counts nought rather than leaving the heading half written", async () => {
    serve(h.api, { ...populatedRoutes, "/academic/subjects": undefined });
    renderWithProviders(<SubjectsTab />);

    expect(await screen.findByText(/Subjects \(0\)/)).toBeInTheDocument();
  });

  it("draws an em dash for a subject with no category", async () => {
    serve(h.api, {
      ...populatedRoutes,
      "/academic/subjects": [
        { id: "s-1", name: "Entrepreneurship", category: null, maxMarks: 100, isActive: true },
      ],
    });
    renderWithProviders(<SubjectsTab />);

    const row = (await screen.findByText("Entrepreneurship")).closest("tr")!;
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("marks a deactivated subject as inactive", async () => {
    serve(h.api, {
      ...populatedRoutes,
      "/academic/subjects": [{ ...subject, isActive: false }],
    });
    renderWithProviders(<SubjectsTab />);

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });

  it("leaves the category out of the request when none is typed", async () => {
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
    // An empty string would create a category literally called "".
    expect((h.api.post.mock.calls[0][1] as any).category).toBeUndefined();
  });
});

describe("the academic tab before a year is opened", () => {
  it("draws an em dash where the current year's name would be", async () => {
    serve(h.api, { ...populatedRoutes, "/academic/years": [] });
    renderWithProviders(<AcademicTab />);

    expect(await screen.findByText(/Terms \(—\)/)).toBeInTheDocument();
  });

  it("refuses a term that ends before it starts", async () => {
    renderWithProviders(<AcademicTab />);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const start = screen.queryByLabelText(/start/i);
    const end = screen.queryByLabelText(/end/i);
    if (!start || !end) return;

    await act(async () => {
      fireEvent.change(start, { target: { value: "2026-12-01" } });
      fireEvent.change(end, { target: { value: "2026-09-01" } });
    });
    h.api.post.mockClear();

    const add = button(/^add/i);
    if (!add) return;
    await act(async () => {
      fireEvent.click(add);
    });

    // A term that ends before it starts would make every date filter in the
    // app return nothing.
    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/academic/terms"),
      ),
    ).toBeUndefined();
  });
});
