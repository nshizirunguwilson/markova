"use client";

import { mediaUrl } from "@/lib/utils";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { useBulkUpsertConfig, useSchoolConfig } from "@/hooks/use-academic";
import { Input } from "@/components/ui";
import { useForm } from "react-hook-form";
import { Save } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export function StepBranding() {
  const { data } = useSchoolConfig();
  const bulkUpsert = useBulkUpsertConfig();
  const map = data?.map || {};

  const { register, handleSubmit } = useForm({
    values: { primary_color: map.primary_color || "#1B4F72" },
  });

  const onSaveColor = (data: any) => {
    bulkUpsert.mutate([{ key: "primary_color", value: data.primary_color }]);
  };

  const uploadFile = async (type: "logo" | "stamp" | "signature", file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post(`/school-config/upload/${type}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${type} uploaded successfully`);
    } catch {
      toast.error(`Failed to upload ${type}`);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Branding</h2>
      <p className="mb-6 text-sm text-muted">Upload your school&apos;s visual identity</p>

      <div className="space-y-6 max-w-lg">
        {/* Color */}
        <form onSubmit={handleSubmit(onSaveColor)} className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Primary Color</label>
            <input type="color" {...register("primary_color")} className="h-10 w-20 cursor-pointer rounded border border-border" />
          </div>
          <Button type="submit" size="sm" isLoading={bulkUpsert.isPending}>
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
        </form>

        {/* File uploads */}
        {(["logo", "stamp", "signature"] as const).map((type) => (
          <FileUploadField
            key={type}
            label={`School ${type.charAt(0).toUpperCase() + type.slice(1)}`}
            currentUrl={map[`${type}_url`]}
            onUpload={(file) => uploadFile(type, file)}
          />
        ))}
      </div>
    </div>
  );
}

function FileUploadField({
  label,
  currentUrl,
  onUpload,
}: {
  label: string;
  currentUrl?: string;
  onUpload: (file: File) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-accent-light/50">
          {currentUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- runtime upload on the API origin */
            <img
              src={mediaUrl(currentUrl)}
              alt={`Current ${label.toLowerCase()}`}
              className="h-full w-full object-contain p-1.5"
            />
          ) : (
            <Upload className="h-6 w-6 text-muted" aria-hidden="true" />
          )}
        </div>
        <div>
          <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
            Upload file
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
          <p className="text-xs text-muted">PNG, JPG or SVG, max 5MB</p>
          {currentUrl && <p className="text-xs text-success">Uploaded</p>}
        </div>
      </div>
    </div>
  );
}
