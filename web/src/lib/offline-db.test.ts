import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * When the browser refuses the queue.
 *
 * The whole point of this module is that a teacher's afternoon survives a bad
 * connection. It must not also have to survive a silent failure: private
 * browsing, a full disk or a blocked origin all make IndexedDB refuse, and
 * every one of those has to surface as a rejected promise the page can catch,
 * not a promise that never settles.
 */
describe("when IndexedDB refuses", () => {
  const realIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    globalThis.indexedDB = realIndexedDB;
  });

  /** An indexedDB whose open() fails, the way private browsing does. */
  function refuseToOpen() {
    globalThis.indexedDB = {
      open: () => {
        const request: any = { error: new Error("access denied") };
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    } as unknown as IDBFactory;
  }

  /** An indexedDB that opens, then fails every transaction. */
  function failTransactions() {
    const store = {
      add: () => undefined,
      clear: () => undefined,
      getAll: () => {
        const r: any = { error: new Error("read failed") };
        queueMicrotask(() => r.onerror?.());
        return r;
      },
      count: () => {
        const r: any = { error: new Error("read failed") };
        queueMicrotask(() => r.onerror?.());
        return r;
      },
    };
    globalThis.indexedDB = {
      open: () => {
        const request: any = {
          result: {
            transaction: () => {
              const tx: any = { objectStore: () => store, error: new Error("tx failed") };
              queueMicrotask(() => tx.onerror?.());
              return tx;
            },
          },
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    } as unknown as IDBFactory;
  }

  it("rejects a save rather than losing the marks quietly", async () => {
    refuseToOpen();
    await expect(savePendingMarks(marks("student-1", 82))).rejects.toBeTruthy();
  });

  it("rejects a read", async () => {
    refuseToOpen();
    await expect(getPendingMarks()).rejects.toBeTruthy();
  });

  it("rejects a count", async () => {
    refuseToOpen();
    await expect(getPendingCount()).rejects.toBeTruthy();
  });

  it("rejects a clear", async () => {
    refuseToOpen();
    await expect(clearPendingMarks()).rejects.toBeTruthy();
  });

  // Opening is not the only way it fails: a full disk breaks the write.
  it("rejects a save whose transaction fails", async () => {
    failTransactions();
    await expect(savePendingMarks(marks("student-1", 82))).rejects.toBeTruthy();
  });

  it("rejects a clear whose transaction fails", async () => {
    failTransactions();
    await expect(clearPendingMarks()).rejects.toBeTruthy();
  });

  it("rejects a read whose request fails", async () => {
    failTransactions();
    await expect(getPendingMarks()).rejects.toBeTruthy();
  });

  it("rejects a count whose request fails", async () => {
    failTransactions();
    await expect(getPendingCount()).rejects.toBeTruthy();
  });
});
