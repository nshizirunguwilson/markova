"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Card, CardTitle, Input, Button, Badge, Modal } from "@/components/ui";
import { useClassLevels, useCreateClassLevel, useCreateSection, useTrades } from "@/hooks/use-academic";
import { Plus, Layers, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/lib/errors";

export function ClassesTab() {
  const { data: levels } = useClassLevels();
  const { data: trades } = useTrades();
  const createLevel = useCreateClassLevel();
  const createSection = useCreateSection();
  const qc = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [sectionInputs, setSectionInputs] = useState<Record<string, string>>({});
  const [tradeInputs, setTradeInputs] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: { name: "", order: 1, stage: "O_LEVEL" },
  });
  const stage = watch("stage");

  const addSection = (level: any) => {
    const name = sectionInputs[level.id]?.trim();
    if (!name) return;
    const isALevel = level.stage === "A_LEVEL";
    const tradeId = tradeInputs[level.id] || undefined;
    if (isALevel && !tradeId) {
      toast.error("Pick a trade - A-Level classes belong to a trade");
      return;
    }
    createSection.mutate(
      { classLevelId: level.id, name, ...(isALevel ? { tradeId } : {}) },
      { onSuccess: () => setSectionInputs((s) => ({ ...s, [level.id]: "" })) }
    );
  };

  const deleteLevel = async (id: string) => {
    try {
      await api.delete(`/academic/class-levels/${id}`);
      qc.invalidateQueries({ queryKey: ["class-levels"] });
      toast.success("Class level deleted");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed - may have linked data"));
    }
  };

  const deleteSection = async (id: string) => {
    try {
      await api.delete(`/academic/sections/${id}`);
      qc.invalidateQueries({ queryKey: ["class-levels"] });
      qc.invalidateQueries({ queryKey: ["sections"] });
      toast.success("Section deleted");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed - may have students"));
    }
  };

  return (
    <div className="space-y-5">
      {/* Existing levels */}
      {levels?.map((level: any) => (
        <Card key={level.id}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <CardTitle>{level.name}</CardTitle>
              <Badge>{level.stage === "A_LEVEL" ? "A-Level (TVET)" : "O-Level"}</Badge>
              <Badge>Order: {level.order}</Badge>
            </div>
            <Button aria-label="Delete" size="sm" variant="ghost" onClick={() => { setConfirmMessage(`Are you sure you want to delete "${level.name}"? This cannot be undone.`); setConfirmAction(() => () => deleteLevel(level.id)); }}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {level.sections?.map((s: any) => (
              <div key={s.id} className="flex items-center gap-1">
                <Badge variant="success">
                  {[s.trade?.code, s.name].filter(Boolean).join(" ")} ({s._count?.students || 0})
                </Badge>
                <button aria-label="Delete" onClick={() => { setConfirmMessage(`Are you sure you want to delete section "${s.name}"?`); setConfirmAction(() => () => deleteSection(s.id)); }} className="text-danger hover:text-danger">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {level.stage === "A_LEVEL" && (
              <select
                value={tradeInputs[level.id] || ""}
                onChange={(e) => setTradeInputs((s) => ({ ...s, [level.id]: e.target.value }))}
                className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Trade…</option>
                {trades?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.code} - {t.name}</option>
                ))}
              </select>
            )}
            <input
              placeholder="New section (e.g. B)"
              value={sectionInputs[level.id] || ""}
              onChange={(e) => setSectionInputs((s) => ({ ...s, [level.id]: e.target.value }))}
              className="w-40 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSection(level))}
            />
            <Button aria-label="Add" size="sm" variant="outline" onClick={() => addSection(level)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      ))}

      {/* Add new level */}
      <Card>
        <CardTitle>Add Class Level</CardTitle>
        <form onSubmit={handleSubmit((d) => createLevel.mutate({ name: d.name, order: Number(d.order), stage: d.stage }, { onSuccess: () => reset() }))} className="mt-4 flex items-end gap-3 max-w-2xl">
          <div>
            <label htmlFor="cl-stage" className="block text-sm font-medium text-foreground mb-1.5">Stage</label>
            <select id="cl-stage" {...register("stage")} className="rounded-lg border border-input px-2 py-2 text-sm focus:border-primary focus:outline-none">
              <option value="O_LEVEL">O-Level</option>
              <option value="A_LEVEL">A-Level (TVET)</option>
            </select>
          </div>
          <Input
            id="cl-name"
            label="Name"
            placeholder={stage === "A_LEVEL" ? "e.g. Level 6" : "e.g. Senior 3"}
            error={errors.name?.message}
            {...register("name", {
              // The section input beside this one already refused an empty
              // name. This form did not, and posted a level called "".
              required: "A class level needs a name",
              setValueAs: (v: string) => v.trim(),
            })}
          />
          <Input id="cl-order" label="Order" type="number" {...register("order")} />
          <Button type="submit" isLoading={createLevel.isPending}><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </form>
        <p className="mt-2 text-xs text-muted">O-Level holds Senior 1-3; trade levels (Level 3-5) are A-Level.</p>
      </Card>

      {/* Confirm Action Modal */}
      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title="Confirm Action">
        <p className="text-sm text-muted mb-4">{confirmMessage}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { confirmAction?.(); setConfirmAction(null); }}>Confirm</Button>
        </div>
      </Modal>
    </div>
  );
}
