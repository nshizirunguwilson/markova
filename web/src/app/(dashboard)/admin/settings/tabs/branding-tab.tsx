"use client";

import { useState } from "react";
import { Card, CardTitle, Button } from "@/components/ui";
import { useSchoolConfig, useBulkUpsertConfig } from "@/hooks/use-academic";
import { useBrandStore } from "@/stores/brand-store";
import { useForm } from "react-hook-form";
import { Upload, Save, Loader2, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { resolveUploadUrl } from "@/lib/assets";
import { errorMessage } from "@/lib/errors";

/** The three assets a school uploads, and where each one ends up. */
const ASSETS = [
  {
    type: "logo",
    label: "Logo",
    help: "The crest on report cards, letters, ID cards and the sidebar.",
  },
  {
    type: "stamp",
    label: "Stamp",
    help: "Printed beside the signature on every official document.",
  },
  {
    type: "signature",
    label: "Signature",
    help: "The head teacher's signature, printed above their name.",
  },
] as const;

type AssetType = (typeof ASSETS)[number]["type"];

// What the API actually stores; `image/*` also offers HEIC and SVG, which it
// refuses after the upload has already been sent.
const ACCEPT = "image/jpeg,image/png,image/gif,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

export function BrandingTab() {
  const { data } = useSchoolConfig();
  const bulkUpsert = useBulkUpsertConfig();
  const setBrand = useBrandStore((s) => s.setBrand);
  const qc = useQueryClient();
  const map = data?.map || {};
  const [busy, setBusy] = useState<AssetType | null>(null);

  const { register, handleSubmit } = useForm({
    values: { primary_color: map.primary_color || "#1B4F72" },
  });

  const onSaveColor = (data: any) => {
    bulkUpsert.mutate([{ key: "primary_color", value: data.primary_color }], {
      // Repaint the shell only once the save actually landed.
      onSuccess: () => setBrand({ primaryColor: data.primary_color }),
    });
  };

  const uploadFile = async (type: AssetType, file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} is larger than 5MB. Choose a smaller image.`);
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setBusy(type);
    try {
      const res = await api.post(`/school-config/upload/${type}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // Refetch config so the new asset preview shows immediately.
      await qc.invalidateQueries({ queryKey: ["school-config"] });
      // The sidebar reads the logo from the brand store, which is loaded once
      // on mount. Without this a replaced logo stayed the old one everywhere
      // outside this card until the tab was reloaded.
      if (type === "logo" && res.data?.value) {
        setBrand({ logoUrl: res.data.value });
      }
      toast.success(`${type} updated`);
    } catch (e) {
      // The server says which types it takes and why this one was refused -
      // far more use than a flat "Failed to upload logo".
      toast.error(errorMessage(e, `Failed to upload ${type}`));
    } finally {
      setBusy(null);
    }
  };

  const removeFile = async (type: AssetType) => {
    setBusy(type);
    try {
      await api.put("/school-config", { key: `${type}_url`, value: "" });
      await qc.invalidateQueries({ queryKey: ["school-config"] });
      if (type === "logo") setBrand({ logoUrl: "" });
      toast.success(`${type} removed`);
    } catch (e) {
      toast.error(errorMessage(e, `Failed to remove ${type}`));
    } finally {
      setBusy(null);
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
        <p className="mt-2 text-xs text-muted">
          Repaints the dashboard and every document the school issues.
        </p>
      </Card>

      <Card>
        <CardTitle>School Assets</CardTitle>
        <p className="mt-1 text-sm text-muted">
          JPEG, PNG, GIF or WebP, up to 5MB. A stamp and signature on a
          transparent background sit best on a letter.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {ASSETS.map(({ type, label, help }) => {
            const current = resolveUploadUrl(map[`${type}_url`]);
            const isBusy = busy === type;
            return (
              <div key={type} className="text-center">
                <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-accent-light/50">
                  {isBusy ? (
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  ) : current ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current} alt={`Current ${label}`} className="h-full w-full object-contain" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted" />
                  )}
                </div>
                <p className="mb-1 text-sm font-medium">{label}</p>
                <p className="mx-auto mb-2 max-w-[16rem] text-xs text-muted">{help}</p>
                <div className="flex items-center justify-center gap-3">
                  <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                    {current ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept={ACCEPT}
                      aria-label={`Upload ${label}`}
                      disabled={isBusy}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        // Clear the input so picking the same file twice after
                        // a failure still fires a change event.
                        e.target.value = "";
                        if (file) void uploadFile(type, file);
                      }}
                    />
                  </label>
                  {current && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void removeFile(type)}
                      className="flex items-center gap-1 text-xs font-medium text-danger hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
