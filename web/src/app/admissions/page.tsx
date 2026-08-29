"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardTitle, Input } from "@/components/ui";
import {
  useAnswerOffer,
  useCheckStatus,
  type PublicStatus,
} from "@/hooks/use-admissions";
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  expiresIn,
  type ApplicationStatus,
} from "@/lib/admissions";
import { CheckCircle2, FileText, Lock, Search } from "lucide-react";

/**
 * Where a family checks on their own application.
 *
 * They have no account and will not get one unless they are accepted, so this
 * is reached with the reference and the applicant's date of birth: something
 * only the family has, and a pair rather than a single number that anybody
 * holding a reference could guess their way past.
 *
 * Deliberately thin. Where the application stands, what is still wanted, and
 * any offer. No internal notes, no reviewer names, and nothing at all about
 * anybody else's child. Without a page like this the school's phone rings
 * instead, which is the only reason it exists.
 */
export default function AdmissionsStatusPage() {
  const [reference, setReference] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [answered, setAnswered] = useState(false);
  const [decline, setDecline] = useState("");

  const check = useCheckStatus();
  const answer = useAnswerOffer();
  const status: PublicStatus | undefined = check.data;

  const look = () => {
    if (!reference.trim() || !dateOfBirth) return;
    setAnswered(false);
    check.mutate({ reference: reference.trim(), dateOfBirth });
  };

  const respond = (accept: boolean) =>
    answer
      .mutateAsync({
        reference: reference.trim(),
        dateOfBirth,
        accept,
        reason: accept ? undefined : decline.trim() || undefined,
      })
      .then(() => {
        setAnswered(true);
        check.mutate({ reference: reference.trim(), dateOfBirth });
      })
      .catch(() => {});

  const offer = status?.offer;
  const offerStands =
    offer && !offer.acceptedAt && !offer.declinedAt && !answered;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Check an application
        </h1>
        <p className="mt-1 text-sm text-muted">
          Enter the reference the school gave you and the applicant&apos;s date of
          birth.
        </p>
      </header>

      <Card className="mb-6">
        <div className="space-y-4">
          <Input
            label="Application reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="APP-2026-0417"
            onKeyDown={(e) => e.key === "Enter" && look()}
          />
          <Input
            label="Applicant's date of birth"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
          <Button
            className="w-full"
            onClick={look}
            isLoading={check.isPending}
            disabled={!reference.trim() || !dateOfBirth}
          >
            <Search className="mr-2 h-4 w-4" /> Check
          </Button>
        </div>
      </Card>

      {status && (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {status.applicant}
                </p>
                <p className="font-mono text-xs text-muted">
                  {status.reference} · {status.intake.name}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[status.status as ApplicationStatus]}>
                {STATUS_LABEL[status.status as ApplicationStatus]}
              </Badge>
            </div>
          </Card>

          {/*
            The one thing a family can act on. Named item by item, because
            "your application is incomplete" sends nobody to the right drawer.
          */}
          {status.stillNeeded.length > 0 && (
            <Card className="border-warning/30 bg-warning-wash">
              <div className="flex gap-3">
                <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
                <div>
                  <p className="text-sm font-semibold text-warning">
                    The school is still waiting for
                    {status.stillNeeded.length === 1
                      ? " one thing"
                      : ` ${status.stillNeeded.length} things`}
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warning">
                    {status.stillNeeded.map((what) => (
                      <li key={what}>{what}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-warning">
                    Take these to the school office, or send them to the address
                    on the admissions page.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {offer && (
            <Card className={offerStands ? "border-success/40" : undefined}>
              <CardTitle className="mb-3">The place offered</CardTitle>
              <p className="text-sm">
                {offer.classSection.classLevel.name}
                {offer.classSection.trade && ` ${offer.classSection.trade.code}`}{" "}
                {offer.classSection.name} ·{" "}
                {offer.isBoarder ? "Boarding" : "Day"}
              </p>
              {offer.conditions && (
                <p className="mt-2 text-sm text-muted">{offer.conditions}</p>
              )}

              {offer.acceptedAt ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" /> You accepted this place.
                  The school will be in touch about enrolment.
                </p>
              ) : offer.declinedAt ? (
                <p className="mt-3 text-sm text-muted">
                  You told the school you would not be taking this place.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-sm font-medium text-warning">
                    This place is held for you and {expiresIn(offer.expiresAt)}.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Button
                      className="sm:flex-1"
                      isLoading={answer.isPending}
                      onClick={() => respond(true)}
                    >
                      Accept the place
                    </Button>
                    <Button
                      variant="secondary"
                      className="sm:flex-1"
                      isLoading={answer.isPending}
                      onClick={() => respond(false)}
                    >
                      Turn it down
                    </Button>
                  </div>
                  <input
                    value={decline}
                    onChange={(e) => setDecline(e.target.value)}
                    placeholder="If you are turning it down, you may say why"
                    aria-label="Why you are turning the place down"
                    className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                </>
              )}
            </Card>
          )}

          {/*
            The reason is carried through rather than hidden. It is what a
            family is owed when they are turned away, and withholding it just
            moves the phone call.
          */}
          <Card>
            <CardTitle className="mb-3">What has happened</CardTitle>
            <ol className="space-y-3">
              {status.history.map((h, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-border-strong" />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {STATUS_LABEL[h.status as ApplicationStatus]}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {new Date(h.at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </p>
                    {h.reason && (
                      <p className="mt-0.5 text-muted">{h.reason}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      <footer className="mt-10 space-y-3 border-t border-border pt-6 text-center">
        <p className="flex items-center justify-center gap-2 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" />
          Only somebody with the reference and the applicant&apos;s date of birth can
          see this.
        </p>
        <p className="text-sm">
          <Link href="/admissions/apply" className="text-primary underline">
            Apply for a place
          </Link>
          <span className="mx-2 text-muted">·</span>
          <Link href="/login" className="text-primary underline">
            Staff sign in
          </Link>
        </p>
      </footer>
    </main>
  );
}
