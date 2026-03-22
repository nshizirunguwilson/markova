"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Card, CardTitle, Input, Button, Badge } from "@/components/ui";
import { useClassLevels, useCreateClassLevel, useCreateSection } from "@/hooks/use-academic";
import { Plus, Layers, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function ClassesTab() {
  const { data: levels } = useClassLevels();
  const createLevel = useCreateClassLevel();
  const createSection = useCreateSection();
  const qc = useQueryClient();
  const [sectionInputs, setSectionInputs] = useState<Record<string, string>>({});

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: "", order: 1 },
  });

  const addSection = (classLevelId: string) => {
    const name = sectionInputs[classLevelId]?.trim();
    if (!name) return;
    createSection.mutate(
      { classLevelId, name },
      { onSuccess: () => setSectionInputs((s) => ({ ...s, [classLevelId]: "" })) }
    );
  };

  const deleteLevel = async (id: string) => {
    try {
      await api.delete(`/academic/class-levels/${id}`);
      qc.invalidateQueries({ queryKey: ["class-levels"] });
      toast.success("Class level deleted");
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed — may have linked data");
    }
  };

  const deleteSection = async (id: string) => {
    try {
      await api.delete(`/academic/sections/${id}`);
      qc.invalidateQueries({ queryKey: ["class-levels"] });
      qc.invalidateQueries({ queryKey: ["sections"] });
      toast.success("Section deleted");
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed — may have students");
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
              <Badge>Order: {level.order}</Badge>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Are you sure you want to delete this class level? This cannot be undone.")) deleteLevel(level.id); }}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {level.sections?.map((s: any) => (
              <div key={s.id} className="flex items-center gap-1">
                <Badge variant="success">
                  {s.name} ({s._count?.students || 0})
                </Badge>
                <button onClick={() => { if (window.confirm("Are you sure you want to delete this section?")) deleteSection(s.id); }} className="text-danger hover:text-red-700">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              placeholder="New section (e.g. B)"
              value={sectionInputs[level.id] || ""}
              onChange={(e) => setSectionInputs((s) => ({ ...s, [level.id]: e.target.value }))}
              className="w-40 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSection(level.id))}
            />
            <Button size="sm" variant="outline" onClick={() => addSection(level.id)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      ))}

      {/* Add new level */}
      <Card>
        <CardTitle>Add Class Level</CardTitle>
        <form onSubmit={handleSubmit((d) => createLevel.mutate({ name: d.name, order: Number(d.order) }, { onSuccess: () => reset() }))} className="mt-4 flex items-end gap-3 max-w-md">
          <Input id="cl-name" label="Name" placeholder="e.g. Senior 4" {...register("name")} />
          <Input id="cl-order" label="Order" type="number" {...register("order")} />
          <Button type="submit" isLoading={createLevel.isPending}><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </form>
      </Card>
    </div>
  );
}
