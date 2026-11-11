import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() } };
});
vi.mock("@/lib/api", () => ({ default: h.api }));

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/harness";
import { serve } from "@/test/page";
import { classSection } from "@/test/fixtures";

import { TodaysLessons } from "./todays-lessons";

/**
 * A teacher's home page said what they teach and not what they teach today.
 */

// Thursday 12 November 2026: day 4.
const at = (hour: number, minute = 0) => new Date(2026, 10, 12, hour, minute);

const lesson = (id: string, dayOfWeek: number, startTime: string, endTime: string, over = {}) => ({
  id,
  dayOfWeek,
  startTime,
  endTime,
  room: "Lab 2",
  subject: { name: "Physics" },
  classSection,
  ...over,
});

const week = [
  lesson("thu-2", 4, "10:40", "11:40", { subject: { name: "Mathematics" }, room: null }),
  lesson("thu-1", 4, "08:30", "09:30"),
  lesson("mon-1", 1, "08:30", "09:30", { subject: { name: "Chemistry" } }),
];

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
});

function mount(rows: unknown, now = at(9, 0), signedIn = true) {
  serve(h.api, { "/academic/timetable/teacher/teacher-1": rows });
  renderWithProviders(
    <TodaysLessons teacherId={signedIn ? "teacher-1" : undefined} now={now} />,
  );
}

describe("today's lessons", () => {
  it("asks for the teacher's own week", async () => {
    mount(week);
    await screen.findByText("Physics");
    expect(String(h.api.get.mock.calls[0][0])).toBe("/academic/timetable/teacher/teacher-1");
  });

  it("lists today's lessons only, with the class and the room", async () => {
    mount(week);
    expect(await screen.findByText("Physics")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("Chemistry")).toBeNull();
    expect(screen.getByText("Senior 1 A, Lab 2")).toBeInTheDocument();
    // No room on record: the class alone, not a trailing comma.
    expect(screen.getByText("Senior 1 A")).toBeInTheDocument();
  });

  it("says which lesson is running and which is next", async () => {
    mount(week, at(9, 0));
    await screen.findByText("Physics");
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("2 to go")).toBeInTheDocument();
  });

  it("says so once the day is taught", async () => {
    mount(week, at(16, 0));
    await screen.findByText("Physics");
    expect(screen.getByText("All taught")).toBeInTheDocument();
    expect(screen.queryByText("Now")).toBeNull();
    expect(screen.queryByText("Next")).toBeNull();
  });

  it("says there is nothing today on a day off", async () => {
    mount(week, new Date(2026, 10, 14, 9, 0));
    expect(
      await screen.findByText("You have no lessons on the timetable today."),
    ).toBeInTheDocument();
  });

  // A teacher who has not been timetabled is a different thing from a Saturday.
  it("says so when the teacher is on no timetable at all", async () => {
    mount([]);
    expect(
      await screen.findByText("You have no lessons on the timetable yet."),
    ).toBeInTheDocument();
  });

  it("names a lesson whose subject did not come", async () => {
    mount([lesson("thu-1", 4, "08:30", "09:30", { subject: null })]);
    expect(await screen.findByText("Lesson")).toBeInTheDocument();
  });

  it("leads to the register", async () => {
    mount(week);
    const link = await screen.findByRole("link", { name: "Mark the register" });
    expect(link.getAttribute("href")).toBe("/teacher/attendance");
  });

  it("draws nothing before the account has a teacher record", async () => {
    mount(week, at(9, 0), false);
    await waitFor(() => expect(h.api.get).not.toHaveBeenCalled());
    expect(document.body.textContent).toBe("");
  });

  it("draws nothing when the timetable cannot be read", async () => {
    serve(h.api, {});
    renderWithProviders(<TodaysLessons teacherId="teacher-1" now={at(9, 0)} />);
    await waitFor(() => expect(h.api.get).toHaveBeenCalled());
    expect(screen.queryByText(/lessons/i)).toBeNull();
  });
});
