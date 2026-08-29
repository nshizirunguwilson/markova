"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardTitle,
  Input,
  Modal,
  PageSpinner,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { classDisplayName } from "@/lib/utils";
import { TermPicker } from "@/components/finance/term-picker";
import { FeeBar } from "@/components/finance/fee-bar";
import {
  useFeeAccount,
  useGrantWaiver,
  useRecordPayment,
  useRevokeWaiver,
  useVoidPayment,
} from "@/hooks/use-finance";
import {
  METHOD_LABEL,
  REFERENCE_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
  WAIVER_HINT,
  WAIVER_LABEL,
  money,
  standingSummary,
  type FeeStatus,
  type PaymentMethod,
  type WaiverKind,
} from "@/lib/fees";
import {
  ArrowLeft,
  BadgePercent,
  Ban,
  HandCoins,
  Receipt,
  Undo2,
} from "lucide-react";

/**
 * One student's term.
 *
 * The counter view: the bursar has the family in front of them and needs the
 * balance, then a way to take the money. So the balance is the largest thing
 * on the page and the two actions sit directly under it.
 *
 * Below that is the book itself - what was billed, what came in, what was
 * written off - because the second question a family asks is always "what
 * about the 40,000 I paid in January", and the answer has to be on the same
 * screen as the number they are disputing.
 */

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const nameOf = (p: { firstName: string; lastName: string } | null) =>
  p ? `${p.firstName} ${p.lastName}` : "the office";

export default function FeeAccountPage() {
  // Non-null in the App Router, and this file only exists inside the
  // `[studentId]` segment, so the parameter is always there.
  const { studentId } = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();

  const [termId, setTermId] = useState(searchParams.get("termId") ?? "");
  const { data, isLoading } = useFeeAccount(studentId, termId || undefined);

  const [payOpen, setPayOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const recordPayment = useRecordPayment();
  const voidPayment = useVoidPayment();
  const grantWaiver = useGrantWaiver();
  const revokeWaiver = useRevokeWaiver();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("BANK_DEPOSIT");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");

  const [waiverKind, setWaiverKind] = useState<WaiverKind>("BURSARY");
  const [waiverAmount, setWaiverAmount] = useState("");
  const [waiverReason, setWaiverReason] = useState("");

  const standing = data?.standing ?? null;
  const status = (data?.status ?? "NOT_INVOICED") as FeeStatus;
  const student = data?.student;
  const invoice = data?.invoice;

  const closePay = () => {
    setPayOpen(false);
    setAmount("");
    setReference("");
    setPaidAt("");
    setNote("");
  };

  const closeWaive = () => {
    setWaiveOpen(false);
    setWaiverAmount("");
    setWaiverReason("");
  };

  /*
    The amount is a number field, and the button below is disabled until it
    holds a positive one. A second check here would be the same rule written
    twice, and two copies of a rule are two things that can disagree.
  */
  const submitPayment = async () => {
    const value = Number(amount);
    await recordPayment
      .mutateAsync({
        studentId,
        termId,
        amount: value,
        method,
        reference: reference.trim() || undefined,
        paidAt: paidAt || undefined,
        note: note.trim() || undefined,
      })
      .then(closePay)
      .catch(() => {});
  };

  /** As above: the button is the gate. */
  const submitWaiver = async () => {
    const value = Number(waiverAmount);
    await grantWaiver
      .mutateAsync({
        studentId,
        termId,
        kind: waiverKind,
        amount: value,
        reason: waiverReason.trim(),
      })
      .then(closeWaive)
      .catch(() => {});
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <Link
        href="/admin/finance"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the fee register
      </Link>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar
              src={student?.user.photoUrl}
              alt=""
              fallback={`${student?.user.firstName?.[0] ?? ""}${student?.user.lastName?.[0] ?? ""}`}
              size="md"
            />
            <span>
              {student?.user.firstName} {student?.user.lastName}
            </span>
          </span>
        }
        description={
          student
            ? `${student.studentIdNumber} · ${
                classDisplayName(student.classSection) || "no class"
              } · ${student.isBoarder ? "Boarder" : "Day student"}`
            : undefined
        }
        actions={<TermPicker value={termId} onChange={setTermId} />}
      />

      {/*
        The balance, and what to do about it. Everything else on this page is
        reference; this is the part somebody is standing at a counter for.
      */}
      <Card className="mb-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Badge variant={STATUS_VARIANT[status]}>
                {STATUS_LABEL[status]}
              </Badge>
              {invoice && (
                <span className="text-xs text-muted">
                  Billed {dateOf(invoice.issuedAt)}
                </span>
              )}
            </div>
            <p
              className={`mt-2 text-4xl font-bold tabular-nums ${
                standing && standing.balance > 0 ? "text-danger" : "text-success"
              }`}
            >
              {standing ? money(standing.balance) : "-"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {standingSummary(standing, status)}
            </p>
            <FeeBar standing={standing} status={status} className="mt-3 max-w-md" />
          </div>

          {invoice && (
            <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
              <Button onClick={() => setPayOpen(true)}>
                <HandCoins className="mr-2 h-4 w-4" /> Record a payment
              </Button>
              <Button variant="secondary" onClick={() => setWaiveOpen(true)}>
                <BadgePercent className="mr-2 h-4 w-4" /> Grant a waiver
              </Button>
            </div>
          )}
        </div>
      </Card>

      {!invoice && (
        <Card>
          <p className="text-sm text-muted">
            This student has not been billed for this term. Raise the term’s
            invoices from the fee register, and the bill will appear here.
          </p>
        </Card>
      )}

      {invoice && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* What was asked for, exactly as it was asked. */}
          <Card>
            <CardTitle className="mb-4 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted" /> The bill
            </CardTitle>
            <dl className="divide-y divide-border">
              {invoice.lines.map((line) => (
                <div key={line.id} className="flex justify-between py-2.5 text-sm">
                  <dt className="text-muted">{line.name}</dt>
                  <dd className="tabular-nums">{money(line.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between py-3 text-sm font-semibold">
                <dt>Total for the term</dt>
                <dd className="tabular-nums">{money(invoice.total)}</dd>
              </div>
            </dl>
            {/*
              The lines are a copy taken when the bill was raised, and saying
              so here is what stops an argument later: a price changed in
              March did not change this.
            */}
            <p className="mt-3 text-xs text-muted">
              These lines were fixed when the invoice was raised. Changing the
              fee structure since does not alter this bill.
            </p>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardTitle className="mb-4">Payments</CardTitle>
              {invoice.payments.length === 0 ? (
                <p className="text-sm text-muted">Nothing has come in yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`font-medium tabular-nums ${
                              p.voidedAt
                                ? "text-muted line-through"
                                : "text-foreground"
                            }`}
                          >
                            {money(p.amount)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {p.receiptNumber} · {METHOD_LABEL[p.method]} ·{" "}
                            {dateOf(p.paidAt)}
                          </p>
                          {p.reference && (
                            <p className="mt-0.5 truncate text-xs text-muted">
                              Ref {p.reference}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-muted">
                            Taken by {nameOf(p.recordedBy)}
                          </p>
                          {/*
                            A voided receipt keeps its place in the list. It is
                            the correction a bursar shows somebody, and hiding
                            it would leave a gap in the numbering instead.
                          */}
                          {p.voidedAt && (
                            <p className="mt-1 text-xs text-danger">
                              Voided {dateOf(p.voidedAt)} by {nameOf(p.voidedBy)}
                              {p.voidReason ? ` - ${p.voidReason}` : ""}
                            </p>
                          )}
                        </div>
                        {!p.voidedAt && (
                          <Button
                            variant="ghost"
                            className="flex-shrink-0 text-danger"
                            onClick={() => {
                              setVoiding(p.id);
                              setReason("");
                            }}
                            aria-label={`Void receipt ${p.receiptNumber}`}
                            /* Icon only, so the hover tooltip is the only
                               thing telling a bursar what the button does
                               before they press it. */
                            title={`Void receipt ${p.receiptNumber}`}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardTitle className="mb-4">Amounts not being collected</CardTitle>
              {invoice.waivers.length === 0 ? (
                <p className="text-sm text-muted">
                  Nothing has been written off on this term.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {invoice.waivers.map((w) => (
                    <li key={w.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`font-medium tabular-nums ${
                              w.revokedAt
                                ? "text-muted line-through"
                                : "text-foreground"
                            }`}
                          >
                            {money(w.amount)}
                            <span className="ml-2 text-xs font-normal text-muted">
                              {WAIVER_LABEL[w.kind]}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted">{w.reason}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            Granted {dateOf(w.createdAt)} by {nameOf(w.grantedBy)}
                          </p>
                          {w.revokedAt && (
                            <p className="mt-1 text-xs text-danger">
                              Withdrawn {dateOf(w.revokedAt)} by{" "}
                              {nameOf(w.revokedBy)}
                              {w.revokeReason ? ` - ${w.revokeReason}` : ""}
                            </p>
                          )}
                        </div>
                        {!w.revokedAt && (
                          <Button
                            variant="ghost"
                            className="flex-shrink-0 text-danger"
                            onClick={() => {
                              setRevoking(w.id);
                              setReason("");
                            }}
                            aria-label="Withdraw this waiver"
                            title="Withdraw this waiver"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ── Taking money ─────────────────────────────────────────────── */}
      <Modal isOpen={payOpen} onClose={closePay} title="Record a payment">
        <div className="space-y-4">
          {standing && (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
              {money(standing.balance)} outstanding on this term.
            </p>
          )}
          <Input
            label="Amount (RWF)"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={standing ? String(Math.round(standing.balance)) : ""}
          />
          <div>
            <label
              htmlFor="pay-method"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              How it was paid
            </label>
            <select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          {/*
            The reference is named after whatever the family is holding - a
            deposit slip, a MoMo message, a cheque stub. One generic
            "Reference" is what gets the wrong number typed into it.
          */}
          <Input
            label={REFERENCE_LABEL[method]}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Optional, but it is what makes this findable later"
          />
          <Input
            label="Date the money changed hands"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
          <Input
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closePay}>
              Cancel
            </Button>
            <Button
              onClick={submitPayment}
              isLoading={recordPayment.isPending}
              disabled={!amount || Number(amount) <= 0}
            >
              Record it and issue a receipt
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Writing part of it off ───────────────────────────────────── */}
      <Modal isOpen={waiveOpen} onClose={closeWaive} title="Grant a waiver">
        <div className="space-y-4">
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
            A waiver clears the term exactly as a payment does, so a sponsored
            student can be shown their results.
            {standing
              ? ` At most ${money(standing.balance)} can be written off here.`
              : ""}
          </p>
          <div>
            <label
              htmlFor="waiver-kind"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              What kind
            </label>
            <select
              id="waiver-kind"
              value={waiverKind}
              onChange={(e) => setWaiverKind(e.target.value as WaiverKind)}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              {(Object.keys(WAIVER_LABEL) as WaiverKind[]).map((k) => (
                <option key={k} value={k}>
                  {WAIVER_LABEL[k]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">{WAIVER_HINT[waiverKind]}</p>
          </div>
          <div>
            <Input
              label="Amount to write off (RWF)"
              type="number"
              min={1}
              value={waiverAmount}
              onChange={(e) => setWaiverAmount(e.target.value)}
            />
            {standing && standing.balance > 0 && (
              <button
                type="button"
                onClick={() => setWaiverAmount(String(Math.round(standing.balance)))}
                className="mt-1.5 text-xs font-medium text-primary hover:underline"
              >
                Write off the whole balance ({money(standing.balance)})
              </button>
            )}
          </div>
          <Input
            label="Why"
            value={waiverReason}
            onChange={(e) => setWaiverReason(e.target.value)}
            placeholder="District bursary, confirmed by the sector office"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeWaive}>
              Cancel
            </Button>
            <Button
              onClick={submitWaiver}
              isLoading={grantWaiver.isPending}
              disabled={
                !waiverAmount || Number(waiverAmount) <= 0 || !waiverReason.trim()
              }
            >
              Grant it
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Corrections ──────────────────────────────────────────────── */}
      <Modal
        isOpen={!!voiding}
        onClose={() => setVoiding(null)}
        title="Void this receipt"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            The receipt stops counting towards the balance but stays in the
            book, with your name and this reason against it.
          </p>
          <Input
            label="Why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Entered twice at the counter"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoiding(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={voidPayment.isPending}
              disabled={!reason.trim()}
              onClick={() =>
                voidPayment
                  .mutateAsync({ paymentId: voiding!, reason: reason.trim() })
                  .then(() => setVoiding(null))
                  .catch(() => {})
              }
            >
              Void it
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!revoking}
        onClose={() => setRevoking(null)}
        title="Withdraw this waiver"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            The amount goes back onto the balance. The waiver stays in the book
            with your name and this reason against it.
          </p>
          <Input
            label="Why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Sponsor withdrew before the term started"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={revokeWaiver.isPending}
              disabled={!reason.trim()}
              onClick={() =>
                revokeWaiver
                  .mutateAsync({ waiverId: revoking!, reason: reason.trim() })
                  .then(() => setRevoking(null))
                  .catch(() => {})
              }
            >
              Withdraw it
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
