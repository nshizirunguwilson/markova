"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Input, Button, Badge } from "@/components/ui";
import { useClassLevels, useCreateClassLevel, useCreateSection } from "@/hooks/use-academic";
import { Plus, Layers } from "lucide-react";

export function StepClasses() {
  const { data: levels } = useClassLevels();
  const createLevel = useCreateClassLevel();
  const createSection = useCreateSection();
  const [sectionInputs, setSectionInputs] = useState<Record<string, string>>({});

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: "", order: 1 },
  });

  const onSubmitLevel = (data: any) => {
    createLevel.mutate({ name: data.name, order: Number(data.order) }, { onSuccess: () => reset() });
  };

  const addSection = (classLevelId: string) => {
    const name = sectionInputs[classLevelId]?.trim();
    if (!name) return;
    createSection.mutate(
      { classLevelId, name },
      { onSuccess: () => setSectionInputs((s) => ({ ...s, [classLevelId]: "" })) }
    );
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Classes</h2>
      <p className="mb-6 text-sm text-muted">Create class levels and their sections (e.g. Senior 1 → A, B)</p>

      {/* Existing levels */}
      {levels?.length > 0 && (
        <div className="mb-6 space-y-3">
          {levels.map((level: any) => (
            <div key={level.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-primary" />
                <span className="font-semibold">{level.name}</span>
                <Badge>Order: {level.order}</Badge>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {level.sections?.map((s: any) => (
                  <Badge key={s.id} variant="success">
                    {[s.trade?.code, s.name].filter(Boolean).join(" ")} ({s._count?.students || 0} students)
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="Section name (e.g. A)"
                  value={sectionInputs[level.id] || ""}
                  onChange={(e) => setSectionInputs((s) => ({ ...s, [level.id]: e.target.value }))}
                  className="w-40 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSection(level.id))}
                 aria-label="Section name (e.g. A)"/>
                <Button aria-label="Add" size="sm" variant="outline" onClick={() => addSection(level.id)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmitLevel)} className="space-y-4 max-w-lg">
        <div className="grid grid-cols-2 gap-4">
          <Input id="name" label="Level Name" placeholder="e.g. Senior 1" {...register("name")} />
          <Input id="order" label="Order" type="number" {...register("order")} />
        </div>
        <Button type="submit" isLoading={createLevel.isPending}>
          <Plus className="mr-2 h-4 w-4" /> Add Class Level
        </Button>
      </form>
    </div>
  );
}
