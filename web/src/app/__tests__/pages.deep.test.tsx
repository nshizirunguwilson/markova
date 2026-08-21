/**
 * A deeper pass over the pages that carry the most interaction.
 *
 * The route-tree passes render each page and click what is on screen. These
 * pages hide most of their behaviour behind a filter bar, a modal, or a write
 * that has to succeed first, so they get the fuller treatment: choose the
 * filters, open what opens, fill it, submit it, and do it all again with the
 * API refusing every write.
 *
 * Kept as one table rather than a file each, because the routine is identical
 * and only the page under it changes.
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
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
}));
vi.mock("@/components/ui/echart", () => ({
  EChart: () => <div data-testid="chart" />,
}));

import { renderPage, serve, waitFor } from "@/test/page";
import { chooseCascadingFilters, exercisePage } from "@/test/exercise";
import { edgeRoutes, populatedRoutes } from "@/test/fixtures";
import type { User } from "@/stores/auth-store";

import AdminMarks from "@/app/(dashboard)/admin/marks/page";
import AdminHelp from "@/app/(dashboard)/admin/help/page";
import AdminPromotion from "@/app/(dashboard)/admin/promotion/page";
import AdminHomework from "@/app/(dashboard)/admin/homework/page";
import AdminStudents from "@/app/(dashboard)/admin/students/page";
import AdminTeachers from "@/app/(dashboard)/admin/teachers/page";
import AdminSubjects from "@/app/(dashboard)/admin/subjects/page";
import AdminIdCards from "@/app/(dashboard)/admin/id-cards/page";
import AdminAttendance from "@/app/(dashboard)/admin/attendance/page";
import AdminDiscipline from "@/app/(dashboard)/admin/discipline/page";
import AdminOnboarding from "@/app/(dashboard)/admin/onboarding/page";
import LibrarianBooks from "@/app/(dashboard)/librarian/books/page";
import LibrarianLoans from "@/app/(dashboard)/librarian/loans/page";
import TeacherAttendance from "@/app/(dashboard)/teacher/attendance/page";
import TeacherHomework from "@/app/(dashboard)/teacher/homework/page";
import TeacherDiscipline from "@/app/(dashboard)/teacher/discipline/page";
import StudentReports from "@/app/(dashboard)/student/reports/page";
import StudentLibrary from "@/app/(dashboard)/student/library/page";
import StudentHomework from "@/app/(dashboard)/student/homework/page";
import ParentAttendance from "@/app/(dashboard)/parent/attendance/page";
import ParentMarks from "@/app/(dashboard)/parent/marks/page";
import ParentReports from "@/app/(dashboard)/parent/reports/page";
import Profile from "@/app/(dashboard)/profile/page";
import Help from "@/app/(dashboard)/help/page";

interface Case {
  name: string;
  role: User["role"];
  Page: ComponentType<Record<string, never>>;
}

const pages: Case[] = [
  { name: "/admin/marks", role: "ADMIN", Page: AdminMarks },
  { name: "/admin/help", role: "ADMIN", Page: AdminHelp },
  { name: "/admin/promotion", role: "ADMIN", Page: AdminPromotion },
  { name: "/admin/homework", role: "ADMIN", Page: AdminHomework },
  { name: "/admin/students", role: "ADMIN", Page: AdminStudents },
  { name: "/admin/teachers", role: "ADMIN", Page: AdminTeachers },
  { name: "/admin/subjects", role: "ADMIN", Page: AdminSubjects },
  { name: "/admin/id-cards", role: "ADMIN", Page: AdminIdCards },
  { name: "/admin/attendance", role: "ADMIN", Page: AdminAttendance },
  { name: "/admin/discipline", role: "ADMIN", Page: AdminDiscipline },
  { name: "/admin/onboarding", role: "ADMIN", Page: AdminOnboarding },
  { name: "/librarian/books", role: "LIBRARIAN", Page: LibrarianBooks },
  { name: "/librarian/loans", role: "LIBRARIAN", Page: LibrarianLoans },
  { name: "/teacher/attendance", role: "TEACHER", Page: TeacherAttendance },
  { name: "/teacher/homework", role: "TEACHER", Page: TeacherHomework },
  { name: "/teacher/discipline", role: "TEACHER", Page: TeacherDiscipline },
  { name: "/student/reports", role: "STUDENT", Page: StudentReports },
  { name: "/student/library", role: "STUDENT", Page: StudentLibrary },
  { name: "/student/homework", role: "STUDENT", Page: StudentHomework },
  { name: "/parent/attendance", role: "PARENT", Page: ParentAttendance },
  { name: "/parent/marks", role: "PARENT", Page: ParentMarks },
  { name: "/parent/reports", role: "PARENT", Page: ParentReports },
  { name: "/profile", role: "ADMIN", Page: Profile },
  { name: "/help", role: "ADMIN", Page: Help },
];

const asUser = { studentId: "student-1", teacherId: "teacher-1" };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

async function mount(Page: Case["Page"], role: User["role"]) {
  renderPage(Page, { role, user: asUser });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

describe("choosing filters reveals the rest of the page", () => {
  it.each(pages)("$name opens up once its filters are set", async ({ role, Page }) => {
    serve(h.api, populatedRoutes);
    await mount(Page, role);
    await chooseCascadingFilters(6);
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  }, 20000);
});

describe("every control, on a school that is doing fine", () => {
  it.each(pages)("$name stays safe to use", async ({ role, Page }) => {
    serve(h.api, populatedRoutes);
    await mount(Page, role);
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});

describe("every control, on a school with problems", () => {
  it.each(pages)("$name stays safe to use", async ({ role, Page }) => {
    serve(h.api, edgeRoutes);
    await mount(Page, role);
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});

// A refused write is the common case on a school connection, and the page has
// to stay usable so the work can be retried rather than retyped.
describe("every control, when the API refuses every write", () => {
  it.each(pages)("$name stays safe to use", async ({ role, Page }) => {
    serve(h.api, populatedRoutes);
    await mount(Page, role);
    for (const method of ["post", "put", "patch", "delete"] as const) {
      h.api[method].mockRejectedValue({
        response: { status: 500, data: { message: "Refused" } },
      });
    }
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});
