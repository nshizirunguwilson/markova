"use client";

import { useForm } from "react-hook-form";
import { Input, Button, Badge } from "@/components/ui";
import { useAcademicYears, useTerms, useCreateTerm } from "@/hooks/use-academic";
import { Plus, CheckCircle2 } from "lucide-react";

export function StepTerms() {
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const createTerm = useCreateTerm();

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: "", startDate: "", endDate: "" },
  });

  const onSubmit = (data: any) => {
    if (!currentYear) return;
    createTerm.mutate(
      { ...data, academicYearId: currentYear.id, isCurrent: false },
      { onSuccess: () => reset() }
    );
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Terms</h2>
      <p className="mb-6 text-sm text-muted">
        Add terms for {currentYear?.name || "the current academic year"}
      </p>

      {!currentYear && (
        <p className="text-sm text-warning">Please create an academic year first (Step 3)</p>
      )}

      {terms?.length > 0 && (
        <div className="mb-6 space-y-2">
          {terms.map((t: any) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="font-medium">{t.name}</span>
              <span className="text-sm text-muted">
                {new Date(t.startDate).toLocaleDateString()} — {new Date(t.endDate).toLocaleDateString()}
              </span>
              {t.isCurrent && <Badge variant="success">Current</Badge>}
            </div>
          ))}
        </div>
      )}

      {currentYear && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
          <Input id="name" label="Term Name" placeholder="e.g. Term 1" {...register("name")} />
          <div className="grid grid-cols-2 gap-4">
            <Input id="startDate" label="Start Date" type="date" {...register("startDate")} />
            <Input id="endDate" label="End Date" type="date" {...register("endDate")} />
          </div>
          <Button type="submit" isLoading={createTerm.isPending}>
            <Plus className="mr-2 h-4 w-4" /> Add Term
          </Button>
        </form>
      )}
    </div>
  );
}
