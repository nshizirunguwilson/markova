/**
 * The pages that hang off a record id.
 *
 * These are excluded from the route-tree pass because they need params, but
 * they are also where the most detailed forms in the app live: one person's
 * whole record, editable field by field.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    params: { current: {} as Record<string, string> },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/users/user-1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => h.params.current,
}));
vi.mock("@/components/ui/echart", () => ({
  EChart: () => <div data-testid="chart" />,
}));

import { render } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure, waitFor } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { populatedRoutes, students, teachers } from "@/test/fixtures";

import UserDetailPage from "@/app/(dashboard)/admin/users/[id]/page";
import StudentDetailPage from "@/app/(dashboard)/admin/students/[id]/page";
import VerifyPage from "@/app/verify/[code]/page";

const fullUser = {
  ...students[0].user,
  role: "STUDENT",
  isActive: true,
  gender: "FEMALE",
  dateOfBirth: "2010-04-11",
  nationalId: "1201080012345678",
  student: {
    id: "student-1",
    studentIdNumber: "STD-2026-001",
    status: "ACTIVE",
    classSectionId: "section-1",
    boarding: "DAY",
    disability: "NONE",
    bloodType: "O+",
  },
  teacher: null,
};

const routes = {
  ...populatedRoutes,
  "/users/user-1": fullUser,
  "/users/u-1": fullUser,
  "/verify": { valid: true, student: students[0], term: "Term 1", average: 82.4 },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.params.current = { id: "user-1", code: "123456789012" };
});

const pages = [
  { name: "admin user detail", Page: UserDetailPage, role: "ADMIN" as const },
  { name: "admin student detail", Page: StudentDetailPage, role: "ADMIN" as const },
];

describe("record pages", () => {
  it.each(pages)("$name renders the record", async ({ Page, role }) => {
    serve(h.api, routes);
    renderPage(Page, { role });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });

  it.each(pages)("$name survives a record that is not there", async ({ Page, role }) => {
    serveFailure(h.api, 404);
    renderPage(Page, { role });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });

  it.each(pages)("$name survives an empty response", async ({ Page, role }) => {
    serveAll(h.api, []);
    renderPage(Page, { role });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });

  it.each(pages)("$name handles its own controls", async ({ Page, role }) => {
    serve(h.api, routes);
    renderPage(Page, { role });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
    const { rejections } = await exercisePage();
    expect(rejections).toEqual([]);
  }, 30000);
});

// The public report verification page. Anyone holding a printed report card can
// reach it, signed in or not, so it has to hold up on its own.
//
// It is an async server component: it takes a params promise and fetches with
// the global fetch rather than the axios client, so it is awaited into an
// element instead of being rendered like a client page.
describe("public report verification", () => {
  const renderVerify = async (code: string) => {
    const element = await VerifyPage({ params: Promise.resolve({ code }) });
    return render(element);
  };

  it("shows a verified report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ valid: true, student: students[0], termName: "Term 1" }),
      })),
    );
    await renderVerify("123456789012");
    expect(document.body.textContent).not.toBe("");
    vi.unstubAllGlobals();
  });

  it("says so when the code is not recognised", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => null })));
    await renderVerify("000000000000");
    expect(document.body.textContent).not.toBe("");
    vi.unstubAllGlobals();
  });

  it("does not crash when the lookup throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await renderVerify("000000000000");
    expect(document.body.textContent).not.toBe("");
    vi.unstubAllGlobals();
  });
});
