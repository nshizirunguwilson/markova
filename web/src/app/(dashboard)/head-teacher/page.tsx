"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge, Card, CardTitle, PageSpinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useHeadTeacherOverview } from "@/hooks/use-marks";
import { AlertTriangle, ArrowRight, Check, UserX } from "lucide-react";

/**
 * What the Director of Studies opens in the morning.
 *
 * A dashboard is worth building only where a post asks the same question
 * every day and cannot answer it at a glance anywhere else. The bursar has
 * none for exactly that reason - their question is "who has not paid", and
 * the register answers it.
 *
 * The DOS is different. Their day is spent unblocking a pipeline they do not
 * run themselves: subject teachers enter marks, class teachers write
 * comments, and the DOS confirms and issues. The question that starts the
 * day is "what is stuck, and on whom", and today it is genuinely spread
 * across four screens.
 *
 * So the page is that question, answered as a list of classes ordered by
 * whether anything is waiting - and every row names the one thing holding it
 * up and the person it falls to. There is deliberately no chart of pass rates
 * over five years: that is a thing to review once a term with the principal,
 * not at eight in the morning, and it would bury the rows that need doing.
 */

type Blocker =
  | "MARKS_NOT_ENTERED"
  | "MARKS_NOT_RELEASED"
  | "COMMENTS_NOT_WRITTEN"
  | "AWAITING_CONFIRMATION"
  | "AWAITING_ISSUE"
  | "DONE";

interface ClassRow {
  classSectionId: string;
  name: string;
  students: number;
  marksReleased: number;
  commentsWritten: number;
  confirmed: number;
  issued: number;
  subjectsMarked: number;
  subjectsTaught: number;
  average: number | null;
  blocker: Blocker;
  owner: string;
}

/** What is holding a class up, in words rather than as a state name. */
const SAYS: Record<Blocker, string> = {
  MARKS_NOT_ENTERED: "Marks still to be entered",
  MARKS_NOT_RELEASED: "Marks not released yet",
  COMMENTS_NOT_WRITTEN: "Comments still to be written",
  AWAITING_CONFIRMATION: "Waiting on your check",
  AWAITING_ISSUE: "Confirmed, ready to issue",
  DONE: "Issued to families",
};

/**
 * How loudly a row reads.
 *
 * Only the head teacher's own step is coloured as theirs to do. Everything
 * else is somebody else's move, and a page where every row shouts is a page
 * where the row that needs you does not stand out.
 */
const TONE: Record<Blocker, "warning" | "info" | "success" | "default"> = {
  MARKS_NOT_ENTERED: "default",
  MARKS_NOT_RELEASED: "default",
  COMMENTS_NOT_WRITTEN: "default",
  AWAITING_CONFIRMATION: "warning",
  AWAITING_ISSUE: "warning",
  DONE: "success",
};

/** How far a class has come, as the fraction its own blocker is measured on. */
function progressOf(c: ClassRow): { done: number; of: number } {
  switch (c.blocker) {
    case "MARKS_NOT_ENTERED":
      return { done: c.subjectsMarked, of: c.subjectsTaught };
    case "MARKS_NOT_RELEASED":
      return { done: c.marksReleased, of: c.students };
    case "COMMENTS_NOT_WRITTEN":
      return { done: c.commentsWritten, of: c.students };
    case "AWAITING_CONFIRMATION":
      return { done: c.confirmed, of: c.students };
    case "AWAITING_ISSUE":
      return { done: c.issued, of: c.students };
    default:
      return { done: c.students, of: c.students };
  }
}

export default function HeadTeacherPage() {
  const { data, isLoading, isError } = useHeadTeacherOverview();

  const classes: ClassRow[] = useMemo(() => data?.classes ?? [], [data]);

  /*
    Ordered by whether anything is waiting, and the head teacher's own step
    first inside that. A dashboard sorted alphabetically is a list; sorted by
    what needs doing, it is a queue.
  */
  const ordered = useMemo(() => {
    const rank: Record<Blocker, number> = {
      AWAITING_CONFIRMATION: 0,
      COMMENTS_NOT_WRITTEN: 1,
      MARKS_NOT_ENTERED: 2,
      MARKS_NOT_RELEASED: 3,
      AWAITING_ISSUE: 4,
      DONE: 5,
    };
    return [...classes].sort(
      (a, b) => rank[a.blocker] - rank[b.blocker] || a.name.localeCompare(b.name),
    );
  }, [classes]);

  const mine = classes.filter((c) => c.blocker === "AWAITING_CONFIRMATION");
  const done = classes.filter((c) => c.blocker === "DONE");
  const staff = data?.staff;

  if (isLoading) return <PageSpinner />;

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Academic overview" />
        <Card>
          <p className="py-10 text-center text-sm text-muted">
            This could not be loaded. Try again in a moment.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic overview"
        description={
          data.term
            ? `${data.term.name}, ${data.term.academicYear}`
            : "No term is running"
        }
      />

      {/* The two things with a deadline attached today. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wider text-muted">
            Waiting on your check
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
            {mine.length}
          </p>
          <p className="mt-1 text-sm text-muted">
            {mine.length === 0
              ? `Nothing is waiting on you. ${done.length} of ${classes.length} classes are issued.`
              : `${mine.length === 1 ? "One class has" : `${mine.length} classes have`} every comment written and need reading before you can issue them.`}
          </p>
          {mine.length > 0 && (
            <Link
              href="/admin/report-cards"
              className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              Open the report cards <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          )}
        </Card>

        {/*
          The one figure here with a deadline in minutes rather than days: a
          class whose teacher is absent needs cover before the first lesson.
        */}
        <Card>
          <p className="text-xs uppercase tracking-wider text-muted">
            Staff today
          </p>
          {!staff?.taken ? (
            <>
              <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-warning">
                <AlertTriangle className="h-5 w-5" /> Register not taken
              </p>
              <p className="mt-1 text-sm text-muted">
                Nobody has marked the staff register this morning, so who is in
                is not yet known.
              </p>
            </>
          ) : staff.absent === 0 ? (
            <>
              <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                {staff.present}
              </p>
              <p className="mt-1 text-sm text-muted">
                Everybody marked is in. No cover needed.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 flex items-center gap-2 text-3xl font-bold tabular-nums text-danger">
                <UserX className="h-6 w-6" />
                {staff.absent}
              </p>
              {/* Named, not counted: "3 absent" is a number, three names are
                  something a head teacher can act on without another page. */}
              <p className="mt-1 text-sm text-foreground-muted">
                {staff.absentToday
                  .map(
                    (a: { name: string; status: string }) =>
                      `${a.name} (${a.status.toLowerCase()})`,
                  )
                  .join(", ")}
              </p>
            </>
          )}
        </Card>
      </div>

      <Card padding="sm">
        <CardTitle className="mb-1 text-base">Where each class is</CardTitle>
        <p className="mb-4 text-sm text-muted">
          The one thing holding each class up, and whose move it is. Ordered by
          what needs doing rather than by name.
        </p>

        {ordered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No classes have been set up yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {ordered.map((c) => {
              const { done: at, of } = progressOf(c);
              return (
                <li
                  key={c.classSectionId}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                >
                  <div className="min-w-[9rem]">
                    <p className="text-sm font-medium text-foreground">
                      {c.name}
                    </p>
                    <p className="text-xs text-muted">
                      {c.students} student{c.students === 1 ? "" : "s"}
                      {c.average != null && ` · ${c.average}% average`}
                    </p>
                  </div>

                  <div className="min-w-[11rem] flex-1">
                    <p className="text-sm text-foreground-muted">
                      {SAYS[c.blocker]}
                    </p>
                    {c.blocker !== "DONE" && of > 0 && (
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((at / of) * 100)}%` }}
                        />
                      </div>
                    )}
                    {c.blocker !== "DONE" && of > 0 && (
                      <p className="mt-1 font-mono text-xs text-muted">
                        {at} of {of}
                      </p>
                    )}
                  </div>

                  <Badge variant={TONE[c.blocker]}>
                    {c.blocker === "DONE" ? (
                      <>
                        <Check className="mr-1 h-3 w-3" /> Issued
                      </>
                    ) : (
                      c.owner
                    )}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
