"use client";

import { useState } from "react";
import { Accessibility } from "lucide-react";

import { Button, Card, CardTitle, Input, Modal } from "@/components/ui";
import {
  ARRANGEMENTS,
  NEEDS,
  useRemoveSupportPlan,
  useSaveSupportPlan,
  useSupportPlan,
  type WholePlan,
} from "@/hooks/use-support";
import { dayWords } from "@/lib/standing";

/**
 * A student's support plan (B7 in docs/STUDENT-LIFE-DESIGN.md).
 *
 * The Director of Studies and the nurse keep it; the principal and the family
 * read it; a teacher is told only what to do in their exams. The API decides
 * how much each sees, and this shows whatever it sent.
 */
export function SupportPlanCard({
  studentId,
  name,
  hideWhenEmpty = false,
}: {
  studentId: string;
  name: string;
  /** For a family or the student: nothing to say when there is no plan. */
  hideWhenEmpty?: boolean;
}) {
  const { data, isLoading, isError } = useSupportPlan(studentId);
  const [editing, setEditing] = useState(false);

  if (isLoading || isError || !data) return null;
  if (hideWhenEmpty && !data.plan) return null;
  const plan = data.plan;
  const whole = plan && "needWords" in plan ? (plan as WholePlan) : null;

  return (
    <Card>
      <CardTitle>Support in exams</CardTitle>
      <div className="mt-3 space-y-3 text-sm" data-testid="support-plan">
        {!plan ? (
          <p className="text-muted">
            No support plan.
            {data.recordedAtEnrolment
              ? ` Recorded at enrolment: ${data.recordedAtEnrolment}.`
              : ""}
          </p>
        ) : (
          <>
            {whole && whole.needWords.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted">Needs</p>
                <p className="text-foreground">{whole.needWords.join(", ")}</p>
                {whole.needNote && <p className="text-muted">{whole.needNote}</p>}
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted">In tests and exams</p>
              {plan.arrangements.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Arrangements">
                  {plan.arrangements.map((a) => (
                    <li
                      key={a}
                      className="flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-foreground"
                    >
                      <Accessibility aria-hidden="true" className="h-3 w-3" />
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">Nothing different.</p>
              )}
            </div>
            {plan.reviewOn && (
              <p className="text-xs text-muted">Looked at again on {dayWords(plan.reviewOn)}</p>
            )}
            {whole?.agreedWith && (
              <p className="text-xs text-muted">Agreed with {whole.agreedWith}</p>
            )}
            {data.teacherView && (
              <p className="text-xs text-muted">
                You see what to do for {name.split(" ")[0]}. Why is kept by the Director of
                Studies and the nurse.
              </p>
            )}
          </>
        )}
        {data.mayChange && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {plan ? "Change the plan" : "Make a plan"}
          </Button>
        )}
      </div>
      {editing && (
        <SupportPlanEditor
          studentId={studentId}
          name={name}
          plan={whole}
          onClose={() => setEditing(false)}
        />
      )}
    </Card>
  );
}

/** The form the Director of Studies or the nurse fills in. */
export function SupportPlanEditor({
  studentId,
  name,
  plan,
  onClose,
}: {
  studentId: string;
  name: string;
  plan: WholePlan | null;
  onClose: () => void;
}) {
  const save = useSaveSupportPlan(studentId);
  const remove = useRemoveSupportPlan(studentId);
  const [needs, setNeeds] = useState<string[]>(plan?.needs ?? []);
  const [arrangements, setArrangements] = useState<string[]>(plan?.arrangementCodes ?? []);
  const [extra, setExtra] = useState(String(plan?.extraTimePercent ?? 25));
  const [other, setOther] = useState(plan?.otherArrangement ?? "");
  const [note, setNote] = useState(plan?.needNote ?? "");
  const [reviewOn, setReviewOn] = useState(plan?.reviewOn?.slice(0, 10) ?? "");
  const [agreedWith, setAgreedWith] = useState(plan?.agreedWith ?? "");

  const flip = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const extraTime = arrangements.includes("EXTRA_TIME");

  const submit = () =>
    save.mutate(
      {
        needs,
        arrangements,
        ...(extraTime && { extraTimePercent: Number(extra) }),
        ...(other.trim() && { otherArrangement: other.trim() }),
        ...(note.trim() && { needNote: note.trim() }),
        ...(reviewOn && { reviewOn }),
        ...(agreedWith.trim() && { agreedWith: agreedWith.trim() }),
      },
      { onSuccess: onClose },
    );

  return (
    <Modal isOpen onClose={onClose} title={`Support plan: ${name}`} size="lg">
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Teachers see only what to do in tests and exams, for the students they teach. The
          needs stay with you, the principal and the family.
        </p>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">Needs</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {NEEDS.map(([code, label]) => (
              <label key={code} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={needs.includes(code)}
                  onChange={() => flip(needs, setNeeds, code)}
                  className="h-4 w-4 rounded border-border"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Input label="About the need (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">In tests and exams</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ARRANGEMENTS.map(([code, label]) => (
              <label key={code} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={arrangements.includes(code)}
                  onChange={() => flip(arrangements, setArrangements, code)}
                  className="h-4 w-4 rounded border-border"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {extraTime && (
          <Input
            label="Extra time, as a percentage of the exam"
            type="number"
            min={5}
            max={200}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        )}
        <Input
          label="Anything else (optional)"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="A ground-floor room"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Look at it again on" type="date" value={reviewOn} onChange={(e) => setReviewOn(e.target.value)} />
          <Input
            label="Agreed with"
            value={agreedWith}
            onChange={(e) => setAgreedWith(e.target.value)}
            placeholder="The family and the district SNE officer"
          />
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          {plan ? (
            <Button
              variant="ghost"
              isLoading={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
            >
              Remove the plan
            </Button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              isLoading={save.isPending}
              disabled={extraTime && !(Number(extra) >= 5)}
              onClick={submit}
            >
              Save
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
