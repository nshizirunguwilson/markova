/**
 * Every chart callback on every page that draws one.
 *
 * A tooltip is decoration, but a tooltip that throws is not: ECharts calls it
 * mid-render and the exception takes the chart with it. These only run on
 * hover, so nothing else in the suite reaches them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    charts: [] as Array<Record<string, unknown>>,
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/components/ui/echart", () => ({
  EChart: (props: { option: Record<string, unknown> }) => {
    h.charts.push(props.option);
    return <div data-testid="chart" />;
  },
}));

import { waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import { findThrowingFormatters } from "@/test/formatters";
import { edgeRoutes, populatedRoutes } from "@/test/fixtures";
import type { User } from "@/stores/auth-store";

import AdminDashboard from "@/app/(dashboard)/admin/page";
import AdminAnalytics from "@/app/(dashboard)/admin/analytics/page";
import TeacherAnalytics from "@/app/(dashboard)/teacher/analytics/page";
import StudentAnalytics from "@/app/(dashboard)/student/analytics/page";
import ParentAnalytics from "@/app/(dashboard)/parent/analytics/page";

interface Case {
  name: string;
  role: User["role"];
  Page: ComponentType<Record<string, never>>;
}

const pages: Case[] = [
  { name: "/admin", role: "ADMIN", Page: AdminDashboard },
  { name: "/admin/analytics", role: "ADMIN", Page: AdminAnalytics },
  { name: "/teacher/analytics", role: "TEACHER", Page: TeacherAnalytics },
  { name: "/student/analytics", role: "STUDENT", Page: StudentAnalytics },
  { name: "/parent/analytics", role: "PARENT", Page: ParentAnalytics },
];

const asUser = { studentId: "student-1", teacherId: "teacher-1" };

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.charts.length = 0;
});

async function draw(Page: Case["Page"], role: User["role"]) {
  renderPage(Page, { role, user: asUser });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
  // Charts appear a tick after the data lands.
  await new Promise((r) => setTimeout(r, 150));
}

describe("on a school that is doing fine", () => {
  it.each(pages)("$name has no formatter that throws", async ({ Page, role }) => {
    serve(h.api, populatedRoutes);
    await draw(Page, role);
    expect(findThrowingFormatters(h.charts)).toEqual([]);
  }, 20000);
});

describe("on a school with problems", () => {
  it.each(pages)("$name has no formatter that throws", async ({ Page, role }) => {
    serve(h.api, edgeRoutes);
    await draw(Page, role);
    expect(findThrowingFormatters(h.charts)).toEqual([]);
  }, 20000);
});

// The first week of a new school: charts drawn from nothing at all.
describe("on a school with no data yet", () => {
  it.each(pages)("$name has no formatter that throws", async ({ Page, role }) => {
    serveAll(h.api, []);
    await draw(Page, role);
    expect(findThrowingFormatters(h.charts)).toEqual([]);
  }, 20000);
});
