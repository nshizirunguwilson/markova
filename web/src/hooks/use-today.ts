"use client";

import { useSyncExternalStore } from "react";

/**
 * Midnight this morning, as a timestamp.
 *
 * The wall clock is external mutable state, so reading `Date.now()` straight
 * from a render body is impure — two renders of the same data can disagree, and
 * the React Compiler rightly rejects it. `useSyncExternalStore` is the
 * supported way to read a source like this.
 *
 * The snapshot is bucketed to the start of the day, which serves the only thing
 * callers need it for ("how many days until this book is due") and keeps the
 * value referentially stable between renders — a snapshot that changed on every
 * call would loop forever.
 */

const MINUTE = 60 * 1000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function subscribe(onChange: () => void): () => void {
  // A minute is granular enough to roll over shortly after midnight without
  // keeping a busy timer alive.
  const id = setInterval(onChange, MINUTE);
  return () => clearInterval(id);
}

export function useToday(): number {
  return useSyncExternalStore(subscribe, startOfToday, startOfToday);
}

/** Whole days from today until `date`; negative once it is in the past. */
export function daysFromToday(date: string | Date, today: number): number {
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today) / (24 * 60 * 60 * 1000));
}
