"use client";

import Link from "next/link";
import { UserX } from "lucide-react";

import { Badge, Card, CardTitle } from "@/components/ui";
import { useChronicallyAbsent } from "@/hooks/use-attendance";

interface AbsentStudent {
  studentId: string;
  name: string;
  class: string;
  absentDays: number;
  totalDays: number;
  absenceRate: number;
}

/**
 * The pupils in a teacher's own classes who are sliding into absence.
 *
 * The Director of Studies saw this list and could alert the families; the
 * teacher, who sees the child every day and is the first to be able to ask
 * why, was told nothing. The API narrows it to the classes they teach or
 * lead. Says so plainly when nobody is over the line: an empty card would
 * read as a card that failed to load.
 */
export function AbsenceWatch() {
  const { data, isLoading, isError } = useChronicallyAbsent();
  if (isLoading || isError) return null;

  const students: AbsentStudent[] = data?.students ?? [];
  const threshold: number = data?.threshold ?? 20;

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <UserX className="h-5 w-5 text-primary" aria-hidden />
        Absent too often
      </CardTitle>
      {students.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Nobody in your classes has missed {threshold}% of school days or more.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            In your classes, absent {threshold}% of school days or more. The
            Director of Studies writes to their families.
          </p>
          <ul className="mt-3 space-y-2">
            {students.slice(0, 6).map((s) => (
              <li
                key={s.studentId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {s.name}
                  </span>
                  <span className="text-xs text-muted">
                    {s.class} · {s.absentDays} of {s.totalDays} days
                  </span>
                </span>
                <Badge variant={s.absenceRate >= 40 ? "danger" : "warning"}>
                  {s.absenceRate}%
                </Badge>
              </li>
            ))}
          </ul>
          {students.length > 6 && (
            <p className="mt-2 text-xs text-muted">+{students.length - 6} more</p>
          )}
          <Link
            href="/teacher/attendance"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            Open the register
          </Link>
        </>
      )}
    </Card>
  );
}
