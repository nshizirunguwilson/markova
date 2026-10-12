"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import { Button, Card, Spinner } from "@/components/ui";
import { useExamSheet } from "@/hooks/use-support";
import { dayWords } from "@/lib/standing";

/**
 * The sheet an invigilator takes into one exam (B7): who needs what, and how
 * much extra time in minutes, for this exam's length. Names and what to do,
 * never why. Printed on its own page.
 */
export default function ExamArrangementsSheet() {
  const params = useParams();
  const examId = String(params?.id ?? "");
  const { data, isLoading } = useExamSheet(examId);

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  const { exam, students } = data as {
    exam: {
      subject: string;
      class: string;
      term: string;
      examDate: string;
      startTime: string;
      endTime: string;
      room: string | null;
    };
    students: {
      studentId: string;
      name: string;
      studentIdNumber: string;
      arrangements: string[];
      extraMinutes: number | null;
    }[];
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/admin/exams"
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Exam timetable
        </Link>
        <Button onClick={() => window.print()} disabled={students.length === 0}>
          <Printer className="mr-1 h-4 w-4" aria-hidden="true" /> Print
        </Button>
      </div>

      <Card className="print:border-0 print:shadow-none" data-testid="exam-sheet">
        <h1 className="text-xl font-bold text-foreground">
          {exam.subject}: exam arrangements
        </h1>
        <p className="mt-1 text-sm text-muted">
          {exam.class} · {exam.term} · {dayWords(exam.examDate)}, {exam.startTime} to{" "}
          {exam.endTime}
          {exam.room ? ` · ${exam.room}` : ""}
        </p>

        {students.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            No student in this class has arrangements for exams.
          </p>
        ) : (
          <table className="mt-6 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="py-2 pr-4 font-medium">Student</th>
                <th className="py-2 pr-4 font-medium">What to do</th>
                <th className="py-2 font-medium">Extra time</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.studentId} className="border-b border-border align-top">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="block font-mono text-xs text-muted">{s.studentIdNumber}</span>
                  </td>
                  <td className="py-2 pr-4 text-foreground">{s.arrangements.join(", ")}</td>
                  <td className="py-2 text-foreground">
                    {s.extraMinutes ? `${s.extraMinutes} minutes` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-6 text-xs text-muted">
          From the students&apos; support plans. Why each student needs this is kept by the
          Director of Studies and the nurse.
        </p>
      </Card>
    </div>
  );
}
