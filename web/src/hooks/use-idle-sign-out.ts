"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { isShared } from "@/lib/session";
import { signOut } from "@/lib/sign-out";

/**
 * Signing out a computer nobody is using (B5 in docs/BLIND-SPOTS.md).
 *
 * Ten minutes on a shared computer, so the next student to sit down at the
 * lab machine does not find the last one's account. An hour on somebody's
 * own computer, for the laptop left open in the staffroom. A minute before,
 * the person is asked whether they are still there.
 *
 * The last moment of use is kept in the same storage as the sign in, so on
 * somebody's own computer every tab counts: reading in one tab keeps the
 * others signed in.
 */
export const SHARED_IDLE_MINUTES = 10;
export const OWN_IDLE_MINUTES = 60;
const WARNING_MS = 60 * 1000;
const LAST_USE = "markova_last_activity";

export type IdleState =
  | { kind: "active" }
  | { kind: "warning"; secondsLeft: number }
  | { kind: "out" };

/** Where a sign in stands, given when it was last used. */
export function idleState(now: number, lastUse: number, limitMs: number): IdleState {
  const left = limitMs - (now - lastUse);
  if (left <= 0) return { kind: "out" };
  if (left <= WARNING_MS) return { kind: "warning", secondsLeft: Math.ceil(left / 1000) };
  return { kind: "active" };
}

const storage = () => (isShared() ? sessionStorage : localStorage);

function readLastUse(): number {
  try {
    return Number(storage().getItem(LAST_USE)) || Date.now();
  } catch {
    return Date.now();
  }
}

function writeLastUse(at = Date.now()) {
  try {
    storage().setItem(LAST_USE, String(at));
  } catch {
    /* Storage refused: this tab still keeps its own count below. */
  }
}

export function useIdleSignOut(enabled = true) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<IdleState>({ kind: "active" });

  const stillHere = useCallback(() => {
    writeLastUse();
    setState({ kind: "active" });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const limit = (isShared() ? SHARED_IDLE_MINUTES : OWN_IDLE_MINUTES) * 60 * 1000;
    writeLastUse();

    // Moving the mouse counts, but writing on every pixel would be wasteful.
    let lastWrite = 0;
    const onUse = () => {
      const now = Date.now();
      if (now - lastWrite < 5000) return;
      lastWrite = now;
      writeLastUse(now);
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
    for (const e of events) window.addEventListener(e, onUse, { passive: true });

    let leaving = false;
    const check = () => {
      const next = idleState(Date.now(), readLastUse(), limit);
      setState(next);
      if (next.kind === "out" && !leaving) {
        leaving = true;
        void signOut(queryClient).then(() => router.replace("/login?signedOut=idle"));
      }
    };
    const timer = window.setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);

    return () => {
      for (const e of events) window.removeEventListener(e, onUse);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [enabled, queryClient, router]);

  return { state, stillHere };
}
