"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageSpinner,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useAcademicYears, useClassLevels } from "@/hooks/use-academic";
import { useIntakes, useSaveIntake, type AdmissionIntake } from "@/hooks/use-admissions";
import { ENTRY_LABEL, type EntryPoint } from "@/lib/admissions";
import { ArrowLeft, Plus } from "lucide-react";

/**
 * The rounds a school is running.
 *
 * Where places live. `ClassSection` has never carried a capacity and this is
 * the first feature that genuinely needs one, but it sits here rather than on
 * the class because an intake is where a school actually thinks about how many
 * it can take: eighty places across two streams, not forty on each.
 */

const dateOf = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export default function IntakesPage() {
  const { data: intakes, isLoading } = useIntakes();
  const { data: years } = useAcademicYears();
  const { data: levels } = useClassLevels();
  const save = useSaveIntake();

  const [editing, setEditing] = useState<Partial<AdmissionIntake> | null>(null);
  const [form, setForm] = useState({
    name: "",
    academicYearId: "",
    classLevelId: "",
    entryPoint: "SENIOR_ONE" as EntryPoint,
    places: "",
    opensAt: "",
    closesAt: "",
    isOpen: true,
  });

  const open = (intake?: AdmissionIntake) => {
    setEditing(intake ?? {});
    setForm({
      name: intake?.name ?? "",
      academicYearId: intake?.academicYear.id ?? "",
      classLevelId: intake?.classLevel.id ?? "",
      entryPoint: intake?.entryPoint ?? "SENIOR_ONE",
      places: intake ? String(intake.places) : "",
      opensAt: intake ? dateOf(intake.opensAt) : "",
      closesAt: intake ? dateOf(intake.closesAt) : "",
      isOpen: intake?.isOpen ?? true,
    });
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
        title="Intakes"
        description="The rounds a school is taking applications for, and how many places each has"
        actions={
          <Button onClick={() => open()}>
            <Plus className="mr-2 h-4 w-4" /> Open a round
          </Button>
        }
      />

      {isLoading ? (
        <PageSpinner />
      ) : !intakes?.length ? (
        <Card>
          <p className="text-sm text-muted">
            No rounds yet. A family cannot apply until one is open.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {intakes.map((intake) => (
            <Card key={intake.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">
                      {intake.name}
                    </h3>
                    <Badge variant={intake.isOpen ? "success" : "default"}>
                      {intake.isOpen ? "Open" : "Closed"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {ENTRY_LABEL[intake.entryPoint]} ·{" "}
                    {intake.classLevel.name} · {intake.academicYear.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {dateOf(intake.opensAt)} to {dateOf(intake.closesAt)} ·{" "}
                    {intake.total} application{intake.total === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    {/* An outstanding offer is a place spent, which is why
                        this is not simply places minus enrolled. */}
                    <p
                      className={`text-2xl font-bold tabular-nums ${
                        intake.placesLeft === 0 ? "text-danger" : "text-primary"
                      }`}
                    >
                      {intake.placesLeft}
                    </p>
                    <p className="text-xs text-muted">
                      of {intake.places} left
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => open(intake)}>
                    Change
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Change this round" : "Open a round"}
      >
        <div className="space-y-4">
          <Input
            label="What it is called"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Senior 1 intake, 2026"
          />
          <div>
            <label
              htmlFor="intake-entry"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Which door
            </label>
            <select
              id="intake-entry"
              value={form.entryPoint}
              onChange={(e) =>
                setForm({ ...form, entryPoint: e.target.value as EntryPoint })
              }
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              {(Object.keys(ENTRY_LABEL) as EntryPoint[]).map((k) => (
                <option key={k} value={k}>
                  {ENTRY_LABEL[k]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Each door asks a family for different documents. A transfer has no
              national exam slip to give.
            </p>
          </div>
          <div>
            <label
              htmlFor="intake-year"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Academic year
            </label>
            <select
              id="intake-year"
              value={form.academicYearId}
              onChange={(e) =>
                setForm({ ...form, academicYearId: e.target.value })
              }
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="">Choose a year...</option>
              {years?.map((y: { id: string; name: string }) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="intake-level"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Class level
            </label>
            <select
              id="intake-level"
              value={form.classLevelId}
              onChange={(e) =>
                setForm({ ...form, classLevelId: e.target.value })
              }
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="">Choose a level...</option>
              {levels?.map((l: { id: string; name: string }) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Places"
            type="number"
            min={0}
            value={form.places}
            onChange={(e) => setForm({ ...form, places: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Opens"
              type="date"
              value={form.opensAt}
              onChange={(e) => setForm({ ...form, opensAt: e.target.value })}
            />
            <Input
              label="Closes"
              type="date"
              value={form.closesAt}
              onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isOpen}
              onChange={(e) => setForm({ ...form, isOpen: e.target.checked })}
            />
            Taking applications
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              isLoading={save.isPending}
              disabled={
                !form.name.trim() ||
                !form.academicYearId ||
                !form.classLevelId ||
                form.places === "" ||
                !form.opensAt ||
                !form.closesAt
              }
              onClick={() =>
                save
                  .mutateAsync({
                    id: editing?.id,
                    name: form.name.trim(),
                    academicYearId: form.academicYearId,
                    classLevelId: form.classLevelId,
                    entryPoint: form.entryPoint,
                    places: Number(form.places),
                    opensAt: form.opensAt,
                    closesAt: form.closesAt,
                    isOpen: form.isOpen,
                  })
                  .then(() => setEditing(null))
                  .catch(() => {})
              }
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
