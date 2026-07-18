"use client";

import { useForm } from "react-hook-form";
import { Card, CardTitle, Input, Button } from "@/components/ui";
import { useSchoolConfig, useBulkUpsertConfig } from "@/hooks/use-academic";
import { useBrandStore } from "@/stores/brand-store";
import { Save } from "lucide-react";

export function GeneralTab() {
  const { data } = useSchoolConfig();
  const bulkUpsert = useBulkUpsertConfig();
  const setBrand = useBrandStore((s) => s.setBrand);
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
    bulkUpsert.mutate(
      Object.entries(data).map(([key, value]) => ({ key, value: value as string })),
      {
        // Reflect name/motto live across the shell, but only once saved.
        onSuccess: () => setBrand({ schoolName: data.school_name, schoolMotto: data.school_motto }),
      }
    );
  };

  return (
    <Card>
      <CardTitle>General Information</CardTitle>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4 max-w-lg">
        <Input id="school_name" label="School Name" {...register("school_name")} />
        <Input id="school_motto" label="Motto" {...register("school_motto")} />
        <Input id="school_address" label="Address" {...register("school_address")} />
        <div className="grid grid-cols-2 gap-4">
          <Input id="school_phone" label="Phone" {...register("school_phone")} />
          <Input id="school_email" label="Email" {...register("school_email")} />
        </div>
        <Button type="submit" isLoading={bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </form>
    </Card>
  );
}
