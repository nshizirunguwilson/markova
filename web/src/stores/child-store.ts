import { create } from "zustand";

/**
 * The child a parent is looking at.
 *
 * Each parent page used to keep its own choice and start again from the
 * first child, so a parent who picked their second child on Marks and then
 * opened Attendance was shown the first one's register without being told.
 * The choice now lives here, once, and every page reads it.
 *
 * Held in memory only: it lasts while the parent moves around the app and is
 * gone on a reload, so nothing about a child is left in the browser. A page
 * checks the id against the signed-in parent's own children before using it
 * (`useChosenChild`), so one left by the last person to sign in is ignored.
 */
interface ChildState {
  childId: string | null;
  choose: (id: string) => void;
  forget: () => void;
}

export const useChildStore = create<ChildState>((set) => ({
  childId: null,
  choose: (childId) => set({ childId }),
  forget: () => set({ childId: null }),
}));
