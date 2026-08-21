import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/settings",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";

/**
 * The "Add class level" submit, not one of the per-level "Add section" buttons.
 * Both carry the accessible name "Add", so the form's submit is found through
 * the field it belongs to rather than by name alone.
 */
function addLevelButton() {
  const form = screen.getByLabelText(/^name$/i).closest("form");
  return form!.querySelector('button[type="submit"]') as HTMLButtonElement;
}
import { renderWithProviders, signIn } from "@/test/harness";
import { serve, serveAll, serveFailure } from "@/test/page";
import { classLevel, subject, trade, academicYear, term } from "@/test/fixtures";

import { ClassesTab } from "./classes-tab";
import { SubjectsTab } from "./subjects-tab";
import { AcademicTab } from "./academic-tab";
import { DataExportTab } from "./data-export-tab";
import { GeneralTab } from "./general-tab";
import { SystemTab } from "./system-tab";

const routes = {
  "/academic/class-levels": [classLevel],
  "/academic/trades": [trade],
  "/academic/subjects": [subject],
  "/academic/years": [academicYear],
  "/academic/terms": [term],
  "/academic/sections": [],
  "/academic/assessment-types": [],
  "/school-config": { schoolName: "Groupe Scolaire Kigali", primaryColor: "#1B4F72" },
};

const tabs = [
  { name: "ClassesTab", Tab: ClassesTab },
  { name: "SubjectsTab", Tab: SubjectsTab },
  { name: "AcademicTab", Tab: AcademicTab },
  { name: "DataExportTab", Tab: DataExportTab },
  { name: "GeneralTab", Tab: GeneralTab },
  { name: "SystemTab", Tab: SystemTab },
];

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  signIn("ADMIN");
});

describe("every settings tab", () => {
  it.each(tabs)("$name renders against a configured school", async ({ Tab }) => {
    serve(h.api, routes);
    renderWithProviders(<Tab />);
    await waitFor(() => expect(document.body.textContent?.length ?? 0).toBeGreaterThan(20));
  });

  it.each(tabs)("$name renders for a school with nothing set up", async ({ Tab }) => {
    serveAll(h.api, []);
    renderWithProviders(<Tab />);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it.each(tabs)("$name survives a failing API", async ({ Tab }) => {
    serveFailure(h.api);
    renderWithProviders(<Tab />);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("ClassesTab", () => {
  it("lists the levels the school has", async () => {
    serve(h.api, routes);
    renderWithProviders(<ClassesTab />);
    await waitFor(() => expect(screen.getByText(/Senior 1/)).toBeInTheDocument());
  });

  // Creating a level with no name would post an empty record.
  it("does not create a level without a name", async () => {
    serve(h.api, routes);
    renderWithProviders(<ClassesTab />);
    await waitFor(() => expect(screen.getByText(/Senior 1/)).toBeInTheDocument());
    h.api.post.mockClear();

    await userEvent.setup().click(addLevelButton());
    await waitFor(() =>
      expect(screen.getByText(/needs a name/i)).toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("creates a level once it has a name", async () => {
    serve(h.api, routes);
    renderWithProviders(<ClassesTab />);
    await waitFor(() => expect(screen.getByText(/Senior 1/)).toBeInTheDocument());
    h.api.post.mockClear();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^name$/i), "Senior 4");
    await user.click(addLevelButton());

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(h.api.post.mock.calls[0][1]).toMatchObject({ name: "Senior 4" });
  });

  // Whitespace only is the same mistake wearing a disguise.
  it("refuses a name that is only whitespace", async () => {
    serve(h.api, routes);
    renderWithProviders(<ClassesTab />);
    await waitFor(() => expect(screen.getByText(/Senior 1/)).toBeInTheDocument());
    h.api.post.mockClear();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^name$/i), "   ");
    await user.click(addLevelButton());

    await waitFor(() =>
      expect(screen.getByText(/needs a name/i)).toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

describe("SubjectsTab", () => {
  it("lists the subjects the school teaches", async () => {
    serve(h.api, routes);
    renderWithProviders(<SubjectsTab />);
    await waitFor(() => expect(screen.getByText(/Mathematics/)).toBeInTheDocument());
  });
});
