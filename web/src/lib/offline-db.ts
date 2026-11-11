import { isShared } from "@/lib/session";

const DB_NAME = "markova-offline";
/* 2 added the register queue. An existing database keeps its marks queue:
   the upgrade only creates the store that is missing. */
const DB_VERSION = 2;
const MARKS = "pending-marks";
const REGISTERS = "pending-registers";
type Queue = typeof MARKS | typeof REGISTERS;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of [MARKS, REGISTERS]) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id", autoIncrement: true });
        }
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
  constructor(what = "Marks") {
    super(`${what} are not kept on a shared computer. Save them once you are back online.`);
  }
}

async function save(queue: Queue, payload: any, owner?: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(queue, "readwrite");
    tx.objectStore(queue).add({
      ...payload,
      ...(owner && { owner }),
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function list(queue: Queue, owner?: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(queue, "readonly");
    const request = tx.objectStore(queue).getAll();
    request.onsuccess = () =>
      resolve(request.result.filter((entry) => mine(entry, owner)));
    request.onerror = () => reject(request.error);
  });
}

async function remove(queue: Queue, id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(queue, "readwrite");
    tx.objectStore(queue).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ── Marks ─────────────────────────────────────────────────────────────── */

export async function savePendingMarks(payload: any, owner?: string): Promise<void> {
  /* Nothing is left behind on a shared computer: the next person to sit
     down would find a class's marks in the browser. */
  if (isShared()) throw new SharedComputerError();
  return save(MARKS, payload, owner);
}

export function getPendingMarks(owner?: string): Promise<any[]> {
  return list(MARKS, owner);
}

/**
 * Empty every queue on this computer.
 *
 * Called on signing out of a shared computer, so it takes the registers as
 * well as the marks: both name children and say where they were.
 */
export async function clearPendingMarks(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MARKS, REGISTERS], "readwrite");
    tx.objectStore(MARKS).clear();
    tx.objectStore(REGISTERS).clear();
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
export function deletePendingMark(id: number): Promise<void> {
  return remove(MARKS, id);
}

export async function getPendingCount(owner?: string): Promise<number> {
  return (await getPendingMarks(owner)).length;
}

/* ── Registers ─────────────────────────────────────────────────────────── */

/*
  A register taken while the connection is down.

  Only the marks page kept work on the device, so a register taken during a
  network drop was lost when saving failed, and a register is the legal record
  of who was in the building. The same rules as marks: kept to the school
  record that took it, and never on a shared computer.
*/
export async function savePendingRegister(payload: any, owner?: string): Promise<void> {
  if (isShared()) throw new SharedComputerError("Registers");
  return save(REGISTERS, payload, owner);
}

export function getPendingRegisters(owner?: string): Promise<any[]> {
  return list(REGISTERS, owner);
}

export function deletePendingRegister(id: number): Promise<void> {
  return remove(REGISTERS, id);
}
