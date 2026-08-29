"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Input,
  Modal,
  PageSpinner,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useSections } from "@/hooks/use-academic";
import {
  useAddNote,
  useApplication,
  useDecide,
  useEnrol,
  useMakeOffer,
  useRequestInfo,
  useRevokeOffer,
  useVerifyDocument,
} from "@/hooks/use-admissions";
import {
  DOCUMENT_LABEL,
  ENTRY_LABEL,
  FUNDING_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
  ageOf,
  examLine,
  expiresIn,
  type ApplicationStatus,
  type DocumentKind,
} from "@/lib/admissions";
import { resolveUploadUrl } from "@/lib/assets";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  FileText,
  GraduationCap,
  MessageSquareWarning,
  PauseCircle,
  UserPlus,
  X,
} from "lucide-react";

/**
 * One application.
 *
 * One screen, and no tabs for anything that bears on the decision. A reviewer's
 * eye moves down it in the order the decision is actually made: who they are,
 * what they are asking for, what supports it, what is missing, what the school
 * has said before, and then the decision itself.
 *
 * Two things stay off it on purpose. There is **no free editing of the
 * family's answers**: an application is what was submitted, and corrections
 * belong at enrolment. And there is **no fee information** beyond the bursary
 * the family declared, because whether a family can pay is not what an
 * academic decision should be resting on.
 */

const dateOf = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

const nameOf = (p: { firstName: string; lastName: string } | null) =>
  p ? `${p.firstName} ${p.lastName}` : "the office";

export default function ApplicationPage() {
  // Non-null in the App Router, and this file only exists inside `[id]`.
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useApplication(id);

  const decide = useDecide();
  const requestInfo = useRequestInfo();
  const makeOffer = useMakeOffer();
  const revokeOffer = useRevokeOffer();
  const enrol = useEnrol();
  const verify = useVerifyDocument();
  const addNote = useAddNote();

  const [reasonFor, setReasonFor] = useState<ApplicationStatus | null>(null);
  const [reason, setReason] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [asking, setAsking] = useState<DocumentKind[]>([]);
  const [askNote, setAskNote] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [conditions, setConditions] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [note, setNote] = useState("");

  /* Every class, narrowed to the intake's level where the offer is picked.
     Asking the API per level would refetch each time the modal opens. */
  const { data: sections } = useSections();

  if (isLoading) return <PageSpinner />;

  /*
    Spinning forever is the worst of both: it looks like the page is working
    and gives a reviewer nothing to do. An application that will not load is
    almost always one that has been enrolled and re-read from a stale link.
  */
  if (isError || !data) {
    return (
      <div>
        <Link
          href="/admin/admissions"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the desk
        </Link>
        <Card>
          <p className="text-sm text-muted">
            This application could not be loaded. It may have been removed, or
            the link may be out of date. The desk has the current list.
          </p>
        </Card>
      </div>
    );
  }

  const c = data.completeness;
  const age = ageOf(data.dateOfBirth);
  const mark = examLine(data.examMark, data.examTotal);
  const liveOffer = data.offers.find(
    (o) => !o.revokedAt && !o.declinedAt,
  );
  const dup = data.duplicates;
  const hasDuplicate =
    dup.sameChild.length > 0 ||
    dup.sameGuardian.length > 0 ||
    !!dup.alreadyStudent;

  const closeReason = () => {
    setReasonFor(null);
    setReason("");
  };

  /** Every decision that has to be explained goes through the same box. */
  const said: Partial<Record<ApplicationStatus, string>> = {
    UNDER_REVIEW: "Picked up",
    WAITLISTED: "Waitlisted",
    REJECTED: "Turned down",
    WITHDRAWN: "Recorded as withdrawn",
  };

  return (
    <div>
      <Link
        href="/admin/admissions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the desk
      </Link>

      <PageHeader
        title={`${data.firstName} ${data.lastName}`}
        description={
          <span className="font-mono text-xs">
            {[
              data.reference,
              /* The door and the level are the same words for a Senior 1
                 entrant, and "Senior 1 · Senior 1" reads as a fault. */
              ...(ENTRY_LABEL[data.intake.entryPoint] ===
              data.intake.classLevel.name
                ? [data.intake.classLevel.name]
                : [
                    ENTRY_LABEL[data.intake.entryPoint],
                    data.intake.classLevel.name,
                  ]),
              data.trade?.code,
              data.isBoarder ? "Boarder" : "Day student",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        }
        actions={
          <Badge variant={STATUS_VARIANT[data.status]}>
            {STATUS_LABEL[data.status]}
          </Badge>
        }
      />

      {/*
        Shown before anything else, because acting on a duplicate is a mistake
        that only surfaces at enrolment otherwise, with the family already told
        they had a place.
      */}
      {hasDuplicate && (
        <Card padding="sm" className="mb-5 border-warning/30 bg-warning-wash">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warning">
                This may be the same family twice
              </p>
              <ul className="mt-1 space-y-1 text-sm text-warning">
                {dup.alreadyStudent && (
                  <li>
                    A student with this name and date of birth is already on the
                    roll as{" "}
                    <span className="font-mono">
                      {dup.alreadyStudent.studentIdNumber}
                    </span>
                    .
                  </li>
                )}
                {dup.sameChild.map((d) => (
                  <li key={d.id}>
                    The same child also applied as{" "}
                    <Link
                      href={`/admin/admissions/${d.id}`}
                      className="font-mono underline"
                    >
                      {d.reference}
                    </Link>{" "}
                    ({STATUS_LABEL[d.status as ApplicationStatus]}).
                  </li>
                ))}
                {dup.sameGuardian.map((d) => (
                  <li key={d.id}>
                    The same guardian phone appears on{" "}
                    <Link
                      href={`/admin/admissions/${d.id}`}
                      className="font-mono underline"
                    >
                      {d.reference}
                    </Link>{" "}
                    for {d.firstName} {d.lastName}, which may simply be a
                    sibling.
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* 1. Who they are. */}
          <Card>
            <CardTitle className="mb-4">The applicant</CardTitle>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Age">{age != null ? `${age} years` : "-"}</Field>
              <Field label="Born">{dateOf(data.dateOfBirth)}</Field>
              <Field label="Gender">
                {data.gender === "FEMALE" ? "Female" : "Male"}
              </Field>
              <Field label="Home">
                {[data.district, data.province].filter(Boolean).join(", ") || "-"}
              </Field>
              <Field label="Sector">{data.sector || "-"}</Field>
              <Field label="Cell and village">
                {[data.cell, data.village].filter(Boolean).join(", ") || "-"}
              </Field>
              <Field label="Coming from">{data.previousSchool || "-"}</Field>
              {mark && <Field label="National exam">{mark}</Field>}
              <Field label="Paid for by">
                {FUNDING_LABEL[data.funding]}
                {data.fundingDetail && (
                  <span className="block text-xs text-muted">
                    {data.fundingDetail}
                  </span>
                )}
              </Field>
            </dl>

            <div className="mt-5 border-t border-border pt-4">
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                Who to talk to
              </h4>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Field label={data.guardianRelation}>{data.guardianName}</Field>
                <Field label="Phone">
                  <a href={`tel:${data.guardianPhone}`} className="text-primary">
                    {data.guardianPhone}
                  </a>
                </Field>
                {data.guardianEmail && (
                  <Field label="Email">{data.guardianEmail}</Field>
                )}
                {data.secondGuardianName && (
                  <Field label="Second contact">
                    {data.secondGuardianName}
                    {data.secondGuardianPhone && (
                      <span className="block text-xs text-muted">
                        {data.secondGuardianPhone}
                      </span>
                    )}
                  </Field>
                )}
              </dl>
            </div>

            {/* Only when there is something to say. Empty welfare rows on
                every application would bury the ones that matter. */}
            {(data.bloodType ||
              data.allergies ||
              data.medicalConditions ||
              data.disability) && (
              <div className="mt-5 border-t border-border pt-4">
                <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                  Health and welfare
                </h4>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  {data.bloodType && (
                    <Field label="Blood type">{data.bloodType}</Field>
                  )}
                  {data.allergies && (
                    <Field label="Allergies">{data.allergies}</Field>
                  )}
                  {data.medicalConditions && (
                    <Field label="Conditions">{data.medicalConditions}</Field>
                  )}
                  {data.disability && (
                    <Field label="Disability">{data.disability}</Field>
                  )}
                </dl>
              </div>
            )}

            {data.note && (
              <div className="mt-5 rounded-lg bg-surface-muted p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  What the family wanted the school to know
                </p>
                <p className="mt-1 text-sm">{data.note}</p>
              </div>
            )}
          </Card>

          {/* 2. What supports it, and what is missing. */}
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Documents</CardTitle>
              <span
                className={`text-xs font-medium ${
                  c.complete ? "text-success" : "text-warning"
                }`}
              >
                {c.present.length} of {c.required.length} in
                {c.unverified.length > 0 && `, ${c.unverified.length} to check`}
              </span>
            </div>

            <ul className="divide-y divide-border">
              {c.required.map((kind) => {
                const doc = data.documents.find((d) => d.kind === kind);
                return (
                  <li
                    key={kind}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {doc ? (
                        <CheckCircle2
                          className={`h-4 w-4 flex-shrink-0 ${
                            doc.verifiedAt ? "text-success" : "text-warning"
                          }`}
                        />
                      ) : (
                        <X className="h-4 w-4 flex-shrink-0 text-danger" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          {DOCUMENT_LABEL[kind]}
                        </p>
                        {doc?.verifiedAt && (
                          <p className="truncate text-xs text-muted">
                            Checked by {nameOf(doc.verifiedBy)}
                          </p>
                        )}
                        {doc && !doc.verifiedAt && (
                          <p className="text-xs text-warning">
                            Attached, not yet checked
                          </p>
                        )}
                      </div>
                    </div>
                    {doc && (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        {/* Opened in place, so a reviewer never leaves the
                            screen they are deciding on. */}
                        <a
                          href={resolveUploadUrl(doc.fileUrl) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                          aria-label={`Open ${DOCUMENT_LABEL[kind]}`}
                          title={`Open ${DOCUMENT_LABEL[kind]}`}
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                        {!doc.verifiedAt && (
                          <Button
                            variant="ghost"
                            onClick={() => verify.mutate(doc.id)}
                            aria-label={`Mark ${DOCUMENT_LABEL[kind]} as checked`}
                            title="Mark as checked"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* 3. What the school has said before. */}
          <Card>
            <CardTitle className="mb-4">What has happened</CardTitle>
            <ol className="space-y-3">
              {data.events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-border-strong" />
                  <div className="min-w-0">
                    <p>
                      <span className="font-medium">
                        {STATUS_LABEL[e.toStatus]}
                      </span>
                      <span className="ml-2 text-xs text-muted">
                        {dateOf(e.createdAt)} · {nameOf(e.actor)}
                      </span>
                    </p>
                    {e.reason && (
                      <p className="mt-0.5 text-sm text-muted">{e.reason}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          {/* 4. Decide. */}
          <Card>
            <CardTitle className="mb-1">Decide</CardTitle>
            <p className="mb-4 text-xs text-muted">
              Every decision is recorded with your name and your reason, and the
              family can be told what it was.
            </p>

            <div className="space-y-2">
              {data.status === "SUBMITTED" && (
                <Button
                  className="w-full"
                  onClick={() =>
                    decide.mutate({
                      id,
                      status: "UNDER_REVIEW",
                      said: said.UNDER_REVIEW!,
                    })
                  }
                  isLoading={decide.isPending}
                >
                  Pick this up
                </Button>
              )}

              {["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "WAITLISTED"].includes(
                data.status,
              ) && (
                <>
                  <Button
                    className="w-full"
                    onClick={() => setOfferOpen(true)}
                    disabled={data.status === "INFO_REQUESTED"}
                    title={
                      data.status === "INFO_REQUESTED"
                        ? "This application is waiting on the family"
                        : undefined
                    }
                  >
                    <GraduationCap className="mr-2 h-4 w-4" /> Offer a place
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setAskOpen(true)}
                  >
                    <MessageSquareWarning className="mr-2 h-4 w-4" /> Ask for
                    what is missing
                  </Button>
                  {data.status !== "WAITLISTED" && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setReasonFor("WAITLISTED")}
                    >
                      <PauseCircle className="mr-2 h-4 w-4" /> Waitlist
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => setReasonFor("REJECTED")}
                  >
                    <Ban className="mr-2 h-4 w-4" /> Turn down
                  </Button>
                </>
              )}

              {data.status === "ACCEPTED" && (
                <Button
                  className="w-full"
                  onClick={() => enrol.mutate(id)}
                  isLoading={enrol.isPending}
                >
                  <UserPlus className="mr-2 h-4 w-4" /> Enrol as a student
                </Button>
              )}

              {data.status === "ENROLLED" && data.student && (
                <div className="rounded-lg bg-success-wash p-3 text-sm text-success">
                  Enrolled as{" "}
                  <span className="font-mono">
                    {data.student.studentIdNumber}
                  </span>
                  .
                  <Link
                    href={`/admin/students/${data.student.id}`}
                    className="ml-1 underline"
                  >
                    Open the student record
                  </Link>
                  .
                </div>
              )}

              {["REJECTED", "WITHDRAWN"].includes(data.status) && (
                <p className="rounded-lg bg-surface-muted p-3 text-sm text-muted">
                  This application is closed and cannot be moved. A family who
                  wants to be reconsidered applies again.
                </p>
              )}
            </div>
          </Card>

          {/* The offer, when there is one. */}
          {liveOffer && (
            <Card>
              <CardTitle className="mb-3">The place held</CardTitle>
              <p className="text-sm">
                {liveOffer.classSection.classLevel.name}
                {liveOffer.classSection.trade &&
                  ` ${liveOffer.classSection.trade.code}`}{" "}
                {liveOffer.classSection.name} ·{" "}
                {liveOffer.isBoarder ? "Boarder" : "Day"}
              </p>
              <p
                className={`mt-1 text-sm ${
                  liveOffer.acceptedAt ? "text-success" : "text-warning"
                }`}
              >
                {liveOffer.acceptedAt
                  ? `Accepted ${dateOf(liveOffer.acceptedAt)}`
                  : expiresIn(liveOffer.expiresAt)}
              </p>
              {liveOffer.conditions && (
                <p className="mt-2 text-xs text-muted">
                  {liveOffer.conditions}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">
                Offered {dateOf(liveOffer.offeredAt)} by{" "}
                {nameOf(liveOffer.offeredBy)}
              </p>
              {!liveOffer.acceptedAt && (
                <Button
                  variant="secondary"
                  className="mt-3 w-full"
                  onClick={() => setRevoking(liveOffer.id)}
                >
                  Take the place back
                </Button>
              )}
            </Card>
          )}

          {/* 5. Internal notes. */}
          <Card>
            <CardTitle className="mb-1">Notes</CardTitle>
            <p className="mb-3 text-xs text-muted">
              Only the office sees these. They are never shown to the family.
            </p>
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Spoke to the mother..."
                aria-label="Add a note"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-primary focus:outline-none"
              />
              <Button
                onClick={() =>
                  addNote
                    .mutateAsync({ id, body: note })
                    .then(() => setNote(""))
                    .catch(() => {})
                }
                isLoading={addNote.isPending}
                disabled={!note.trim()}
              >
                Add
              </Button>
            </div>
            {data.notes.length > 0 && (
              <ul className="mt-4 divide-y divide-border">
                {data.notes.map((n) => (
                  <li key={n.id} className="py-2.5">
                    <p className="text-sm">{n.body}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {nameOf(n.author)} · {dateOf(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* ── Deciding, with a reason ──────────────────────────────────── */}
      <Modal
        isOpen={!!reasonFor}
        onClose={closeReason}
        title={
          reasonFor === "REJECTED"
            ? "Turn this application down"
            : reasonFor === "WAITLISTED"
              ? "Waitlist this application"
              : "Record a decision"
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {reasonFor === "REJECTED"
              ? "The family will be told, and this reason is what the school answers with if they ask about it later."
              : "A waitlisted family is one the school would take if a place opened. Say what is holding it up."}
          </p>
          <Input
            label="Why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              reasonFor === "REJECTED"
                ? "Below the mark for this intake"
                : "Strong application, no place left in this intake"
            }
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeReason}>
              Cancel
            </Button>
            <Button
              variant={reasonFor === "REJECTED" ? "danger" : "primary"}
              isLoading={decide.isPending}
              disabled={!reason.trim()}
              onClick={() => {
                const to = reasonFor;
                if (!to) return;
                decide
                  .mutateAsync({
                    id,
                    status: to,
                    reason: reason.trim(),
                    said: said[to] ?? "Recorded",
                  })
                  .then(closeReason)
                  .catch(() => {});
              }}
            >
              {reasonFor === "REJECTED" ? "Turn down" : "Waitlist"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Asking for what is missing ───────────────────────────────── */}
      <Modal
        isOpen={askOpen}
        onClose={() => setAskOpen(false)}
        title="Ask the family for what is missing"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Tick exactly what is outstanding. A list is what lets both sides say
            what is still needed three weeks from now; a message alone does not.
          </p>
          <div className="space-y-2">
            {c.required.map((kind) => {
              const have = data.documents.some((d) => d.kind === kind);
              return (
                <label
                  key={kind}
                  className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={asking.includes(kind)}
                    onChange={(e) =>
                      setAsking((was) =>
                        e.target.checked
                          ? [...was, kind]
                          : was.filter((k) => k !== kind),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">{DOCUMENT_LABEL[kind]}</span>
                  {have && (
                    <span className="flex-shrink-0 text-xs text-muted">
                      already in
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <Input
            label="Anything else to say"
            value={askNote}
            onChange={(e) => setAskNote(e.target.value)}
            placeholder="The photograph was too dark to read"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAskOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={requestInfo.isPending}
              disabled={asking.length === 0 && !askNote.trim()}
              onClick={() =>
                requestInfo
                  .mutateAsync({ id, documents: asking, note: askNote.trim() })
                  .then(() => {
                    setAskOpen(false);
                    setAsking([]);
                    setAskNote("");
                  })
                  .catch(() => {})
              }
            >
              Ask the family
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Offering a place ─────────────────────────────────────────── */}
      <Modal
        isOpen={offerOpen}
        onClose={() => setOfferOpen(false)}
        title="Offer a place"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            The place is held from now until the expiry date, and counts against
            the intake for as long as it is. The family answers on the school&apos;s
            admissions page.
          </p>
          <div>
            <label
              htmlFor="offer-class"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Class
            </label>
            <select
              id="offer-class"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="">Choose a class...</option>
              {sections
                ?.filter(
                  (s: { classLevelId: string }) =>
                    s.classLevelId === data.intake.classLevel.id,
                )
                .map((s: { id: string; name: string; trade?: { code: string } }) => (
                  <option key={s.id} value={s.id}>
                    {data.intake.classLevel.name}{" "}
                    {[s.trade?.code, s.name].filter(Boolean).join(" ")}
                  </option>
                ))}
            </select>
          </div>
          <Input
            label="Held until"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <Input
            label="Conditions"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="Optional, e.g. subject to the original results slip"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOfferOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={makeOffer.isPending}
              disabled={!sectionId || !expiresAt}
              onClick={() =>
                makeOffer
                  .mutateAsync({
                    id,
                    classSectionId: sectionId,
                    expiresAt,
                    conditions: conditions.trim() || undefined,
                  })
                  .then(() => setOfferOpen(false))
                  .catch(() => {})
              }
            >
              Offer the place
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Taking a place back ──────────────────────────────────────── */}
      <Modal
        isOpen={!!revoking}
        onClose={() => setRevoking(null)}
        title="Take the place back"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            The place is released and the application goes back into the pile.
            Nothing is deleted, and the reason stays on the record.
          </p>
          <Input
            label="Why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The place went to a waitlisted family"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={revokeOffer.isPending}
              disabled={!reason.trim()}
              onClick={() => {
                const offerId = revoking;
                if (!offerId) return;
                revokeOffer
                  .mutateAsync({ offerId, reason: reason.trim() })
                  .then(() => {
                    setRevoking(null);
                    setReason("");
                  })
                  .catch(() => {});
              }}
            >
              Take it back
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** One labelled fact. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground">{children}</dd>
    </div>
  );
}
