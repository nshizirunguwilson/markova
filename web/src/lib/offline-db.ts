import { isShared } from "@/lib/session";

const DB_NAME = "markova-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-marks";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/*
  Whose an entry is.

  The queue lives in the browser, and outlives a sign out and a switch of
  school. Marks saved by a teacher at one school must not be sent later under
  their record at another school, or under whoever signs in next on the same
  computer: each entry carries the school record (`owner`) that saved it, and
  only that record sees, counts or sends it. Entries saved before this have
  no owner and stay visible, as they always were.
*/
const mine = (entry: { owner?: string }, owner?: string) =>
  !owner || !entry.owner || entry.owner === owner;

/** Refused on a shared computer: see savePendingMarks. */
export class SharedComputerError extends Error {
  constructor() {
    super("Marks are not kept on a shared computer. Save them once you are back online.");
  }
}

export async function savePendingMarks(payload: any, owner?: string): Promise<void> {
  /* Nothing is left behind on a shared computer: the next person to sit
     down would find a class's marks in the browser. */
  if (isShared()) throw new SharedComputerError();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({
      ...payload,
      ...(owner && { owner }),
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingMarks(owner?: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () =>
      resolve(request.result.filter((entry) => mine(entry, owner)));
    request.onerror = () => reject(request.error);
  });
}

export async function clearPendingMarks(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove one queued entry, once the server has taken it.
 *
 * The queue used to be cleared all at once and only when every entry went
 * through, so a batch where one call failed left the ones that had succeeded
 * sitting in the queue to be posted again on the next attempt.
 */
export async function deletePendingMark(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount(owner?: string): Promise<number> {
  return (await getPendingMarks(owner)).length;
}
