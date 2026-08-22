import { describe, expect, it } from "vitest";
import { deliveryTick, formatLastSeen } from "./presence";

const now = new Date("2026-08-22T12:00:00Z");
const minutesAgo = (n: number) =>
  new Date(now.getTime() - n * 60_000).toISOString();

describe("saying when someone was last online", () => {
  it("says offline when we have never seen them", () => {
    expect(formatLastSeen(null, now)).toBe("offline");
    expect(formatLastSeen(undefined, now)).toBe("offline");
  });

  it("says offline rather than NaN for a broken timestamp", () => {
    expect(formatLastSeen("not a date", now)).toBe("offline");
  });

  it("rounds the last minute to just now", () => {
    expect(formatLastSeen(minutesAgo(0), now)).toBe("last seen just now");
    expect(formatLastSeen(minutesAgo(0.9), now)).toBe("last seen just now");
  });

  // A client clock a few seconds ahead of the server would otherwise produce a
  // negative number of minutes.
  it("does not report the future", () => {
    expect(formatLastSeen(new Date(now.getTime() + 30_000).toISOString(), now)).toBe(
      "last seen just now",
    );
  });

  it("counts in minutes up to the hour", () => {
    expect(formatLastSeen(minutesAgo(1), now)).toBe("last seen 1m ago");
    expect(formatLastSeen(minutesAgo(59), now)).toBe("last seen 59m ago");
  });

  it("switches to hours at exactly one hour", () => {
    expect(formatLastSeen(minutesAgo(60), now)).toBe("last seen 1h ago");
  });

  it("counts in hours up to the day", () => {
    expect(formatLastSeen(minutesAgo(60 * 23), now)).toBe("last seen 23h ago");
  });

  it("falls back to a date at exactly one day", () => {
    expect(formatLastSeen(minutesAgo(60 * 24), now)).toMatch(/last seen \d/);
  });

  it("gives a date for something long ago", () => {
    expect(formatLastSeen("2026-01-04T09:00:00Z", now)).toMatch(/last seen \d/);
  });
});

describe("which tick a message gets", () => {
  it("shows one tick for a message that has only been sent", () => {
    expect(deliveryTick("SENT")).toBe("one");
  });

  it("shows two ticks once it has been delivered", () => {
    expect(deliveryTick("DELIVERED")).toBe("two");
  });

  it("shows read ticks once it has been read", () => {
    expect(deliveryTick("READ")).toBe("two-read");
  });

  // An older message from before delivery receipts existed has no status, and
  // it did leave, so one tick is the honest answer.
  it("treats a missing status as sent", () => {
    expect(deliveryTick(undefined)).toBe("one");
    expect(deliveryTick("")).toBe("one");
  });

  it("treats anything unrecognised as sent", () => {
    expect(deliveryTick("QUEUED")).toBe("one");
  });
});
