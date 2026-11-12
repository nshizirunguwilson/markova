"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { Card, CardTitle } from "@/components/ui";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import { useStudentTermResult } from "@/hooks/use-marks";
import { latestMarks, percent, type MarkRow } from "@/lib/student-home";

/**
 * The marks that came in most recently this term.
 *
 * Says why when there are none to show. The school releases marks when it is
 * ready to and may hold them over unpaid fees; both come back from the API
 * as answers, not refusals, and both would otherwise look like a student
 * with no marks at all.
 */
export function LatestMarks({ studentId }: { studentId?: string }) {
  const { data: years } = useAcademicYears();
  const year = years?.find((y: { isCurrent?: boolean }) => y.isCurrent);
  const { data: terms } = useTerms(year?.id);
  const term = terms?.find((t: { isCurrent?: boolean }) => t.isCurrent);

  const { data, isLoading, isError } = useStudentTermResult(studentId, term?.id);
  if (!studentId || !term || isLoading || isError) return null;

  const marks = latestMarks(data?.marks as MarkRow[] | undefined);
  const held = !!data?.withheld;
  const notOut = !held && data?.published === false;

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" aria-hidden />
        Latest marks
      </CardTitle>

      {held ? (
        <p className="mt-3 text-sm text-muted">
          Your marks for {term.name} are being held. Open My Marks to see why.
        </p>
      ) : notOut ? (
        <p className="mt-3 text-sm text-muted">
          Marks for {term.name} are not out yet.
        </p>
      ) : marks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No marks have come in for {term.name} yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {marks.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {m.subject?.name ?? "Subject"}
                </span>
                <span className="text-xs text-muted">{m.assessmentType?.name}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-foreground">
                {m.score}/{m.maxScore}
                <span className="ml-2 text-xs text-muted">{percent(m.score, m.maxScore)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/student/marks"
        className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
      >
        All my marks
      </Link>
    </Card>
  );
}
