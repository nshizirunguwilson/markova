import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import {
  clearPendingMarks,
  getPendingCount,
  getPendingMarks,
  savePendingMarks,
} from "./offline-db";

/**
 * The offline queue for marks entry.
 *
 * A teacher entering marks on a classroom connection is the case this exists
 * for: the save fails, the marks go into IndexedDB, and they are sent when the
 * connection returns. Losing that queue means losing a teacher's afternoon, so
 * it is worth knowing it survives a reload rather than assuming it does.
 */

beforeEach(() => {
  // A fresh database per test, so one test's queue is never another's.
  globalThis.indexedDB = new IDBFactory();
});

const marks = (studentId: string, score: number) => ({
  classSectionId: "section-1",
  termId: "term-1",
  subjectId: "subject-1",
  entries: [{ studentId, score }],
});

describe("an empty queue", () => {
  it("reports nothing pending", async () => {
    await expect(getPendingCount()).resolves.toBe(0);
  });

  it("returns an empty list rather than undefined", async () => {
    await expect(getPendingMarks()).resolves.toEqual([]);
  });

  it("is safe to clear when there is nothing in it", async () => {
    await expect(clearPendingMarks()).resolves.toBeUndefined();
  });
});

describe("saving marks for later", () => {
  it("keeps one batch", async () => {
    await savePendingMarks(marks("student-1", 82));
    await expect(getPendingCount()).resolves.toBe(1);
  });

  it("keeps every batch, not just the last", async () => {
    await savePendingMarks(marks("student-1", 82));
    await savePendingMarks(marks("student-2", 67));
    await savePendingMarks(marks("student-3", 74));
    await expect(getPendingCount()).resolves.toBe(3);
  });

  it("gives back what was put in", async () => {
    await savePendingMarks(marks("student-1", 82));
    const [saved] = await getPendingMarks();
    expect(saved).toMatchObject({
      classSectionId: "section-1",
      termId: "term-1",
      entries: [{ studentId: "student-1", score: 82 }],
    });
  });

  // The timestamp is what lets the app tell a teacher how long their work has
  // been waiting, and order a backlog oldest first.
  it("stamps each batch with when it was saved", async () => {
    const before = Date.now();
    await savePendingMarks(marks("student-1", 82));
    const [saved] = await getPendingMarks();
    expect(saved.savedAt).toBeGreaterThanOrEqual(before);
    expect(saved.savedAt).toBeLessThanOrEqual(Date.now());
  });

  it("gives each batch its own key", async () => {
    await savePendingMarks(marks("student-1", 82));
    await savePendingMarks(marks("student-2", 67));
    const saved = await getPendingMarks();
    expect(new Set(saved.map((s) => s.id)).size).toBe(2);
  });
});

describe("clearing the queue after a successful sync", () => {
  it("empties it", async () => {
    await savePendingMarks(marks("student-1", 82));
    await savePendingMarks(marks("student-2", 67));
    await clearPendingMarks();
    await expect(getPendingCount()).resolves.toBe(0);
    await expect(getPendingMarks()).resolves.toEqual([]);
  });

  it("leaves the queue usable afterwards", async () => {
    await savePendingMarks(marks("student-1", 82));
    await clearPendingMarks();
    await savePendingMarks(marks("student-9", 90));
    await expect(getPendingCount()).resolves.toBe(1);
  });
});

// The whole point is surviving a reload, so opening the database a second time
// has to find what the first one wrote.
describe("across reloads", () => {
  it("keeps the queue when the database is reopened", async () => {
    await savePendingMarks(marks("student-1", 82));
    // Every call here opens its own connection, so this is the reopen path.
    await expect(getPendingCount()).resolves.toBe(1);
    const [saved] = await getPendingMarks();
    expect(saved.entries[0].studentId).toBe("student-1");
  });

  it("creates the store on first use", async () => {
    globalThis.indexedDB = new IDBFactory();
    await expect(getPendingCount()).resolves.toBe(0);
  });
});

describe("what it accepts", () => {
  it("takes a batch with many students", async () => {
    await savePendingMarks({
      classSectionId: "section-1",
      termId: "term-1",
      entries: Array.from({ length: 40 }, (_, i) => ({
        studentId: `student-${i}`,
        score: 50 + i,
      })),
    });
    const [saved] = await getPendingMarks();
    expect(saved.entries).toHaveLength(40);
  });

  it("takes a batch with no entries without complaining", async () => {
    await savePendingMarks({ classSectionId: "section-1", entries: [] });
    await expect(getPendingCount()).resolves.toBe(1);
  });
});
