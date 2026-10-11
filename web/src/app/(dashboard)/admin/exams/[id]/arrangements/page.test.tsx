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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/exams/exam-1/arrangements",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "exam-1" }),
}));

import { fireEvent, screen } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import ExamArrangementsSheet from "./page";

const sheet = (students: unknown[]) => ({
  exam: {
    subject: "Mathematics",
    class: "Senior 4 A",
    term: "Term 3",
    examDate: "2026-11-02T00:00:00.000Z",
    startTime: "08:00",
    endTime: "10:00",
    room: "Lab 2",
  },
  students,
});

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
});

/** The sheet an invigilator takes into one exam (B7). */
describe("an exam's arrangements sheet", () => {
  it("names the exam, and each student with what to do and their minutes", async () => {
    serve(h.api, {
      "/support/exams/exam-1/sheet": sheet([
        {
          studentId: "s1",
          name: "Keza Habimana",
          studentIdNumber: "STD-1",
          arrangements: ["25% extra time", "Large print"],
          extraMinutes: 30,
        },
        {
          studentId: "s2",
          name: "Eric Mugisha",
          studentIdNumber: "STD-2",
          arrangements: ["Sits near the front"],
          extraMinutes: null,
        },
      ]),
    });
    renderPage(ExamArrangementsSheet, { role: "HEAD_TEACHER" });
    const page = await screen.findByTestId("exam-sheet");
    expect(page).toHaveTextContent("Mathematics: exam arrangements");
    expect(page).toHaveTextContent("Senior 4 A · Term 3 · 2 November, 08:00 to 10:00 · Lab 2");
    expect(page).toHaveTextContent("30 minutes");
    expect(page).toHaveTextContent("Sits near the front");
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    expect(print).toHaveBeenCalled();
  });

  it("says when nobody in the class needs anything", async () => {
    serve(h.api, { "/support/exams/exam-1/sheet": sheet([]) });
    renderPage(ExamArrangementsSheet, { role: "HEAD_TEACHER" });
    expect(await screen.findByText(/No student in this class has arrangements/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print/ })).toBeDisabled();
  });
});

describe("an exam with no room set", () => {
  it("leaves the room out", async () => {
    const plain = sheet([]);
    serve(h.api, { "/support/exams/exam-1/sheet": { ...plain, exam: { ...plain.exam, room: null } } });
    renderPage(ExamArrangementsSheet, { role: "HEAD_TEACHER" });
    const page = await screen.findByTestId("exam-sheet");
    expect(page).toHaveTextContent("2 November, 08:00 to 10:00");
    expect(page).not.toHaveTextContent("Lab");
  });
});
