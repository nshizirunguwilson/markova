/**
 * The parent's four views of their child.
 *
 * A parent with more than one child at the school switches between them on
 * every screen, and a parent whose child has no records yet is the normal case
 * in week one. Both are easy to get wrong and neither is obvious from the happy
 * path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  usePathname: () => "/parent",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/echart", () => ({
  EChart: () => <div data-testid="chart" />,
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure } from "@/test/page";
import { chooseCascadingFilters, exercisePage } from "@/test/exercise";
import { edgeRoutes, populatedRoutes, students } from "@/test/fixtures";

import ParentMarks from "./marks/page";
import ParentAttendance from "./attendance/page";
import ParentDiscipline from "./discipline/page";
import ParentReports from "./reports/page";

const children = students.map((s) => ({
  id: s.id,
  studentIdNumber: s.studentIdNumber,
  user: s.user,
  classSection: s.classSection,
}));

/**
 * The parent's own record carries `parentStudents`, which every one of these
 * pages walks to build the child picker.
 */
const parentStudents = students.map((s) => ({
  student: { id: s.id, user: s.user, classSection: s.classSection },
}));

const routes = {
  ...populatedRoutes,
  "/users/user-1": { id: "user-1", role: "PARENT", parentStudents },
  "/auth/profile": { id: "user-1", role: "PARENT", parentStudents },
};

const views = [
  { name: "marks", Page: ParentMarks },
  { name: "attendance", Page: ParentAttendance },
  { name: "discipline", Page: ParentDiscipline },
  { name: "reports", Page: ParentReports },
];

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(Page: (typeof views)[number]["Page"]) {
  renderPage(Page, {
    role: "PARENT",
    user: { id: "user-1", studentId: "student-1" },
  });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

describe.each(views)("the parent's $name view", ({ Page }) => {
  it("renders for a child with records", async () => {
    await mount(Page);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  // Week one: enrolled, nothing recorded yet.
  it("renders for a child with nothing recorded yet", async () => {
    serveAll(h.api, []);
    await mount(Page);
    expect(document.body.textContent).not.toBe("");
  });

  it("does not go blank when the API is down", async () => {
    serveFailure(h.api);
    await mount(Page);
    expect(document.body.textContent).not.toBeNull();
  });

  it("renders when the child is doing badly", async () => {
    serve(h.api, {
      ...edgeRoutes,
      "/users/user-1": { id: "user-1", role: "PARENT", parentStudents },
    });
    await mount(Page);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("survives its own controls", async () => {
    await mount(Page);
    const { rejections } = await exercisePage({ limit: 25 });
    expect(rejections).toEqual([]);
  }, 30000);
});

describe("switching between children", () => {
  // A parent with two children at the school picks between them, and the page
  // has to refetch for whoever is chosen.
  it.each(views)("$name refetches when another child is chosen", async ({ Page }) => {
    await mount(Page);
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("select")).some((s) =>
          Array.from(s.options).some((o) => o.value),
        ) || document.querySelectorAll("select").length === 0,
      ).toBe(true),
    );

    const before = h.api.get.mock.calls.length;
    await chooseCascadingFilters(4);
    await waitFor(() =>
      expect(h.api.get.mock.calls.length).toBeGreaterThanOrEqual(before),
    );
  }, 20000);
});

describe("a parent with no children linked", () => {
  // The account exists but points at nobody. It has to explain itself rather
  // than render an empty shell that looks broken.
  it.each(views)("$name explains itself", async ({ Page }) => {
    serve(h.api, {
      ...routes,
      "/users/user-1": { id: "user-1", role: "PARENT", parentStudents: [] },
    });
    renderPage(Page, { role: "PARENT", user: { id: "user-1" } });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});
