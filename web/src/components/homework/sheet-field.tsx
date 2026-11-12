"use client";

import { useId, useRef } from "react";
import { Paperclip, X } from "lucide-react";

import { Button, Spinner } from "@/components/ui";
import { useUploadSheet } from "@/hooks/use-homework";

export interface Sheet {
  fileUrl: string;
  fileName: string;
}

/**
 * The file a piece of work is set on: a past paper, a worksheet, a reading.
 *
 * Uploads as soon as a file is picked, so saving the form is one step and a
 * refused file is heard about while the teacher is still looking at it. The
 * field holds what the upload answered; the form sends that with the rest.
 */
export function SheetField({
  value,
  onChange,
}: {
  value: Sheet | null;
  onChange: (sheet: Sheet | null) => void;
}) {
  const upload = useUploadSheet();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await upload.mutateAsync(file));
    } catch {
      /* The hook has already said so in a toast. */
    } finally {
      // The same file can be picked again after a refusal.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        File (optional)
      </label>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            <Paperclip className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="truncate">{value.fileName}</span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Remove the file"
            onClick={() => onChange(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            id={id}
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp"
            className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
            onChange={(e) => pick(e.target.files?.[0])}
            disabled={upload.isPending}
          />
          {upload.isPending && <Spinner size="sm" />}
        </div>
      )}
    </div>
  );
}
