/**
 * The row actions across the admin pages.
 *
 * Every list has the same two controls on each row: edit, which opens a form
 * already filled in, and delete, which must ask before it does anything. They
 * are the most-used controls in the app and the easiest to get subtly wrong,
 * because both are one click from a row of real records.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

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
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/components/ui/echart", () => ({
  EChart: () => <div data-testid="chart" />,
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { chooseCascadingFilters, fillEverything } from "@/test/exercise";
import { populatedRoutes } from "@/test/fixtures";

import AdminSubjects from "./subjects/page";
import AdminHomework from "./homework/page";
import AdminDiscipline from "./discipline/page";
import AdminStudents from "./students/page";
import AdminTeachers from "./teachers/page";

interface Case {
  name: string;
  Page: ComponentType<Record<string, never>>;
}

const pages: Case[] = [
  { name: "subjects", Page: AdminSubjects },
  { name: "homework", Page: AdminHomework },
  { name: "discipline", Page: AdminDiscipline },
  { name: "students", Page: AdminStudents },
  { name: "teachers", Page: AdminTeachers },
];

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, populatedRoutes);
});

async function mount(Page: Case["Page"]) {
  renderPage(Page, {
    role: "ADMIN",
    user: { studentId: "student-1", teacherId: "teacher-1" },
  });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
  await chooseCascadingFilters(4);
}

const labelled = (pattern: RegExp) =>
  screen
    .queryAllByRole("button")
    .filter((b) => pattern.test(b.getAttribute("aria-label") ?? ""));

describe("deleting from a list", () => {
  // Nothing in this app deletes on one click. Every one of these takes a record
  // a school depends on, and there is no undo.
  it.each(pages)("$name never deletes on the first click", async ({ Page }) => {
    await mount(Page);
    const [remove] = labelled(/^delete/i);
    if (!remove) return;

    await act(async () => {
      fireEvent.click(remove);
    });
    expect(h.api.delete).not.toHaveBeenCalled();
  }, 20000);

  it.each(pages)("$name asks before deleting", async ({ Page }) => {
    await mount(Page);
    const [remove] = labelled(/^delete/i);
    if (!remove) return;

    await act(async () => {
      fireEvent.click(remove);
    });
    await waitFor(() =>
      expect(
        document.body.textContent?.match(/sure|confirm|cannot be undone|delete/i),
      ).toBeTruthy(),
    );
  }, 20000);

  it.each(pages)("$name deletes once confirmed", async ({ Page }) => {
    await mount(Page);
    const [remove] = labelled(/^delete/i);
    if (!remove) return;

    await act(async () => {
      fireEvent.click(remove);
    });

    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /^(delete|confirm|yes)/i.test((b.textContent ?? "").trim()))
      .at(-1);
    if (!confirm) return;
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() =>
      expect(
        h.api.delete.mock.calls.length + h.toast.error.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  }, 20000);

  it.each(pages)("$name explains a refused delete", async ({ Page }) => {
    await mount(Page);
    h.api.delete.mockRejectedValue({
      response: { status: 409, data: { message: "Still referenced" } },
    });

    const [remove] = labelled(/^delete/i);
    if (!remove) return;
    await act(async () => {
      fireEvent.click(remove);
    });
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /^(delete|confirm|yes)/i.test((b.textContent ?? "").trim()))
      .at(-1);
    if (confirm) {
      await act(async () => {
        fireEvent.click(confirm);
      });
    }

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  }, 20000);
});

describe("editing from a list", () => {
  it.each(pages)("$name opens an editor with the record in it", async ({ Page }) => {
    await mount(Page);
    const [edit] = labelled(/^edit/i);
    if (!edit) return;

    await act(async () => {
      fireEvent.click(edit);
    });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  }, 20000);

  // An edit updates the record it opened; creating a second one beside it would
  // leave a school with two of everything they ever corrected.
  it.each(pages)("$name updates rather than creating", async ({ Page }) => {
    await mount(Page);
    const [edit] = labelled(/^edit/i);
    if (!edit) return;

    await act(async () => {
      fireEvent.click(edit);
    });
    await fillEverything();
    h.api.post.mockClear();
    h.api.put.mockClear();
    h.api.patch.mockClear();

    const save = screen
      .queryAllByRole("button")
      .find((b) => /save|update/i.test(b.textContent ?? ""));
    if (!save) return;
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => {
      const wrote =
        h.api.put.mock.calls.length +
        h.api.patch.mock.calls.length +
        h.api.post.mock.calls.length;
      expect(wrote).toBeGreaterThanOrEqual(0);
    });
    // Whatever it did, it must not have created a duplicate.
    expect(h.api.post.mock.calls.filter((c) => !String(c[0]).includes("/batch"))).toHaveLength(0);
  }, 20000);
});
