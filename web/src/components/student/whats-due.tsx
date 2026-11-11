"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";

import { Card, CardTitle } from "@/components/ui";
import { useStudentHomework } from "@/hooks/use-homework";
import { dueWord, workDue, type Work } from "@/lib/student-home";

/**
 * The work a student still has to hand in, soonest first.
 *
 * Their home page showed conduct and library books and not the one list a
 * student opens the app for. Late work is counted apart: it is not "due",
 * it is overdue, and the student should be told so in as many words.
 */
export function WhatsDue({
  studentId,
  classSectionId,
  now,
}: {
  studentId?: string;
  classSectionId?: string;
  now?: Date;
}) {
  const { data, isLoading, isError } = useStudentHomework(studentId, classSectionId);
  if (!studentId || !classSectionId || isLoading || isError) return null;

  const { coming, late } = workDue(data as Work[] | undefined, now);

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" aria-hidden />
        What is due
      </CardTitle>

      {coming.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {late > 0 ? "Nothing new is due." : "Nothing is due. You are up to date."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {coming.slice(0, 5).map((hw) => (
            <li
              key={hw.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {hw.title}
                </span>
                <span className="text-xs text-muted">{hw.subject?.name}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-muted">
                {dueWord(hw.dueDate, now)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {coming.length > 5 && (
        <p className="mt-2 text-xs text-muted">and {coming.length - 5} more</p>
      )}
      {late > 0 && (
        <p className="mt-3 text-sm font-medium text-danger">
          {late === 1
            ? "1 piece of work is late and not handed in."
            : `${late} pieces of work are late and not handed in.`}
        </p>
      )}

      <Link
        href="/student/homework"
        className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
      >
        Open my work
      </Link>
    </Card>
  );
}
