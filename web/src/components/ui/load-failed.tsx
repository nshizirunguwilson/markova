"use client";

import { RefreshCw } from "lucide-react";

/**
 * What a list says when it could not be loaded.
 *
 * Without it a failed request drew the empty state: "Showing 0 books ... No
 * books found", over a library with 1,200 of them. A librarian would believe
 * the catalogue was gone. A failure has to look like a failure, say what did
 * not load, and offer to try again.
 */
export function LoadFailed({
  what,
  onRetry,
}: {
  /** What did not load, as the page would name it: "the books". */
  what: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-border py-16 text-center"
    >
      <p className="text-lg font-semibold text-foreground">Could not load {what}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Nothing has been lost. The connection or the server did not answer this time.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Try again
      </button>
    </div>
  );
}
