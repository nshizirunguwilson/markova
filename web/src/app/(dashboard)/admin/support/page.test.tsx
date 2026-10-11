import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    exportData: vi.fn(),
  };
});
vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/export", () => ({ exportData: h.exportData }));
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: <T,>(v: T) => v }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/support",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import SupportPlansPage from "./page";

const register = [
  {
    studentId: "s1",
    userId: "u1",
    name: "Keza Habimana",
    studentIdNumber: "STD-2025-0001",
    class: "Senior 4 A",
    needs: ["Seeing"],
    arrangements: ["25% extra time", "Large print"],
    reviewOn: "2020-01-01T00:00:00.000Z",
  },
  {
    studentId: "s2",
    userId: "u2",
    name: "Eric Mugisha",
    studentIdNumber: "STD-2025-0002",
    class: "Senior 4 B",
    needs: ["Hearing"],
    arrangements: [],
    reviewOn: "2099-01-01T00:00:00.000Z",
  },
  {
    studentId: "s3",
    userId: "u3",
    name: "Aline Uwase",
    studentIdNumber: "STD-2025-0003",
    class: "Senior 5 A",
    needs: ["Learning"],
    arrangements: ["A reader"],
    reviewOn: null,
  },
];

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  h.exportData.mockReset();
  serve(h.api, {
    "/support/register": register,
    "/students/s1/support-plan": { plan: null, mayChange: true },
    "/students/s9/support-plan": { plan: null, mayChange: true },
    "/users": {
      data: [
        {
          id: "u9",
          firstName: "Aline",
          lastName: "Uwase",
          student: { id: "s9", classSection: { name: "A", classLevel: { name: "Senior 1" } } },
        },
      ],
      meta: { total: 1, page: 1, limit: 8, totalPages: 1 },
    },
  });
});

/** Every support plan in the school (B7). */
describe("the support plans page", () => {
  it("lists each plan, what to do, and one due to be looked at again", async () => {
    renderPage(SupportPlansPage, { role: "HEAD_TEACHER" });
    const list = await screen.findByRole("list", { name: "Support plans" });
    expect(list).toHaveTextContent("Keza Habimana");
    expect(list).toHaveTextContent("25% extra time, Large print");
    expect(list).toHaveTextContent("Nothing different in exams");
    expect(within(list).getByText("Look at it again")).toBeInTheDocument();
    expect(list).toHaveTextContent("Again on 1 January");
  });

  it("exports the list for the national exam registration", async () => {
    renderPage(SupportPlansPage, { role: "HEAD_TEACHER" });
    await screen.findByText("Keza Habimana");
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(await screen.findByText(/csv/i));
    expect(h.exportData).toHaveBeenCalledWith(
      "csv",
      expect.objectContaining({
        filename: "support-plans",
        data: expect.arrayContaining([
          expect.objectContaining({ _arrangements: "25% extra time, Large print", _needs: "Seeing" }),
          expect.objectContaining({ name: "Eric Mugisha", _review: "2099-01-01" }),
          expect.objectContaining({ name: "Aline Uwase", _review: "" }),
        ]),
      }),
    );
  });

  it("opens one plan", async () => {
    renderPage(SupportPlansPage, { role: "HEAD_TEACHER" });
    fireEvent.click(await screen.findByText("Keza Habimana"));
    expect(await screen.findByRole("dialog", { name: "Keza Habimana" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Make a plan" })).toBeInTheDocument();
  });

  it("adds a plan for a student found by name", async () => {
    renderPage(SupportPlansPage, { role: "NURSE" });
    fireEvent.click(await screen.findByRole("button", { name: "Add a plan" }));
    const finder = await screen.findByRole("dialog", { name: "Add a support plan" });
    fireEvent.change(within(finder).getByLabelText("Find the student"), {
      target: { value: "Aline" },
    });
    fireEvent.click(await within(finder).findByText("Aline Uwase"));
    expect(await screen.findByRole("dialog", { name: "Aline Uwase" })).toBeInTheDocument();
  });

  it("says so when there are no plans", async () => {
    serve(h.api, { "/support/register": [], "/users": { data: [], meta: {} } });
    renderPage(SupportPlansPage, { role: "HEAD_TEACHER" });
    expect(await screen.findByText("No student has a support plan yet.")).toBeInTheDocument();
  });
});

describe("closing the support plan pop-ups", () => {
  it("closes a plan and the student finder from the keyboard", async () => {
    renderPage(SupportPlansPage, { role: "HEAD_TEACHER" });
    fireEvent.click(await screen.findByText("Keza Habimana"));
    await screen.findByRole("dialog", { name: "Keza Habimana" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Add a plan" }));
    await screen.findByRole("dialog", { name: "Add a support plan" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
