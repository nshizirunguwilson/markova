"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Modal,
  PageSpinner,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useAcademicYears, useTerms } from "@/hooks/use-academic";
import {
  useCommentClasses,
  useConfirmReportCards,
  useSuggestComments,
  useTermResults,
  useUpdateTermResultComment,
} from "@/hooks/use-marks";
import { A4Preview } from "@/components/a4-preview";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Sparkles,
  Undo2,
} from "lucide-react";

/**
 * The report cards for one class, and everybody who works on them.
 *
 * A report card passes through four hands, and until now each of them worked
 * somewhere else: marks on one screen, comments nowhere at all, issuing on a
 * third. Nobody could see whether a class was ready, because "ready" is a
 * fact about all four steps at once.
 *
 * So this is one screen, shared by the three people who touch a card, each
 * seeing only what is theirs to do:
 *
 *   The class teacher writes the comment about the work.
 *   The head teacher writes theirs, then confirms the class.
 *   The DOS issues, which the marks page still does.
 *
 * They share it rather than each holding a copy, because the failure this
 * replaces is precisely two people disagreeing about whether a class is
 * finished. The strip at the top is the pipeline in order, so the sequence on
 * screen is the sequence in the building.
 */

type Result = {
  id: string;
  rank: number | null;
  average: number | null;
  letterGrade: string | null;
  isPublished: boolean;
  reportCardPublished: boolean;
  dosConfirmed: boolean;
  teacherComment: string | null;
  headmasterComment: string | null;
  student?: {
    id: string;
    user?: { firstName?: string; lastName?: string };
  };
};

const nameOf = (r: Result) =>
  `${r.student?.user?.firstName ?? ""} ${r.student?.user?.lastName ?? ""}`.trim() ||
  "Unnamed student";

/** One step of the pipeline, as a reader moves left to right through it. */
function Step({
  n,
  label,
  state,
  done,
  blocked,
}: {
  n: number;
  label: string;
  state: string;
  done: boolean;
  blocked?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done
            ? "bg-success text-white"
            : blocked
              ? "bg-surface-muted text-muted"
              : "bg-primary text-on-primary"
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{state}</p>
      </div>
    </div>
  );
}

export default function ReportCardsPage() {
  const { user } = useAuthStore();
  const role = user?.role;
  /*
    Who may write in which box. The head teacher does not write the class
    teacher's comment and the class teacher does not write the head
    teacher's, which is the whole reason a card carries two of them: two
    people saying the same thing in two hands is one opinion, not a check.
  */
  const mayWriteTeacher = role === "TEACHER" || role === "ADMIN";
  const mayWriteHead = role === "HEAD_TEACHER" || role === "ADMIN";
  const mayConfirm = role === "HEAD_TEACHER" || role === "ADMIN";

  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: { isCurrent?: boolean }) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);

  /*
    The classes this person may actually write on, asked for rather than
    filtered here: a class teacher leads one class, and offering them
    twenty-eight in a picker that then refuses twenty-seven of them is a
    screen that teaches people the system is broken.

    It also collapses two selects into one. A level picker existed to make a
    list of twenty-eight manageable; a list of one does not need narrowing.
  */
  const { data: classes } = useCommentClasses();
  const [sectionChoice, setSection] = useState("");
  const [termChoice, setTerm] = useState("");
  const term =
    termChoice ||
    terms?.find((t: { isCurrent?: boolean }) => t.isCurrent)?.id ||
    "";

  /* One class to choose from is not a choice. Picked for them, so the page
     opens on the work rather than on a dropdown with a single option. */
  const only = classes?.length === 1 ? classes[0].id : "";
  const section = sectionChoice || only;

  const { data, isLoading } = useTermResults(section, term);
  const results: Result[] = useMemo(() => data ?? [], [data]);

  const save = useUpdateTermResultComment();
  const confirm = useConfirmReportCards();
  const suggest = useSuggestComments();

  /* The box being edited, keyed by result and by which of the two it is. A
     single open editor rather than sixty: thirty rows of two textareas is a
     page nobody can find their place on. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [handingBack, setHandingBack] = useState(false);

  /*
    The card itself, without leaving the page.

    Somebody writing thirty comments is reading thirty sheets, and the sheet
    is where the facts are: which subject fell away, whether the conduct mark
    explains the average. Sending them to another screen and back for each one
    is what makes a comment get written from the average alone.
  */
  const [previewing, setPreviewing] = useState<{
    name: string;
    html: string;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);

  const preview = async (r: Result) => {
    const studentId = r.student?.id;
    if (!studentId || !term) return;
    setLoadingPreview(r.id);
    try {
      const res = await api.get(`/reports/term/${studentId}/html`, {
        params: { termId: term },
      });
      setPreviewing({ name: nameOf(r), html: res.data });
    } catch {
      toast.error("That report card could not be loaded");
    } finally {
      setLoadingPreview(null);
    }
  };

  const counts = useMemo(() => {
    const total = results.length;
    return {
      total,
      marksOut: results.filter((r) => r.isPublished).length,
      written: results.filter((r) => (r.teacherComment ?? "").trim()).length,
      headWritten: results.filter((r) => (r.headmasterComment ?? "").trim())
        .length,
      confirmed: results.filter((r) => r.dosConfirmed).length,
      issued: results.filter((r) => r.reportCardPublished).length,
    };
  }, [results]);

  const all = (n: number) => counts.total > 0 && n === counts.total;

  const open = (r: Result, which: "teacher" | "head") => {
    setEditing(`${r.id}:${which}`);
    setDraft((which === "teacher" ? r.teacherComment : r.headmasterComment) ?? "");
  };

  const commit = (r: Result, which: "teacher" | "head") => {
    save.mutate(
      {
        id: r.id,
        ...(which === "teacher"
          ? { teacherComment: draft.trim() }
          : { headmasterComment: draft.trim() }),
      },
      { onSuccess: () => setEditing(null) },
    );
  };

  const drawUp = async (r: Result, which: "teacher" | "head") => {
    const studentId = r.student?.id;
    if (!studentId || !term) return;
    const both = await suggest.mutateAsync({ studentId, termId: term });
    setDraft(which === "teacher" ? both.classTeacher : both.headTeacher);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report cards"
        description="Write the comments, then confirm the class before the cards go out"
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="rc-section"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Class
            </label>
            <select
              id="rc-section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {/* No placeholder where there is only one class: a choice of
                  one is not a choice, and the page opens on the work. */}
              {classes && classes.length !== 1 && (
                <option value="">Select class...</option>
              )}
              {classes?.map(
                (c: {
                  id: string;
                  name: string;
                  classLevel?: { name?: string };
                  trade?: { code?: string } | null;
                }) => (
                  <option key={c.id} value={c.id}>
                    {[c.classLevel?.name, c.trade?.code, c.name]
                      .filter(Boolean)
                      .join(" ")}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <label
              htmlFor="rc-term"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Term
            </label>
            <select
              id="rc-term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {terms?.map((t: { id: string; name: string }) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {!section && (
        <Card>
          <p className="py-10 text-center text-sm text-muted">
            Pick a class to see the cards waiting on it.
          </p>
        </Card>
      )}

      {section && isLoading && <PageSpinner />}

      {section && !isLoading && results.length === 0 && (
        <Card>
          <p className="py-10 text-center text-sm text-muted">
            No results have been worked out for this class this term yet.
          </p>
        </Card>
      )}

      {section && !isLoading && results.length > 0 && (
        <>
          {/* The pipeline, in the order it actually happens. */}
          <Card padding="sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Step
                n={1}
                label="Marks"
                done={all(counts.marksOut)}
                state={
                  all(counts.marksOut)
                    ? "Released"
                    : `${counts.marksOut} of ${counts.total} released`
                }
              />
              <Step
                n={2}
                label="Class teacher"
                done={all(counts.written)}
                blocked={!all(counts.marksOut)}
                state={`${counts.written} of ${counts.total} written`}
              />
              <Step
                n={3}
                label="Head teacher"
                done={all(counts.confirmed)}
                blocked={!all(counts.written)}
                state={
                  all(counts.confirmed)
                    ? "Confirmed"
                    : `${counts.headWritten} of ${counts.total} written`
                }
              />
              <Step
                n={4}
                label="Issued"
                done={all(counts.issued)}
                blocked={!all(counts.confirmed)}
                state={
                  all(counts.issued)
                    ? "Issued to families"
                    : `${counts.issued} of ${counts.total} issued`
                }
              />
            </div>
          </Card>

          {mayConfirm && (
            <Card padding="sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {/*
                    Whose move it actually is. This said "waiting on your
                    check" whatever the state, so a class with ten comments
                    still to write told the DOS it was waiting on them, when
                    they are the one person who cannot write those comments.
                  */}
                  <p className="text-sm font-medium text-foreground">
                    {all(counts.confirmed)
                      ? "You have confirmed this class."
                      : all(counts.written)
                        ? "This class is waiting on your check."
                        : "This class is waiting on the class teacher."}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {all(counts.confirmed)
                      ? "You can issue these cards now. Handing them back withdraws any that have already gone out."
                      : all(counts.written)
                        ? "Confirming says you have read these cards and stand behind them. Issuing them is the next step."
                        : `${counts.total - counts.written} of ${counts.total} cards still need the class teacher's comment. Only they can write it.`}
                  </p>
                </div>
                {all(counts.confirmed) ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setHandingBack(true)}
                    isLoading={confirm.isPending}
                  >
                    <Undo2 className="mr-1.5 h-4 w-4" /> Hand back
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={!all(counts.written)}
                    title={
                      all(counts.written)
                        ? undefined
                        : "Every card needs the class teacher's comment first"
                    }
                    isLoading={confirm.isPending}
                    onClick={() =>
                      confirm.mutate({
                        classSectionId: section,
                        termId: term,
                        isConfirmed: true,
                      })
                    }
                  >
                    <ClipboardCheck className="mr-1.5 h-4 w-4" /> Confirm the
                    class
                  </Button>
                )}
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {results.map((r) => {
              const teacherKey = `${r.id}:teacher`;
              const headKey = `${r.id}:head`;
              return (
                <Card key={r.id} padding="sm">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <CardTitle className="mr-auto text-base">
                      {nameOf(r)}
                    </CardTitle>
                    {r.average != null && (
                      <span className="font-mono text-xs text-muted">
                        {r.average.toFixed(1)}%
                        {r.letterGrade ? ` · ${r.letterGrade}` : ""}
                        {r.rank ? ` · ${r.rank} of ${counts.total}` : ""}
                      </span>
                    )}
                    {r.dosConfirmed && (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Confirmed
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      isLoading={loadingPreview === r.id}
                      onClick={() => preview(r)}
                      aria-label={`View ${nameOf(r)}'s report card`}
                    >
                      <Eye className="mr-1.5 h-4 w-4" /> View card
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <CommentBox
                      title="Class teacher's comment"
                      value={r.teacherComment}
                      editable={mayWriteTeacher && !r.dosConfirmed}
                      lockedWhy={
                        r.dosConfirmed
                          ? "Confirmed by the head teacher. Ask for it to be handed back to change this."
                          : "Only the class teacher writes here."
                      }
                      open={editing === teacherKey}
                      draft={draft}
                      onDraft={setDraft}
                      onOpen={() => open(r, "teacher")}
                      onCancel={() => setEditing(null)}
                      onSave={() => commit(r, "teacher")}
                      onSuggest={() => drawUp(r, "teacher")}
                      saving={save.isPending}
                      drafting={suggest.isPending}
                    />
                    <CommentBox
                      title="Head teacher's comment"
                      value={r.headmasterComment}
                      editable={mayWriteHead}
                      lockedWhy="Only the head teacher writes here."
                      open={editing === headKey}
                      draft={draft}
                      onDraft={setDraft}
                      onOpen={() => open(r, "head")}
                      onCancel={() => setEditing(null)}
                      onSave={() => commit(r, "head")}
                      onSuggest={() => drawUp(r, "head")}
                      saving={save.isPending}
                      drafting={suggest.isPending}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* The sheet as it will be printed, scaled to fit, in an iframe of its
          own because it carries its own global styles. */}
      <Modal
        isOpen={!!previewing}
        onClose={() => setPreviewing(null)}
        title={previewing ? `Report card, ${previewing.name}` : "Report card"}
        size="lg"
      >
        <div className="max-h-[72vh] overflow-y-auto rounded-lg border border-border bg-accent-light/40 p-3">
          {previewing && (
            <A4Preview html={previewing.html} title="Report card preview" />
          )}
        </div>
      </Modal>

      <Modal
        isOpen={handingBack}
        onClose={() => setHandingBack(false)}
        title="Hand this class back?"
      >
        <p className="text-sm text-muted">
          The class teacher will be able to change the comments again, and any
          report card already issued for this class is withdrawn. Families who
          have opened one will no longer be able to.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setHandingBack(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={confirm.isPending}
            onClick={() =>
              confirm.mutate(
                {
                  classSectionId: section,
                  termId: term,
                  isConfirmed: false,
                },
                { onSuccess: () => setHandingBack(false) },
              )
            }
          >
            Hand back
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * One comment, read or written.
 *
 * The draft button sits inside the editor rather than beside the box,
 * because a suggestion is something you ask for while writing, not an
 * alternative to opening the box. It fills the field and nothing else: the
 * text is edited and saved by the person whose name goes under it, exactly
 * the way the suggested email address in the user wizard fills a field
 * nobody is obliged to keep.
 */
function CommentBox({
  title,
  value,
  editable,
  lockedWhy,
  open,
  draft,
  onDraft,
  onOpen,
  onCancel,
  onSave,
  onSuggest,
  saving,
  drafting,
}: {
  title: string;
  value: string | null;
  editable: boolean;
  lockedWhy: string;
  open: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onOpen: () => void;
  onCancel: () => void;
  onSave: () => void;
  onSuggest: () => void;
  saving: boolean;
  drafting: boolean;
}) {
  const written = (value ?? "").trim();

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-muted">{title}</p>
        {!open && editable && (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            {written ? "Edit" : "Write"}
          </Button>
        )}
      </div>

      {open ? (
        <>
          <label className="sr-only" htmlFor={`draft-${title}`}>
            {title}
          </label>
          <textarea
            id={`draft-${title}`}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Write about this child's term..."
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSuggest}
              isLoading={drafting}
              title="Draft one from this child's marks. You can edit every word of it."
            >
              <Sparkles className="mr-1.5 h-4 w-4" /> Suggest
            </Button>
            <span className="mr-auto text-xs text-muted">
              A suggestion is a draft. Nothing is saved until you save it.
            </span>
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} isLoading={saving}>
              Save
            </Button>
          </div>
        </>
      ) : written ? (
        <p className="text-sm text-foreground">{written}</p>
      ) : (
        <p className="text-sm text-muted">
          {editable ? "Nothing written yet." : lockedWhy}
        </p>
      )}
    </div>
  );
}
