import { describe, expect, it } from "vitest";
import { schoolDay, todaysLessons, toMinutes } from "./lessons";

// 12 November 2026 is a Thursday: day 4 on the timetable.
const at = (h: number, m: number) => new Date(2026, 10, 12, h, m);

const row = (id: string, dayOfWeek: number, startTime: string, endTime: string) => ({
  id,
  dayOfWeek,
  startTime,
  endTime,
});

const week = [
  row("thu-3", 4, "10:40", "11:40"),
  row("thu-1", 4, "08:30", "09:30"),
  row("wed-1", 3, "08:30", "09:30"),
  row("thu-2", 4, "09:30", "10:30"),
];

describe("reading a time", () => {
  it("counts the minutes since midnight", () => {
    expect(toMinutes("08:30")).toBe(510);
    expect(toMinutes("00:00")).toBe(0);
  });

  it("answers NaN for something that is not a time", () => {
    expect(toMinutes("")).toBeNaN();
    expect(toMinutes("soon")).toBeNaN();
  });
});

describe("the day of the school week", () => {
  it("counts Monday as 1 and Sunday as 7", () => {
    expect(schoolDay(new Date(2026, 10, 9))).toBe(1);
    expect(schoolDay(new Date(2026, 10, 15))).toBe(7);
  });
});

describe("today's lessons", () => {
  it("keeps only today's, in the order they happen", () => {
    const ids = todaysLessons(week, at(7, 0)).map((l) => l.row.id);
    expect(ids).toEqual(["thu-1", "thu-2", "thu-3"]);
  });

  it("marks the first one next before school starts", () => {
    const states = todaysLessons(week, at(7, 0)).map((l) => l.state);
    expect(states).toEqual(["next", "later", "later"]);
  });

  it("marks the one running now and the one after it", () => {
    const states = todaysLessons(week, at(9, 45)).map((l) => l.state);
    expect(states).toEqual(["done", "now", "next"]);
  });

  // Back to back: at 09:30 the first has ended and the second has begun.
  it("never has two lessons running at the bell", () => {
    const states = todaysLessons(week, at(9, 30)).map((l) => l.state);
    expect(states).toEqual(["done", "now", "next"]);
  });

  it("marks a gap between lessons as waiting for the next", () => {
    const states = todaysLessons(week, at(10, 35)).map((l) => l.state);
    expect(states).toEqual(["done", "done", "next"]);
  });

  it("marks everything done once the day is over", () => {
    const states = todaysLessons(week, at(16, 0)).map((l) => l.state);
    expect(states).toEqual(["done", "done", "done"]);
  });

  it("has nothing on a day with no lessons, or with no timetable at all", () => {
    expect(todaysLessons(week, new Date(2026, 10, 14, 9, 0))).toEqual([]);
    expect(todaysLessons(undefined, at(9, 0))).toEqual([]);
  });
});
