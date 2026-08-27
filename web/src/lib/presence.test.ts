import { describe, expect, it } from "vitest";
import { deliveryTick, formatLastSeen, lastMessagePrefix } from "./presence";

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

/**
 * The inbox line under each thread name. Seeing your own name quoted back at
 * you in your own inbox reads as somebody else talking about you.
 *
 * The shapes below are what `GET /messaging/conversations` actually returns:
 * the id lives on `senderUserId`, and `sender` is only `{ firstName,
 * lastName }`. An earlier version of this compared `sender.id`, which does
 * not exist, so every message was attributed by name and "You:" never once
 * appeared on screen.
 */
describe("labelling the last message in a thread", () => {
  const you = "me-1";
  const from = (senderUserId: string, firstName: string | null) => ({
    id: "msg-1",
    conversationId: "conv-1",
    senderUserId,
    content: "Muraho",
    sender: firstName === null ? null : { firstName, lastName: "Uwase" },
  });

  it("says You for a message the viewer sent", () => {
    expect(lastMessagePrefix(from(you, "Wilson"), you)).toBe("You: ");
  });

  it("names anybody else", () => {
    expect(lastMessagePrefix(from("u-2", "Aline"), you)).toBe("Aline: ");
  });

  it("falls back when a sender has no name left", () => {
    expect(lastMessagePrefix(from("u-2", ""), you)).toBe("Someone: ");
    expect(lastMessagePrefix({ senderUserId: "u-2" }, you)).toBe("Someone: ");
  });

  it("falls back when the sender is gone from the school", () => {
    expect(lastMessagePrefix(from("u-2", null), you)).toBe("Someone: ");
    expect(lastMessagePrefix(null, you)).toBe("Someone: ");
    expect(lastMessagePrefix(undefined, you)).toBe("Someone: ");
  });

  // Signed out mid-render: nobody is "you", so nobody gets called You.
  it("names the sender when the viewer is unknown", () => {
    expect(lastMessagePrefix(from(you, "Wilson"), undefined)).toBe("Wilson: ");
  });

  // The trap this fell into: `sender` carries no id at all.
  it("ignores an id that is not on the sender projection", () => {
    expect(
      lastMessagePrefix(
        { senderUserId: you, sender: { firstName: "Wilson" } },
        you,
      ),
    ).toBe("You: ");
  });
});
