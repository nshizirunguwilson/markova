"use client";

import { useForm } from "react-hook-form";
import { Card, CardTitle, Input, Button, Badge } from "@/components/ui";
import { useSchoolConfig, useBulkUpsertConfig } from "@/hooks/use-academic";
import { Save } from "lucide-react";

// Mirrors the fixed scales in the backend (common/grading.ts) - shown for
// reference only, grading is not configurable.
const CORE_SCALE = [
  { letter: "A", min: 70, remark: "Excellent" },
  { letter: "B", min: 65, remark: "Very Good" },
  { letter: "C", min: 60, remark: "Good" },
  { letter: "D", min: 50, remark: "Satisfactory" },
  { letter: "E", min: 40, remark: "Adequate" },
  { letter: "S", min: 20, remark: "Fair" },
  { letter: "F", min: 0, remark: "Fail" },
];

export function SystemTab() {
  const { data } = useSchoolConfig();
  const bulkUpsert = useBulkUpsertConfig();
  const map = data?.map || {};

  const { register, handleSubmit } = useForm({
    values: {
      starting_discipline_points: map.starting_discipline_points || "100",
      pass_threshold: map.pass_threshold || "50",
      borrowing_limit: map.borrowing_limit || "3",
      borrowing_duration_days: map.borrowing_duration_days || "14",
    },
  });

  const onSubmit = (data: any) => {
    bulkUpsert.mutate(
      Object.entries(data).map(([key, value]) => ({ key, value: value as string }))
    );
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Academic Configuration</CardTitle>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4 max-w-lg">
          <div className="grid grid-cols-2 gap-4">
            <Input id="pass_threshold" label="Pass Threshold (%)" type="number" {...register("pass_threshold")} />
            <Input id="starting_discipline_points" label="Starting Discipline Points" type="number" {...register("starting_discipline_points")} />
          </div>

          <hr className="border-border" />
          <p className="text-sm font-semibold text-foreground">Library</p>
          <div className="grid grid-cols-2 gap-4">
            <Input id="borrowing_limit" label="Max Books Per Student" type="number" {...register("borrowing_limit")} />
            <Input id="borrowing_duration_days" label="Loan Duration (days)" type="number" {...register("borrowing_duration_days")} />
          </div>

          <Button type="submit" isLoading={bulkUpsert.isPending}>
            <Save className="mr-2 h-4 w-4" /> Save Configuration
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Grading Scale</CardTitle>
        <p className="mt-1 text-sm text-muted">
          Grades follow the Rwandan national scale (NESA, 2022 reform) and are not configurable.
          O-Level electives use stricter cut-offs; core subjects and TVET modules use the scale below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CORE_SCALE.map((g) => (
            <Badge key={g.letter}>
              {g.letter} · {g.min}%+ · {g.remark}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}
