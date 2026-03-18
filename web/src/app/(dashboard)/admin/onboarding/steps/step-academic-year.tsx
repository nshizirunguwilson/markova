"use client";

import { useForm } from "react-hook-form";
import { Input, Button, Badge } from "@/components/ui";
import { useAcademicYears, useCreateAcademicYear } from "@/hooks/use-academic";
import { Plus, CheckCircle2 } from "lucide-react";

export function StepAcademicYear() {
  const { data: years } = useAcademicYears();
  const createYear = useCreateAcademicYear();

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: "", startDate: "", endDate: "", isCurrent: true },
  });

  const onSubmit = (data: any) => {
    createYear.mutate(data, { onSuccess: () => reset() });
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Academic Year</h2>
      <p className="mb-6 text-sm text-muted">Create your academic year(s)</p>

      {/* Existing years */}
      {years?.length > 0 && (
        <div className="mb-6 space-y-2">
          {years.map((y: any) => (
            <div key={y.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="font-medium">{y.name}</span>
              <span className="text-sm text-muted">
                {new Date(y.startDate).toLocaleDateString()} — {new Date(y.endDate).toLocaleDateString()}
              </span>
              {y.isCurrent && <Badge variant="success">Current</Badge>}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
        <Input id="name" label="Year Name" placeholder="e.g. 2025-2026" {...register("name")} />
        <div className="grid grid-cols-2 gap-4">
          <Input id="startDate" label="Start Date" type="date" {...register("startDate")} />
          <Input id="endDate" label="End Date" type="date" {...register("endDate")} />
        </div>
        <Button type="submit" isLoading={createYear.isPending}>
          <Plus className="mr-2 h-4 w-4" /> Add Academic Year
        </Button>
      </form>
    </div>
  );
}
