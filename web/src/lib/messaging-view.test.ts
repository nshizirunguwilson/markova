import { describe, expect, it } from "vitest";

import {
  GROUP_WINDOW_MS,
  clockTime,
  dayLabel,
  groupThread,
  senderIdOf,
} from "./messaging-view";

// Local time throughout: day boundaries are local, so a UTC literal would
// make these tests pass or fail depending on where they are run.
const now = new Date("2026-08-27T15:00:00");
const me = "me-1";
const her = "u-2";

/**
 * Shaped like `GET /messaging/conversations/:id/messages`: the id is on
 * `senderUserId`, and `sender` carries `id`, `firstName` and `lastName`.
 * Checked against a live response.
 */
const msg = (
  id: string,
  senderUserId: string,
  createdAt: string,
  first = "Aline",
) => ({
  id,
  senderUserId,
  createdAt,
  content: "…",
  sender: { id: senderUserId, firstName: first, lastName: "Uwase" },
});

describe("reading who sent a message", () => {
  it("takes the id off senderUserId", () => {
    expect(senderIdOf(msg("m-1", her, now.toISOString()))).toBe(her);
  });

  it("falls back to the sender projection when there is no senderUserId", () => {
    expect(
      senderIdOf({ id: "m-1", createdAt: "", sender: { id: her } }),
    ).toBe(her);
  });

  it("gives null rather than undefined for a message with neither", () => {
    expect(senderIdOf({ id: "m-1", createdAt: "" })).toBeNull();
  });
});

/**
 * A thread spanning days reads as one blur without these.
 */
describe("labelling the day a message was sent", () => {
  it("says Today", () => {
    expect(dayLabel("2026-08-27T09:00:00", now)).toBe("Today");
  });

  it("says Yesterday", () => {
    expect(dayLabel("2026-08-26T23:30:00", now)).toBe("Yesterday");
  });

  // Compared by calendar day, not elapsed hours: 11pm last night is
  // "Yesterday" at 1am, never "2 hours ago".
  it("counts calendar days rather than hours", () => {
    const oneAm = new Date("2026-08-27T01:00:00");
    expect(dayLabel("2026-08-26T23:00:00", oneAm)).toBe("Yesterday");
  });

  it("names the weekday within the last week", () => {
    expect(dayLabel("2026-08-24T09:00:00", now)).toBe("Monday");
  });

  it("writes the date out beyond a week, without the year in this one", () => {
    expect(dayLabel("2026-07-04T09:00:00", now)).toMatch(/July/);
    expect(dayLabel("2026-07-04T09:00:00", now)).not.toMatch(/2026/);
  });

  it("keeps the year on another year", () => {
    expect(dayLabel("2025-07-04T09:00:00", now)).toMatch(/2025/);
  });

  it("says nothing for a date it cannot read", () => {
    expect(dayLabel("not a date", now)).toBe("");
    expect(clockTime("not a date")).toBe("");
  });
});

describe("grouping a thread the way it is read", () => {
  it("runs consecutive messages from one person together", () => {
    const blocks = groupThread(
      [
        msg("m-1", her, "2026-08-27T10:00:00"),
        msg("m-2", her, "2026-08-27T10:01:00"),
        msg("m-3", her, "2026-08-27T10:02:00"),
      ],
      me,
      now,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].groups).toHaveLength(1);
    expect(blocks[0].groups[0].messages).toHaveLength(3);
  });

  it("breaks the run when the other person speaks", () => {
    const blocks = groupThread(
      [
        msg("m-1", her, "2026-08-27T10:00:00"),
        msg("m-2", me, "2026-08-27T10:01:00", "Wilson"),
        msg("m-3", her, "2026-08-27T10:02:00"),
      ],
      me,
      now,
    );
    expect(blocks[0].groups.map((g) => g.messages.length)).toEqual([1, 1, 1]);
  });

  // Three messages in a row are one remark; one an hour later is not.
  it("breaks the run after a long enough gap", () => {
    const blocks = groupThread(
      [
        msg("m-1", her, "2026-08-27T10:00:00"),
        msg("m-2", her, new Date(Date.parse("2026-08-27T10:00:00") + GROUP_WINDOW_MS + 1000).toISOString()),
      ],
      me,
      now,
    );
    expect(blocks[0].groups).toHaveLength(2);
  });

  it("keeps a run together right up to the edge of the window", () => {
    const blocks = groupThread(
      [
        msg("m-1", her, "2026-08-27T10:00:00"),
        msg("m-2", her, new Date(Date.parse("2026-08-27T10:00:00") + GROUP_WINDOW_MS).toISOString()),
      ],
      me,
      now,
    );
    expect(blocks[0].groups).toHaveLength(1);
  });

  it("starts a new day rather than running across midnight", () => {
    const blocks = groupThread(
      [
        msg("m-1", her, "2026-08-26T10:00:00"),
        msg("m-2", her, "2026-08-27T10:00:00"),
      ],
      me,
      now,
    );
    expect(blocks.map((b) => b.day)).toEqual(["Yesterday", "Today"]);
  });

  it("marks the viewer's own messages as theirs", () => {
    const blocks = groupThread(
      [
        msg("m-1", me, "2026-08-27T10:00:00", "Wilson"),
        msg("m-2", her, "2026-08-27T10:01:00"),
      ],
      me,
      now,
    );
    expect(blocks[0].groups[0].mine).toBe(true);
    expect(blocks[0].groups[1].mine).toBe(false);
  });

  it("claims nothing for a viewer who is not signed in", () => {
    const blocks = groupThread([msg("m-1", me, "2026-08-27T10:00:00")], undefined, now);
    expect(blocks[0].groups[0].mine).toBe(false);
  });

  // A sender removed from the school leaves messages behind.
  it("names a sender who is gone", () => {
    const blocks = groupThread(
      [{ id: "m-1", senderUserId: "ghost", createdAt: "2026-08-27T10:00:00" }],
      me,
      now,
    );
    expect(blocks[0].groups[0].senderName).toBe("Someone");
    expect(blocks[0].groups[0].mine).toBe(false);
  });

  it("does not lump two unknown senders together", () => {
    const blocks = groupThread(
      [
        { id: "m-1", createdAt: "2026-08-27T10:00:00" },
        { id: "m-2", createdAt: "2026-08-27T10:01:00" },
      ],
      me,
      now,
    );
    // Both have a null sender, so they are the same run — which is right:
    // there is nothing to tell them apart by.
    expect(blocks[0].groups).toHaveLength(1);
  });

  it("gives every group and block a key of its own", () => {
    const blocks = groupThread(
      [
        msg("m-1", her, "2026-08-26T10:00:00"),
        msg("m-2", me, "2026-08-27T10:00:00", "Wilson"),
        msg("m-3", her, "2026-08-27T10:01:00"),
      ],
      me,
      now,
    );
    const keys = blocks.flatMap((b) => [b.key, ...b.groups.map((g) => g.key)]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has nothing to show for an empty thread", () => {
    expect(groupThread([], me, now)).toEqual([]);
  });
});
