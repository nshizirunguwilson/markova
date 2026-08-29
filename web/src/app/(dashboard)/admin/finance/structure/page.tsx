"use client";

import { useState } from "react";
import Link from "next/link";
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
import { TermPicker } from "@/components/finance/term-picker";
import { useTerms } from "@/hooks/use-academic";
import {
  useCopyFeeStructure,
  useDeleteFeeItem,
  useFeeStructure,
  useSaveFeeItem,
  type FeeItem,
} from "@/hooks/use-finance";
import { APPLIES_TO_LABEL, money, type FeeAppliesTo } from "@/lib/fees";
import { ArrowLeft, Copy, Pencil, Plus, Trash2 } from "lucide-react";

/**
 * What the school charges, by class level, for one term.
 *
 * The price list — not anybody's bill. Every invoice already raised carries
 * its own copy of these lines, so editing here changes what the *next*
 * invoice says and never what a family has already been asked for. That
 * distinction is the reason the whole thing is safe to edit mid-term, and it
 * is said on the page rather than left for somebody to discover.
 *
 * Boarder and day totals are shown side by side for each level because that
 * is the number a parent asks for on the phone, and working it out by adding
 * up which lines apply is exactly the arithmetic this page exists to stop.
 */
export default function FeeStructurePage() {
  const [termId, setTermId] = useState("");
  const { data: levels, isLoading } = useFeeStructure(termId || undefined);
  const { data: terms } = useTerms();

  const save = useSaveFeeItem();
  const remove = useDeleteFeeItem();
  const copy = useCopyFeeStructure();

  const [editing, setEditing] = useState<
    (Partial<FeeItem> & { classLevelId: string }) | null
  >(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<FeeItem | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [appliesTo, setAppliesTo] = useState<FeeAppliesTo>("ALL");

  const openEditor = (
    classLevelId: string,
    item?: FeeItem,
  ) => {
    setEditing(item ?? { classLevelId });
    setName(item?.name ?? "");
    setAmount(item ? String(item.amount) : "");
    setAppliesTo((item?.appliesTo as FeeAppliesTo) ?? "ALL");
  };

  /*
    Save is disabled until there is a name and an amount, so checking again
    here would be the same rule in two places — and two copies of a rule are
    two things that can disagree.
  */
  const submit = async () => {
    if (!editing) return;
    await save
      .mutateAsync({
        id: editing.id,
        termId,
        classLevelId: editing.classLevelId,
        name: name.trim(),
        amount: Number(amount),
        appliesTo,
        position: editing.position ?? 0,
      })
      .then(() => setEditing(null))
      .catch(() => {});
  };

  const empty = !isLoading && levels?.every((l) => l.items.length === 0);

  return (
    <div>
      <Link
        href="/admin/finance"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the fee register
      </Link>

      <PageHeader
        title="Fee structure"
        description="What each class level is charged for a term"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TermPicker value={termId} onChange={setTermId} />
            <Button variant="secondary" onClick={() => setCopyOpen(true)}>
              <Copy className="mr-2 h-4 w-4" /> Copy from another term
            </Button>
          </div>
        }
      />

      <Card padding="sm" className="mb-5">
        <p className="text-sm text-muted">
          These are prices, not bills. An invoice keeps its own copy of these
          lines from the moment it is raised, so changing anything here affects
          only invoices raised from now on.
        </p>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : empty ? (
        <Card>
          <p className="text-sm text-muted">
            This term has no fee lines yet. Add them level by level below, or
            copy last term’s across and adjust what changed.
          </p>
        </Card>
      ) : null}

      <div className="space-y-5">
        {levels?.map((level) => (
          <Card key={level.classLevel.id}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{level.classLevel.name}</CardTitle>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-muted">Boarder pays</p>
                  <p className="font-semibold tabular-nums">
                    {money(level.boarderTotal)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Day student pays</p>
                  <p className="font-semibold tabular-nums">
                    {money(level.dayTotal)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => openEditor(level.classLevel.id)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add a line
                </Button>
              </div>
            </div>

            {level.items.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing charged at this level yet. Students here cannot be
                invoiced until at least one line exists.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {level.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="truncate text-sm font-medium">
                        {item.name}
                      </span>
                      {/*
                        Only shown when it narrows the charge. "Everyone" on
                        four lines out of five is noise that makes the two
                        that matter harder to spot.
                      */}
                      {item.appliesTo !== "ALL" && (
                        <Badge variant="info">
                          {APPLIES_TO_LABEL[item.appliesTo as FeeAppliesTo]}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <span className="tabular-nums">{money(item.amount)}</span>
                      <Button
                        variant="ghost"
                        onClick={() => openEditor(item.classLevelId, item)}
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setConfirmDelete(item)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Change this fee line" : "Add a fee line"}
      >
        <div className="space-y-4">
          <Input
            label="What it is for"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tuition"
          />
          <Input
            label="Amount (RWF)"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div>
            <label
              htmlFor="applies-to"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Who pays it
            </label>
            <select
              id="applies-to"
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as FeeAppliesTo)}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              {(Object.keys(APPLIES_TO_LABEL) as FeeAppliesTo[]).map((k) => (
                <option key={k} value={k}>
                  {APPLIES_TO_LABEL[k]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              A student’s total follows from where they sleep, so moving them
              into the dormitory changes their next bill on its own.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              isLoading={save.isPending}
              disabled={!name.trim() || amount === ""}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copy a fee structure"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Every line from the term you choose is copied onto this one. Lines
            this term already has under the same name are left as they are.
          </p>
          <div>
            <label
              htmlFor="copy-from"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Copy from
            </label>
            <select
              id="copy-from"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="">Choose a term…</option>
              {terms
                ?.filter((t: { id: string }) => t.id !== termId)
                .map(
                  (t: {
                    id: string;
                    name: string;
                    academicYear?: { name: string };
                  }) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.academicYear ? ` · ${t.academicYear.name}` : ""}
                    </option>
                  ),
                )}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCopyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                copy
                  .mutateAsync({ fromTermId: copyFrom, toTermId: termId })
                  .then(() => setCopyOpen(false))
                  .catch(() => {})
              }
              isLoading={copy.isPending}
              disabled={!copyFrom}
            >
              Copy the lines
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Remove ${confirmDelete?.name ?? "this line"}?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Future invoices will not include it. Invoices already raised keep
            their own copy of the line and are not changed.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            {/*
              The id is read here, not inside the handler.

              The React Compiler hoists what a callback closes over into the
              dependency check it builds around it, and that check runs on
              every render — including the ones where nothing is selected. A
              `confirmDelete!.id` inside the handler therefore becomes a read
              of `null.id` at render time, because the non-null assertion is
              erased when the TypeScript is compiled and cannot protect
              anything. Optional chaining survives into the output and does.
            */}
            <Button
              variant="danger"
              isLoading={remove.isPending}
              disabled={!confirmDelete}
              onClick={() => {
                const id = confirmDelete?.id;
                if (!id) return;
                remove
                  .mutateAsync(id)
                  .then(() => setConfirmDelete(null))
                  .catch(() => {});
              }}
            >
              Remove it
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
