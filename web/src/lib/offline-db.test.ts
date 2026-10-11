import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import {
  clearPendingMarks,
  deletePendingMark,
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

/**
 * Draining the queue one entry at a time.
 *
 * A sync where the third of five calls fails has to keep the third, fourth
 * and fifth and drop the first two. Clearing the lot loses the failures;
 * clearing none of it sends the successes a second time, overwriting a mark
 * that was corrected on another device in between.
 */
describe("removing one entry at a time", () => {
  it("takes out the entry named and leaves the rest", async () => {
    await savePendingMarks(marks("student-1", 82));
    await savePendingMarks(marks("student-2", 67));
    const [first] = await getPendingMarks();

    await deletePendingMark(first.id);

    const left = await getPendingMarks();
    expect(left).toHaveLength(1);
    expect(left[0].entries[0].studentId).toBe("student-2");
  });

  it("brings the pending count down with it", async () => {
    await savePendingMarks(marks("student-1", 82));
    await savePendingMarks(marks("student-2", 67));
    const [first] = await getPendingMarks();

    await deletePendingMark(first.id);

    await expect(getPendingCount()).resolves.toBe(1);
  });

  it("says nothing when the entry has already gone", async () => {
    await savePendingMarks(marks("student-1", 82));
    await expect(deletePendingMark(9999)).resolves.toBeUndefined();
    await expect(getPendingCount()).resolves.toBe(1);
  });

  it("empties the queue when every entry is taken out", async () => {
    await savePendingMarks(marks("student-1", 82));
    await savePendingMarks(marks("student-2", 67));

    for (const entry of await getPendingMarks()) {
      await deletePendingMark(entry.id);
    }

    await expect(getPendingCount()).resolves.toBe(0);
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

/**
 * Whose a queued batch is. The queue outlives a switch of school and a sign
 * out, so each batch is kept for the school record that saved it.
 */
describe("a queue shared by more than one school record", () => {
  it("shows each record only its own batches", async () => {
    await savePendingMarks(marks("student-1", 82), "teacher-at-kh");
    await savePendingMarks(marks("student-2", 67), "teacher-at-lycee");
    const kh = await getPendingMarks("teacher-at-kh");
    expect(kh).toHaveLength(1);
    expect(kh[0].owner).toBe("teacher-at-kh");
    await expect(getPendingCount("teacher-at-lycee")).resolves.toBe(1);
  });

  it("still shows batches saved before they had an owner", async () => {
    await savePendingMarks(marks("student-1", 82));
    await expect(getPendingCount("teacher-at-kh")).resolves.toBe(1);
  });

  it("shows nobody else's to a record with none of its own", async () => {
    await savePendingMarks(marks("student-1", 82), "teacher-at-kh");
    await expect(getPendingMarks("someone-else")).resolves.toEqual([]);
  });
});

/** Nothing is left behind on a shared computer: not even unsent marks (B5). */
describe("the offline queue on a shared computer", () => {
  afterEach(() => sessionStorage.clear());

  it("refuses to keep marks, and says why", async () => {
    sessionStorage.setItem("markova_shared_device", "1");
    await expect(savePendingMarks(marks("s1", 50), "teacher-1")).rejects.toThrow(
      /not kept on a shared computer/,
    );
    sessionStorage.clear();
    expect(await getPendingCount("teacher-1")).toBe(0);
  });
});
