"use client";

import { Accessibility } from "lucide-react";

/**
 * A student's exam arrangements, beside their name on a class list (B7).
 * What to do, never why: "25% extra time, Large print".
 */
export function ExamHelp({ arrangements }: { arrangements?: string[] }) {
  if (!arrangements?.length) return null;
  const words = arrangements.join(", ");
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 align-middle text-[0.6875rem] font-medium text-foreground"
      title={`In tests and exams: ${words}`}
      data-testid="exam-help"
    >
      <Accessibility aria-hidden="true" className="h-3 w-3" />
      <span className="sr-only">In tests and exams: </span>
      {words}
    </span>
  );
}
