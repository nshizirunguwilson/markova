"use client";

import { useState } from "react";
import { Camera } from "lucide-react";

import { Button, Card, CardTitle, Input } from "@/components/ui";
import {
  ANSWER_WORDS,
  HOW_WORDS,
  PHOTO_USES,
  useAnswerPhotoConsent,
  usePhotoConsent,
  type PhotoAnswer,
  type PhotoConsent,
  type PhotoUse,
} from "@/hooks/use-photo-consent";
import { dayWords } from "@/lib/standing";

/**
 * What a family agreed to for a student's photo (B6 in
 * docs/STUDENT-LIFE-DESIGN.md): three questions, Yes or No.
 *
 * A parent answers for a child under 18, the student from 18, and the office
 * copies in a paper form, naming who signed it. The API decides who may; this
 * shows the form only to them, and says plainly to anybody else who answers.
 */
export function PhotoConsentCard({
  studentId,
  name,
  office = false,
}: {
  studentId: string;
  name: string;
  /** The office, copying in a paper form. */
  office?: boolean;
}) {
  const { data, isLoading, isError } = usePhotoConsent(studentId);
  const [editing, setEditing] = useState(false);
  if (isLoading || isError || !data) return null;
  const first = name.split(" ")[0];
  const last = data.history[0];

  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-2">
          <Camera aria-hidden="true" className="h-4 w-4 text-muted" />
          {office ? "Photo" : `${first}'s photo`}
        </span>
      </CardTitle>
      <div className="mt-3 space-y-3 text-sm" data-testid="photo-consent">
        {editing ? (
          <ConsentForm
            studentId={studentId}
            consent={data}
            office={office}
            onDone={() => setEditing(false)}
          />
        ) : (
          <>
            <dl className="space-y-2">
              {PHOTO_USES.map((u) => (
                <div key={u.key} className="flex items-start justify-between gap-4">
                  <dt className="min-w-0 text-foreground">{u.label}</dt>
                  <dd className={data[u.key] === "NO" ? "font-medium text-foreground" : "text-muted"}>
                    {ANSWER_WORDS[data[u.key]]}
                  </dd>
                </div>
              ))}
            </dl>
            {data.publicity === "NOT_ASKED" && (
              <p className="text-xs text-muted">
                Until somebody answers, the school counts publicity as No.
              </p>
            )}
            {last && (
              <p className="text-xs text-muted">
                Answered by {last.answeredBy} {HOW_WORDS[last.how] ?? ""}, {dayWords(last.createdAt)}.
              </p>
            )}
            {data.mayAnswer ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {office ? "Copy in a signed form" : last ? "Change the answers" : "Answer"}
              </Button>
            ) : (
              <p className="text-xs text-muted" data-testid="photo-consent-who">
                {data.answeredBy === "STUDENT"
                  ? `${first} is 18 or over, so ${first} decides this now.`
                  : "Your parents answer this until you are 18. From your 18th birthday it is yours."}
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function ConsentForm({
  studentId,
  consent,
  office,
  onDone,
}: {
  studentId: string;
  consent: PhotoConsent;
  office: boolean;
  onDone: () => void;
}) {
  const answer = useAnswerPhotoConsent(studentId);
  const [values, setValues] = useState<Record<PhotoUse, PhotoAnswer>>({
    forId: consent.forId,
    inApp: consent.inApp,
    publicity: consent.publicity,
  });
  const [signedBy, setSignedBy] = useState("");
  const complete = PHOTO_USES.every((u) => values[u.key] !== "NOT_ASKED");
  const ready = complete && (!office || signedBy.trim().length >= 2);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        answer.mutate(
          { ...values, ...(office && { answeredBy: signedBy.trim() }) },
          { onSuccess: onDone },
        );
      }}
    >
      {PHOTO_USES.map((u) => (
        <fieldset key={u.key}>
          <legend className="text-sm font-medium text-foreground">{u.label}</legend>
          <p className="mb-1 text-xs text-muted">{u.hint}</p>
          <div className="flex gap-4">
            {(["YES", "NO"] as const).map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name={`${studentId}-${u.key}`}
                  checked={values[u.key] === a}
                  onChange={() => setValues({ ...values, [u.key]: a })}
                  className="h-4 w-4"
                />
                {ANSWER_WORDS[a]}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {office && (
        <Input
          label="Who signed the form"
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          placeholder="Marie Mukamana (mother)"
        />
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" isLoading={answer.isPending} disabled={!ready}>
          Save
        </Button>
      </div>
    </form>
  );
}

/**
 * On one's own profile: a parent answers for each child, a student sees their
 * own (and answers from 18).
 */
export function MyPhotoConsent({
  role,
  studentId,
  name,
  childList,
}: {
  role?: string;
  studentId?: string | null;
  name: string;
  childList?: { id: string; name: string }[];
}) {
  if (role === "STUDENT" && studentId) {
    return <PhotoConsentCard studentId={studentId} name={name} />;
  }
  if (role === "PARENT" && childList?.length) {
    return (
      <>
        {childList.map((c) => (
          <PhotoConsentCard key={c.id} studentId={c.id} name={c.name} />
        ))}
      </>
    );
  }
  return null;
}
