"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { Badge, Card, CardTitle } from "@/components/ui";
import { useTeacherTimetable } from "@/hooks/use-academic";
import { todaysLessons, type LessonState, type TimetableRow } from "@/lib/lessons";
import { classDisplayName } from "@/lib/utils";

const STATE_WORD: Partial<Record<LessonState, string>> = {
  // Said in a word, not by fading the row: faded text is too pale to read.
  done: "Taught",
  now: "Now",
  next: "Next",
};

/**
 * What a teacher has today, and where they are in it.
 *
 * Their home page listed the classes they teach, which they know, and not
 * the one thing that changes every morning: which lesson is next and in
 * which room. Reads the teacher's own week and keeps today's rows.
 *
 * `now` is passed in by tests; the page leaves it to the clock.
 */
export function TodaysLessons({
  teacherId,
  now,
}: {
  teacherId?: string;
  now?: Date;
}) {
  const { data, isLoading, isError } = useTeacherTimetable(teacherId);
  if (!teacherId || isLoading || isError) return null;

  const week: TimetableRow[] = data ?? [];
  const lessons = todaysLessons(week, now);
  const left = lessons.filter((l) => l.state !== "done").length;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden />
          Today&apos;s lessons
        </CardTitle>
        {lessons.length > 0 && (
          <span className="text-sm text-muted">
            {left === 0 ? "All taught" : `${left} to go`}
          </span>
        )}
      </div>

      {lessons.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {week.length === 0
            ? "You have no lessons on the timetable yet."
            : "You have no lessons on the timetable today."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lessons.map(({ row, state }) => (
            <li
              key={row.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                state === "now" ? "border-primary bg-accent-light" : "border-border"
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 text-sm tabular-nums text-foreground-muted">
                  {row.startTime} to {row.endTime}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {row.subject?.name ?? "Lesson"}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {classDisplayName(row.classSection as never)}
                    {row.room ? `, ${row.room}` : ""}
                  </span>
                </span>
              </span>
              {STATE_WORD[state] && (
                <Badge variant={state === "now" ? "success" : "default"}>
                  {STATE_WORD[state]}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/teacher/attendance"
        className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
      >
        Mark the register
      </Link>
    </Card>
  );
}
