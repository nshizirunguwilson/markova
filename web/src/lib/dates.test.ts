import { describe, expect, it } from "vitest";
import { DATE_LOCALE, day, dayAndTime } from "./dates";

describe("how a date is written", () => {
  // 11/12/2026 and 12/11/2026 are the same two numbers: letters settle it.
  it("puts the day first and spells the month", () => {
    expect(day("2026-11-12T10:00:00")).toBe("12 Nov 2026");
    expect(day("2026-12-11T10:00:00")).toBe("11 Dec 2026");
  });

  it("reads a Date and a timestamp as well as a string", () => {
    const at = new Date(2026, 0, 5, 9, 30);
    expect(day(at)).toBe("5 Jan 2026");
    expect(day(at.getTime())).toBe("5 Jan 2026");
  });

  it("adds the time on the 24 hour clock when asked", () => {
    expect(dayAndTime(new Date(2026, 10, 12, 14, 5))).toBe("12 Nov 2026, 14:05");
  });

  it("never takes the browser's own habit", () => {
    expect(DATE_LOCALE).toBe("en-GB");
  });
});

/*
  The rule holds only while nothing goes round it. A bare
  toLocaleDateString(), or one given `undefined`, `[]` or "default", takes
  the reader's browser settings and puts the month first for some of them.
*/
describe("every date on screen", () => {
  const sources = import.meta.glob("/src/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  const BROWSER_HABIT =
    /toLocale(?:Date|Time)String\(\s*(?:\)|undefined|\[\]|"default")|new Date\([^;]*?\)\s*\.toLocaleString\(\s*(?:\)|undefined|\[\]|"default")/;

  it("names its locale", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.endsWith("/lib/dates.ts"))
      .filter(([, text]) => BROWSER_HABIT.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
