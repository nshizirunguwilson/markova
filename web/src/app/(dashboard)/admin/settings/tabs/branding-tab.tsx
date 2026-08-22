"use client";

import { Card, CardTitle, Button } from "@/components/ui";
import { useSchoolConfig, useBulkUpsertConfig } from "@/hooks/use-academic";
import { useBrandStore } from "@/stores/brand-store";
import { useForm } from "react-hook-form";
import { Upload, Save } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { resolveUploadUrl } from "@/lib/assets";

export function BrandingTab() {
  const { data } = useSchoolConfig();
  const bulkUpsert = useBulkUpsertConfig();
  const setBrand = useBrandStore((s) => s.setBrand);
  const qc = useQueryClient();
  const map = data?.map || {};

  const { register, handleSubmit } = useForm({
    values: { primary_color: map.primary_color || "#1B4F72" },
  });

  const onSaveColor = (data: any) => {
    bulkUpsert.mutate([{ key: "primary_color", value: data.primary_color }], {
      // Repaint the shell only once the save actually landed.
      onSuccess: () => setBrand({ primaryColor: data.primary_color }),
    });
  };

  const uploadFile = async (type: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post(`/school-config/upload/${type}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // Refetch config so the new asset preview shows immediately.
      await qc.invalidateQueries({ queryKey: ["school-config"] });
      toast.success(`${type} uploaded`);
    } catch {
      toast.error(`Failed to upload ${type}`);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Primary Color</CardTitle>
        <form onSubmit={handleSubmit(onSaveColor)} className="mt-4 flex items-end gap-4">
          <div>
            <label htmlFor="f-color" className="block text-sm font-medium text-foreground mb-1.5">Color</label>
            <input id="f-color" type="color" {...register("primary_color")} className="h-10 w-20 cursor-pointer rounded border border-input" />
          </div>
          <Button type="submit" size="sm" isLoading={bulkUpsert.isPending}>
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>School Assets</CardTitle>
        <div className="mt-4 grid grid-cols-3 gap-6">
          {(["logo", "stamp", "signature"] as const).map((type) => {
            const current = resolveUploadUrl(map[`${type}_url`]);
            return (
              <div key={type} className="text-center">
                <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-accent-light/50">
                  {current ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current} alt={`Current ${type}`} className="h-full w-full object-contain" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted" />
                  )}
                </div>
                <p className="mb-2 text-sm font-medium capitalize">{type}</p>
                <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                  {current ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadFile(type, e.target.files[0])}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
