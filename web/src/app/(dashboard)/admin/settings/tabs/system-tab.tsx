"use client";

import { useForm } from "react-hook-form";
import { Card, CardTitle, Input, Button } from "@/components/ui";
import { useSchoolConfig, useBulkUpsertConfig } from "@/hooks/use-academic";
import { Save } from "lucide-react";

export function SystemTab() {
  const { data } = useSchoolConfig();
  const bulkUpsert = useBulkUpsertConfig();
  const map = data?.map || {};

  const { register, handleSubmit } = useForm({
    values: {
      starting_discipline_points: map.starting_discipline_points || "100",
      pass_threshold: map.pass_threshold || "50",
      grading_scale: map.grading_scale || "A:90,B:80,C:70,D:60,F:0",
      borrowing_limit: map.borrowing_limit || "3",
      borrowing_duration_days: map.borrowing_duration_days || "14",
      sms_provider: map.sms_provider || "",
      sms_api_key: map.sms_api_key || "",
      email_provider: map.email_provider || "",
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
          <Input id="grading_scale" label="Grading Scale (format: A:90,B:80,...)" {...register("grading_scale")} />

          <hr className="border-border" />
          <p className="text-sm font-semibold text-foreground">Library</p>
          <div className="grid grid-cols-2 gap-4">
            <Input id="borrowing_limit" label="Max Books Per Student" type="number" {...register("borrowing_limit")} />
            <Input id="borrowing_duration_days" label="Loan Duration (days)" type="number" {...register("borrowing_duration_days")} />
          </div>

          <hr className="border-border" />
          <p className="text-sm font-semibold text-foreground">SMS & Email</p>
          <div className="grid grid-cols-2 gap-4">
            <Input id="sms_provider" label="SMS Provider" placeholder="e.g. africas_talking" {...register("sms_provider")} />
            <Input id="sms_api_key" label="SMS API Key" type="password" {...register("sms_api_key")} />
          </div>
          <Input id="email_provider" label="Email Provider" placeholder="e.g. smtp" {...register("email_provider")} />

          <Button type="submit" isLoading={bulkUpsert.isPending}>
            <Save className="mr-2 h-4 w-4" /> Save Configuration
          </Button>
        </form>
      </Card>
    </div>
  );
}
