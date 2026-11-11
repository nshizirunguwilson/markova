import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AbsenceWatch } from "./absence-watch";

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AbsenceWatch />
    </QueryClientProvider>,
  );

const student = (n: number, rate: number) => ({
  studentId: `s-${n}`,
  name: `Student ${n}`,
  class: "Senior 1 A",
  absentDays: rate,
  totalDays: 100,
  absenceRate: rate,
});

/* The teacher's dashboard said nothing about absence at all. */
describe("absence in a teacher's own classes", () => {
  beforeEach(() => api.get.mockReset());

  it("names each pupil over the line, with their days and their rate", async () => {
    api.get.mockResolvedValue({ data: { threshold: 20, students: [student(1, 31)] } });
    show();
    expect(await screen.findByText("Student 1")).toBeTruthy();
    expect(screen.getByText("Senior 1 A · 31 of 100 days")).toBeTruthy();
    expect(screen.getByText("31%")).toBeTruthy();
    expect(api.get.mock.calls[0][0]).toBe("/attendance/chronic");
  });

  it("says so when nobody is over the line, rather than showing an empty card", async () => {
    api.get.mockResolvedValue({ data: { threshold: 20, students: [] } });
    show();
    expect(await screen.findByText(/Nobody in your classes has missed 20%/)).toBeTruthy();
  });

  it("shows six and counts the rest", async () => {
    api.get.mockResolvedValue({
      data: { threshold: 20, students: Array.from({ length: 8 }, (_, i) => student(i, 25)) },
    });
    show();
    await screen.findByText("Student 0");
    expect(screen.queryByText("Student 6")).toBeNull();
    expect(screen.getByText("+2 more")).toBeTruthy();
  });
});
