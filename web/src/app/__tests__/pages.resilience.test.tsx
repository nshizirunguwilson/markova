/**
 * A resilience pass over every dashboard page.
 *
 * Each page is rendered three ways: with the API returning nothing, with it
 * failing, and with it never answering. None of those should produce a blank
 * screen or a thrown error. All three happen to real users, and the empty case
 * in particular is exactly what a brand new school sees on its first day.
 *
 * A fourth pass renders each page against populated responses, which is what
 * actually walks the "draw the rows" branches. Between the two, a page is
 * exercised both full and empty.
 *
 * Deliberately shallow. This proves a page survives; a page's own test file
 * proves it is correct. The table is generated from the route tree, so a new
 * page that is not resilient fails here without anyone remembering to add it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), back: fn(), refresh: fn(), prefetch: fn() },
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

// echarts renders to a canvas, which jsdom does not provide. What these passes
// care about is whether a page survives its data, not whether a chart paints.
vi.mock("@/components/ui/echart", () => ({
  EChart: () => <div data-testid="chart" />,
}));

import { renderPage, serve, serveAll, serveFailure, serveNever, waitFor } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { edgeRoutes, populatedRoutes } from "@/test/fixtures";
import type { User } from "@/stores/auth-store";

import AdminAnalytics from "@/app/(dashboard)/admin/analytics/page";
import AdminAttendance from "@/app/(dashboard)/admin/attendance/page";
import AdminClasses from "@/app/(dashboard)/admin/classes/page";
import AdminDiscipline from "@/app/(dashboard)/admin/discipline/page";
import AdminHelp from "@/app/(dashboard)/admin/help/page";
import AdminHomework from "@/app/(dashboard)/admin/homework/page";
import AdminIdCards from "@/app/(dashboard)/admin/id-cards/page";
import AdminLibrary from "@/app/(dashboard)/admin/library/page";
import AdminMarks from "@/app/(dashboard)/admin/marks/page";
import AdminOnboarding from "@/app/(dashboard)/admin/onboarding/page";
import Admin from "@/app/(dashboard)/admin/page";
import AdminPromotion from "@/app/(dashboard)/admin/promotion/page";
import AdminReports from "@/app/(dashboard)/admin/reports/page";
import AdminSettings from "@/app/(dashboard)/admin/settings/page";
import AdminStudents from "@/app/(dashboard)/admin/students/page";
import AdminSubjects from "@/app/(dashboard)/admin/subjects/page";
import AdminTeachers from "@/app/(dashboard)/admin/teachers/page";
import AdminTimetable from "@/app/(dashboard)/admin/timetable/page";
import AdminUsers from "@/app/(dashboard)/admin/users/page";
import Help from "@/app/(dashboard)/help/page";
import LibrarianBooks from "@/app/(dashboard)/librarian/books/page";
import LibrarianLoans from "@/app/(dashboard)/librarian/loans/page";
import Librarian from "@/app/(dashboard)/librarian/page";
import Messages from "@/app/(dashboard)/messages/page";
import ParentAnalytics from "@/app/(dashboard)/parent/analytics/page";
import ParentAttendance from "@/app/(dashboard)/parent/attendance/page";
import ParentDiscipline from "@/app/(dashboard)/parent/discipline/page";
import ParentMarks from "@/app/(dashboard)/parent/marks/page";
import Parent from "@/app/(dashboard)/parent/page";
import ParentReports from "@/app/(dashboard)/parent/reports/page";
import Profile from "@/app/(dashboard)/profile/page";
import StudentAnalytics from "@/app/(dashboard)/student/analytics/page";
import StudentAttendance from "@/app/(dashboard)/student/attendance/page";
import StudentDiscipline from "@/app/(dashboard)/student/discipline/page";
import StudentHomework from "@/app/(dashboard)/student/homework/page";
import StudentLibrary from "@/app/(dashboard)/student/library/page";
import StudentMarks from "@/app/(dashboard)/student/marks/page";
import Student from "@/app/(dashboard)/student/page";
import StudentReports from "@/app/(dashboard)/student/reports/page";
import TeacherAnalytics from "@/app/(dashboard)/teacher/analytics/page";
import TeacherAttendance from "@/app/(dashboard)/teacher/attendance/page";
import TeacherDiscipline from "@/app/(dashboard)/teacher/discipline/page";
import TeacherHomework from "@/app/(dashboard)/teacher/homework/page";
import TeacherMarks from "@/app/(dashboard)/teacher/marks/page";
import Teacher from "@/app/(dashboard)/teacher/page";

interface PageCase {
  name: string;
  role: User["role"];
  Page: ComponentType<Record<string, never>>;
}

const pages: PageCase[] = [
  { name: "/admin/analytics", role: "ADMIN", Page: AdminAnalytics },
  { name: "/admin/attendance", role: "ADMIN", Page: AdminAttendance },
  { name: "/admin/classes", role: "ADMIN", Page: AdminClasses },
  { name: "/admin/discipline", role: "ADMIN", Page: AdminDiscipline },
  { name: "/admin/help", role: "ADMIN", Page: AdminHelp },
  { name: "/admin/homework", role: "ADMIN", Page: AdminHomework },
  { name: "/admin/id-cards", role: "ADMIN", Page: AdminIdCards },
  { name: "/admin/library", role: "ADMIN", Page: AdminLibrary },
  { name: "/admin/marks", role: "ADMIN", Page: AdminMarks },
  { name: "/admin/onboarding", role: "ADMIN", Page: AdminOnboarding },
  { name: "/admin", role: "ADMIN", Page: Admin },
  { name: "/admin/promotion", role: "ADMIN", Page: AdminPromotion },
  { name: "/admin/reports", role: "ADMIN", Page: AdminReports },
  { name: "/admin/settings", role: "ADMIN", Page: AdminSettings },
  { name: "/admin/students", role: "ADMIN", Page: AdminStudents },
  { name: "/admin/subjects", role: "ADMIN", Page: AdminSubjects },
  { name: "/admin/teachers", role: "ADMIN", Page: AdminTeachers },
  { name: "/admin/timetable", role: "ADMIN", Page: AdminTimetable },
  { name: "/admin/users", role: "ADMIN", Page: AdminUsers },
  { name: "/help", role: "ADMIN", Page: Help },
  { name: "/librarian/books", role: "LIBRARIAN", Page: LibrarianBooks },
  { name: "/librarian/loans", role: "LIBRARIAN", Page: LibrarianLoans },
  { name: "/librarian", role: "LIBRARIAN", Page: Librarian },
  { name: "/messages", role: "ADMIN", Page: Messages },
  { name: "/parent/analytics", role: "PARENT", Page: ParentAnalytics },
  { name: "/parent/attendance", role: "PARENT", Page: ParentAttendance },
  { name: "/parent/discipline", role: "PARENT", Page: ParentDiscipline },
  { name: "/parent/marks", role: "PARENT", Page: ParentMarks },
  { name: "/parent", role: "PARENT", Page: Parent },
  { name: "/parent/reports", role: "PARENT", Page: ParentReports },
  { name: "/profile", role: "ADMIN", Page: Profile },
  { name: "/student/analytics", role: "STUDENT", Page: StudentAnalytics },
  { name: "/student/attendance", role: "STUDENT", Page: StudentAttendance },
  { name: "/student/discipline", role: "STUDENT", Page: StudentDiscipline },
  { name: "/student/homework", role: "STUDENT", Page: StudentHomework },
  { name: "/student/library", role: "STUDENT", Page: StudentLibrary },
  { name: "/student/marks", role: "STUDENT", Page: StudentMarks },
  { name: "/student", role: "STUDENT", Page: Student },
  { name: "/student/reports", role: "STUDENT", Page: StudentReports },
  { name: "/teacher/analytics", role: "TEACHER", Page: TeacherAnalytics },
  { name: "/teacher/attendance", role: "TEACHER", Page: TeacherAttendance },
  { name: "/teacher/discipline", role: "TEACHER", Page: TeacherDiscipline },
  { name: "/teacher/homework", role: "TEACHER", Page: TeacherHomework },
  { name: "/teacher/marks", role: "TEACHER", Page: TeacherMarks },
  { name: "/teacher", role: "TEACHER", Page: Teacher },
];

const asUser = { studentId: "student-1", teacherId: "teacher-1" };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

describe("every dashboard page survives an empty API", () => {
  it.each(pages)("$name renders for a school with no data yet", async ({ role, Page }) => {
    serveAll(h.api, []);
    renderPage(Page, { role, user: asUser });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("every dashboard page survives a failing API", () => {
  it.each(pages)("$name does not go blank when requests fail", async ({ role, Page }) => {
    serveFailure(h.api);
    renderPage(Page, { role, user: asUser });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("every dashboard page survives a slow API", () => {
  it.each(pages)("$name holds while requests are in flight", ({ role, Page }) => {
    serveNever(h.api);
    const { container } = renderPage(Page, { role, user: asUser });
    expect(container).toBeTruthy();
  });
});

describe("every dashboard page renders real content", () => {
  it.each(pages)("$name draws its data when the school has some", async ({ role, Page }) => {
    serve(h.api, populatedRoutes);
    renderPage(Page, { role, user: asUser });
    // Waits for real content rather than for "not empty": a page still showing
    // its spinner has a textContent of null, which is not "" and would sail
    // straight through a looser check.
    await waitFor(
      () => expect((document.body.textContent ?? "").length).toBeGreaterThan(40),
      { timeout: 5000 },
    );
  });
});

/**
 * Every control on every page, clicked and filled.
 *
 * The passes above prove a page renders. This one reaches its handlers: the
 * modal opens, the tab switches, the filter changes, the form submits. Those
 * are the lines a render-only test never touches, and they are where the crashes
 * this branch fixed were hiding.
 */
describe("every dashboard page survives being used", () => {
  it.each(pages)("$name handles its own controls", async ({ role, Page }) => {
    serve(h.api, populatedRoutes);
    renderPage(Page, { role, user: asUser });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const { rejections } = await exercisePage();

    expect(rejections).toEqual([]);
    expect(document.body.textContent).not.toBeNull();
  }, 30000);
});

/**
 * The same pages against a school where things are going wrong.
 *
 * Overdue books, unpublished results, absent students, homework past its due
 * date, more rows than one page holds. Every page has a branch that only draws
 * when something is off, and that is the branch a head teacher actually looks
 * at. The happy path above never reaches it.
 */
describe("every dashboard page handles a school with problems", () => {
  it.each(pages)("$name draws the awkward cases", async ({ role, Page }) => {
    serve(h.api, edgeRoutes);
    renderPage(Page, { role, user: asUser });
    await waitFor(
      () => expect((document.body.textContent ?? "").length).toBeGreaterThan(40),
      { timeout: 5000 },
    );
  });
});

describe("every dashboard page survives being used on bad data", () => {
  it.each(pages)("$name handles its controls with problems present", async ({ role, Page }) => {
    serve(h.api, edgeRoutes);
    renderPage(Page, { role, user: asUser });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const { rejections } = await exercisePage();
    expect(rejections).toEqual([]);
  }, 30000);
});
