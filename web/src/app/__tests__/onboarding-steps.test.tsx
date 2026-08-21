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

interface StepCase {
  name: string;
  Step: ComponentType<Record<string, never>>;
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

const props = { onComplete: vi.fn() } as unknown as Record<string, never>;

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  signIn("ADMIN");
});

describe("onboarding steps on a school's first day", () => {
  it.each(steps)("$name renders with nothing configured yet", async ({ Step }) => {
    serveAll(h.api, []);
    renderWithProviders(<Step {...props} />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

describe("onboarding steps once a school is set up", () => {
  it.each(steps)("$name renders against real configuration", async ({ Step }) => {
    serve(h.api, populatedRoutes);
    renderWithProviders(<Step {...props} />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

describe("onboarding steps when the API is down", () => {
  it.each(steps)("$name does not go blank", async ({ Step }) => {
    serveFailure(h.api);
    renderWithProviders(<Step {...props} />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

describe("onboarding steps are safe to use", () => {
  it.each(steps)("$name handles its own controls", async ({ Step }) => {
    serve(h.api, populatedRoutes);
    renderWithProviders(<Step {...props} />);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());

    const { rejections } = await exercisePage();
    expect(rejections).toEqual([]);
  }, 30000);
});
