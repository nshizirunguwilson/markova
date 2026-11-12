/*
  What a student's home page shows first: the work that is coming due and
  the marks that came in last. Both are picked out of lists the student's
  own pages already load; nothing here asks the API for anything new.
*/

export interface Work {
  id: string;
  title: string;
  dueDate: string;
  subject?: { name?: string } | null;
  submission?: unknown | null;
}

export interface MarkRow {
  id: string;
  score: number;
  maxScore: number;
  createdAt?: string;
  updatedAt?: string;
  subject?: { name?: string } | null;
  assessmentType?: { name?: string } | null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days from today to the day something is due. 0 is today. */
export function daysUntil(dueDate: string, now: Date = new Date()): number {
  const due = startOfDay(new Date(dueDate)).getTime();
  return Math.round((due - startOfDay(now).getTime()) / 86_400_000);
}

/** "Due today", "Due tomorrow", "Due in 4 days", "Due Thu 19 Nov". */
export function dueWord(dueDate: string, now: Date = new Date()): string {
  const days = daysUntil(dueDate, now);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1 && days < 7) return `Due in ${days} days`;
  return `Due ${new Date(dueDate).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })}`;
}

/**
 * Work not handed in yet: what is still to come, soonest first, and how
 * much is already late. Work that was handed in is finished, whenever it
 * was due.
 */
export function workDue(
  homeworks: Work[] | undefined,
  now: Date = new Date(),
): { coming: Work[]; late: number } {
  const open = (homeworks ?? []).filter((hw) => !hw.submission);
  const coming = open
    .filter((hw) => daysUntil(hw.dueDate, now) >= 0)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  return { coming, late: open.length - coming.length };
}

/** The marks that came in most recently, newest first. */
export function latestMarks(marks: MarkRow[] | undefined, howMany = 5): MarkRow[] {
  const when = (m: MarkRow) => new Date(m.updatedAt ?? m.createdAt ?? 0).getTime();
  return [...(marks ?? [])].sort((a, b) => when(b) - when(a)).slice(0, howMany);
}

/** 34 out of 40 as "85%". Nothing for a mark out of nothing. */
export function percent(score: number, maxScore: number): string {
  return maxScore > 0 ? `${Math.round((score / maxScore) * 100)}%` : "";
}
