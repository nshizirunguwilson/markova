/**
 * The onboarding wizard's steps.
 *
 * These are what a school sees on its very first day, before any data exists,
 * which makes the empty case the normal case rather than the edge one. They sit
 * behind the wizard's own state so the page-level passes never reach them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/onboarding",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve, serveAll, serveFailure, waitFor } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { populatedRoutes } from "@/test/fixtures";

import { StepAcademicYear } from "@/app/(dashboard)/admin/onboarding/steps/step-academic-year";
import { StepAssignTeachers } from "@/app/(dashboard)/admin/onboarding/steps/step-assign-teachers";
import { StepBranding } from "@/app/(dashboard)/admin/onboarding/steps/step-branding";
import { StepClasses } from "@/app/(dashboard)/admin/onboarding/steps/step-classes";
import { StepImportStudents } from "@/app/(dashboard)/admin/onboarding/steps/step-import-students";
import { StepImportTeachers } from "@/app/(dashboard)/admin/onboarding/steps/step-import-teachers";
import { StepReview } from "@/app/(dashboard)/admin/onboarding/steps/step-review";
import { StepSchoolInfo } from "@/app/(dashboard)/admin/onboarding/steps/step-school-info";
import { StepSubjects } from "@/app/(dashboard)/admin/onboarding/steps/step-subjects";
import { StepTerms } from "@/app/(dashboard)/admin/onboarding/steps/step-terms";

/**
 * Some steps take an `onComplete`; most take nothing. Typing the table as
 * "component that accepts the props we hand it" keeps both in one list without
 * pretending either shape is the other.
 */
interface StepProps {
  onComplete: () => void;
}

interface StepCase {
  name: string;
  Step: ComponentType<StepProps> | ComponentType<Record<string, never>>;
  needsProps?: boolean;
}

const steps: StepCase[] = [
  { name: "StepAcademicYear", Step: StepAcademicYear },
  { name: "StepAssignTeachers", Step: StepAssignTeachers },
  { name: "StepBranding", Step: StepBranding },
  { name: "StepClasses", Step: StepClasses },
  { name: "StepImportStudents", Step: StepImportStudents },
  { name: "StepImportTeachers", Step: StepImportTeachers },
  { name: "StepReview", Step: StepReview, needsProps: true },
  { name: "StepSchoolInfo", Step: StepSchoolInfo },
  { name: "StepSubjects", Step: StepSubjects },
  { name: "StepTerms", Step: StepTerms },
];

const props: StepProps = { onComplete: vi.fn() };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  signIn("ADMIN");
});

/** Every step accepts the props below; the ones that ignore them are fine. */
type AnyStep = ComponentType<StepProps>;

describe("onboarding steps on a school's first day", () => {
  it.each(steps)("$name renders with nothing configured yet", async ({ Step }) => {
    serveAll(h.api, []);
    const S = Step as AnyStep;
    renderWithProviders(<S {...props} />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

describe("onboarding steps once a school is set up", () => {
  it.each(steps)("$name renders against real configuration", async ({ Step }) => {
    serve(h.api, populatedRoutes);
    const S = Step as AnyStep;
    renderWithProviders(<S {...props} />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

describe("onboarding steps when the API is down", () => {
  it.each(steps)("$name does not go blank", async ({ Step }) => {
    serveFailure(h.api);
    const S = Step as AnyStep;
    renderWithProviders(<S {...props} />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

describe("onboarding steps are safe to use", () => {
  it.each(steps)("$name handles its own controls", async ({ Step }) => {
    serve(h.api, populatedRoutes);
    const S = Step as AnyStep;
    renderWithProviders(<S {...props} />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());

    const { rejections } = await exercisePage();
    expect(rejections).toEqual([]);
  }, 30000);
});

/**
 * Adding a section on the classes step.
 *
 * This is the one step where the school types something and presses Enter
 * rather than submitting a form, and it is the only place in the wizard that
 * can send a request with an empty name attached to a real class level.
 */
describe("the classes step in use", () => {
  async function mountClasses() {
    serve(h.api, populatedRoutes);
    renderWithProviders(<StepClasses />);
    await waitFor(() =>
      expect(screen.getByLabelText(/section name/i)).toBeInTheDocument(),
    );
  }

  it("shows the levels the school already has", async () => {
    await mountClasses();
    expect(screen.getByText("Senior 1")).toBeInTheDocument();
  });

  it("sends nothing when the box is empty", async () => {
    await mountClasses();
    h.api.post.mockClear();

    await act(async () => {
      fireEvent.click(screen.getAllByLabelText("Add")[0]);
    });

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/academic/sections"),
      ),
    ).toBeUndefined();
  });

  it("sends nothing for a name that is only spaces", async () => {
    await mountClasses();
    await act(async () => {
      fireEvent.change(screen.getAllByLabelText(/section name/i)[0], {
        target: { value: "   " },
      });
    });
    h.api.post.mockClear();

    await act(async () => {
      fireEvent.click(screen.getAllByLabelText("Add")[0]);
    });

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/academic/sections"),
      ),
    ).toBeUndefined();
  });

  it("adds the section when Enter is pressed in the box", async () => {
    await mountClasses();
    const box = screen.getAllByLabelText(/section name/i)[0];
    await act(async () => {
      fireEvent.change(box, { target: { value: "C" } });
    });
    h.api.post.mockClear();

    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/academic/sections"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).name).toBe("C");
    });
  });

  it("ignores every other key", async () => {
    await mountClasses();
    const box = screen.getAllByLabelText(/section name/i)[0];
    await act(async () => {
      fireEvent.change(box, { target: { value: "C" } });
    });
    h.api.post.mockClear();

    await act(async () => {
      fireEvent.keyDown(box, { key: "Escape" });
    });

    expect(h.api.post).not.toHaveBeenCalled();
  });
});
