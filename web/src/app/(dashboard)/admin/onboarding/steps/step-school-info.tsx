"use client";

import { useForm } from "react-hook-form";
import { Input, Button } from "@/components/ui";
import { useBulkUpsertConfig, useSchoolConfig } from "@/hooks/use-academic";
import { Save } from "lucide-react";

export function StepSchoolInfo() {
  const { data } = useSchoolConfig();
  const bulkUpsert = useBulkUpsertConfig();
  const map = data?.map || {};

  const { register, handleSubmit } = useForm({
    values: {
      school_name: map.school_name || "",
      school_motto: map.school_motto || "",
      school_address: map.school_address || "",
      school_phone: map.school_phone || "",
      school_email: map.school_email || "",
    },
  });

  const onSubmit = (data: any) => {
    const configs = Object.entries(data).map(([key, value]) => ({
      key,
      value: value as string,
    }));
    bulkUpsert.mutate(configs);
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">School Information</h2>
      <p className="mb-6 text-sm text-muted">Enter your school&apos;s basic details</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
        <Input id="school_name" label="School Name" placeholder="e.g. Markova Academy" {...register("school_name")} />
        <Input id="school_motto" label="School Motto" placeholder="e.g. Excellence Through Knowledge" {...register("school_motto")} />
        <Input id="school_address" label="Address" placeholder="123 Education Street" {...register("school_address")} />
        <div className="grid grid-cols-2 gap-4">
          <Input id="school_phone" label="Phone" placeholder="+256700000000" {...register("school_phone")} />
          <Input id="school_email" label="Email" placeholder="info@school.com" {...register("school_email")} />
        </div>
        <Button type="submit" isLoading={bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save
        </Button>
      </form>
    </div>
  );
}
