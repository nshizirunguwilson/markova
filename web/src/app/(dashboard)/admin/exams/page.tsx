"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";

import {
  Button,
  Card,
  CardTitle,
  Modal,
  PageSpinner,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import {
  useAcademicYears,
  useSections,
  useSubjects,
} from "@/hooks/use-academic";
import { useCreateExam, useDeleteExam, useExams, useUpdateExam, type ExamEntry } from "@/hooks/use-exams";
import { classDisplayName } from "@/lib/utils";

/**
 * The exam timetable.
 *
 * The endpoints have existed since the academic module was written and nothing
 * called them, so a school could store a timetable and no student could ever
 * see it. This is the screen that makes them reachable.
 *
 * Grouped by day rather than listed flat, because that is the question being
 * asked: not "how many exams are there" but "what is on Tuesday, and is
 * anything clashing". A flat list of twenty rows sorted by date makes a reader
 * do that grouping in their head.
 */

const DAY = { weekday: "long", day: "numeric", month: "long" } as const;

/** Two exams for one class at the same time is a mistake somebody must see. */
function clashesIn(exams: ExamEntry[]): Set<string> {
  const clashing = new Set<string>();
  for (const a of exams) {
    for (const b of exams) {
      if (a.id === b.id) continue;
      if (a.examDate !== b.examDate) continue;
      /* Overlapping rather than identical: an exam from 08:00 to 10:00 and one
         from 09:00 to 11:00 is just as impossible as two at 08:00. */
      if (a.startTime < b.endTime && b.startTime < a.endTime) {
        clashing.add(a.id);
        clashing.add(b.id);
      }
    }
  }
  return clashing;
}

export default function ExamsPage() {
  const [classSectionId, setClassSectionId] = useState("");
  const [termId, setTermId] = useState("");
  const [editing, setEditing] = useState<ExamEntry | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: years } = useAcademicYears();
  const { data: sections } = useSections();
  const { data: subjects } = useSubjects();
  const { data: exams, isLoading } = useExams(classSectionId, termId);

  const createExam = useCreateExam();
  const updateExam = useUpdateExam();
  const deleteExam = useDeleteExam();

  const terms = useMemo(
    () => (years ?? []).flatMap((y: any) => y.terms ?? []),
    [years],
  );

  /* Grouped by day, in date order. The question is "what is on Tuesday", not
     "how many exams are there". */
  const byDay = useMemo(() => {
    const groups = new Map<string, ExamEntry[]>();
    for (const exam of exams ?? []) {
      const day = exam.examDate.slice(0, 10);
      groups.set(day, [...(groups.get(day) ?? []), exam]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, list]) => [
        day,
        [...list].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      ] as const);
  }, [exams]);

  const clashing = useMemo(() => clashesIn(exams ?? []), [exams]);
  const chosen = Boolean(classSectionId && termId);

  const save = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const body = {
      classSectionId,
      termId,
      subjectId: String(data.get("subjectId")),
      examDate: String(data.get("examDate")),
      startTime: String(data.get("startTime")),
      endTime: String(data.get("endTime")),
      room: String(data.get("room") || "") || undefined,
      syllabus: String(data.get("syllabus") || "") || undefined,
    };
    if (editing) {
      updateExam.mutate({ id: editing.id, ...body }, { onSuccess: () => setEditing(null) });
    } else {
      createExam.mutate(body, { onSuccess: () => setAdding(false) });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam timetable"
        description="When each paper is sat, and where"
      />

      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="exam-class" className="mb-1 block text-xs font-medium text-muted">
              Class
            </label>
            <select
              id="exam-class"
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
              className="rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            >
              <option value="">Pick a class</option>
              {(sections ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {classDisplayName(s)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="exam-term" className="mb-1 block text-xs font-medium text-muted">
              Term
            </label>
            <select
              id="exam-term"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            >
              <option value="">Pick a term</option>
              {terms.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {chosen && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add an exam
            </Button>
          )}
        </div>
      </Card>

      {!chosen ? (
        <Card>
          <div className="py-14 text-center">
            <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted opacity-40" />
            <p className="text-sm text-muted">
              Pick a class and a term to see its exam timetable.
            </p>
          </div>
        </Card>
      ) : isLoading ? (
        <PageSpinner />
      ) : byDay.length === 0 ? (
        <Card>
          <div className="py-14 text-center">
            <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted opacity-40" />
            <p className="text-sm text-muted">
              No exams have been timetabled for this class yet.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {clashing.size > 0 && (
            /* Two papers at once for one class cannot be sat, and it is the
               kind of mistake that is invisible in a flat list. */
            <div className="rounded-xl border border-danger/30 bg-danger-wash px-4 py-3 text-sm text-foreground">
              Two papers overlap for this class. They are marked below.
            </div>
          )}

          {byDay.map(([day, list]) => (
            <Card key={day} padding="sm">
              <CardTitle className="mb-3 text-base">
                {new Date(day).toLocaleDateString(undefined, DAY)}
              </CardTitle>
              <ul className="divide-y divide-border">
                {list.map((exam) => (
                  <li
                    key={exam.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                  >
                    <span className="w-28 shrink-0 font-mono text-sm tabular-nums text-foreground">
                      {exam.startTime} to {exam.endTime}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">
                        {exam.subject?.name ?? "A subject"}
                      </span>
                      {exam.room && (
                        <span className="ml-2 text-sm text-muted">{exam.room}</span>
                      )}
                      {exam.syllabus && (
                        <span className="block text-xs text-muted">
                          {exam.syllabus}
                        </span>
                      )}
                    </span>
                    {clashing.has(exam.id) && (
                      <span className="rounded-full bg-danger-wash px-2 py-0.5 text-xs font-medium text-danger">
                        Overlaps
                      </span>
                    )}
                    <span className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${exam.subject?.name ?? "this exam"}`}
                        onClick={() => setEditing(exam)}
                        className="rounded-lg p-2 text-muted hover:bg-accent-light hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${exam.subject?.name ?? "this exam"}`}
                        onClick={() => deleteExam.mutate(exam.id)}
                        className="rounded-lg p-2 text-danger hover:bg-danger-wash"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={adding || editing !== null}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        title={editing ? "Edit this exam" : "Add an exam"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(e.currentTarget);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="subjectId" className="mb-1 block text-sm font-medium text-foreground">
              Subject
            </label>
            <select
              id="subjectId"
              name="subjectId"
              required
              defaultValue={editing?.subjectId ?? ""}
              className="w-full rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            >
              <option value="">Pick a subject</option>
              {(subjects ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="examDate" className="mb-1 block text-sm font-medium text-foreground">
              Date
            </label>
            <input
              id="examDate"
              name="examDate"
              type="date"
              required
              defaultValue={editing?.examDate?.slice(0, 10) ?? ""}
              className="w-full rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="startTime" className="mb-1 block text-sm font-medium text-foreground">
                Starts
              </label>
              <input
                id="startTime"
                name="startTime"
                type="time"
                required
                defaultValue={editing?.startTime ?? "08:00"}
                className="w-full rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label htmlFor="endTime" className="mb-1 block text-sm font-medium text-foreground">
                Ends
              </label>
              <input
                id="endTime"
                name="endTime"
                type="time"
                required
                defaultValue={editing?.endTime ?? "10:00"}
                className="w-full rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>

          <div>
            <label htmlFor="room" className="mb-1 block text-sm font-medium text-foreground">
              Room <span className="text-muted">(optional)</span>
            </label>
            <input
              id="room"
              name="room"
              defaultValue={editing?.room ?? ""}
              placeholder="Hall A"
              className="w-full rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label htmlFor="syllabus" className="mb-1 block text-sm font-medium text-foreground">
              What it covers <span className="text-muted">(optional)</span>
            </label>
            <input
              id="syllabus"
              name="syllabus"
              defaultValue={editing?.syllabus ?? ""}
              placeholder="Chapters 1 to 5"
              className="w-full rounded-lg border border-border-input bg-field px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={createExam.isPending || updateExam.isPending}
            >
              {editing ? "Save" : "Add it"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
