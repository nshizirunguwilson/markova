"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";

import { Button, Card, CardTitle } from "@/components/ui";
import { useSendDocument, type PublicStatus } from "@/hooks/use-admissions";
import { DOCUMENT_LABEL, type DocumentKind } from "@/lib/admissions";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "application/pdf,image/jpeg,image/png";

/**
 * Where a family sends the papers the school is waiting for.
 *
 * The decks promised parents attach them, and nothing took a file. Each thing
 * still missing gets its own button, and what has been sent is listed with
 * whether the office has checked it yet. The size is checked here before
 * anything is sent, so a family on a slow connection does not wait for a
 * refusal.
 */
export function SendDocuments({
  status,
  reference,
  dateOfBirth,
  onSent,
}: {
  status: PublicStatus;
  reference: string;
  dateOfBirth: string;
  onSent: () => void;
}) {
  const send = useSendDocument();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind | null>(null);
  const [tooBig, setTooBig] = useState(false);

  const closed = ["ENROLLED", "REJECTED", "WITHDRAWN"].includes(status.status);
  const missing = status.stillNeededKinds ?? [];
  const sent = status.sent ?? [];
  if (closed || (missing.length === 0 && sent.length === 0)) return null;

  const choose = (k: DocumentKind) => {
    setKind(k);
    setTooBig(false);
    input.current?.click();
  };

  const picked = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file || !kind) return;
    if (file.size > MAX_BYTES) {
      setTooBig(true);
      return;
    }
    send.mutate({ reference, dateOfBirth, kind, file }, { onSuccess: onSent });
  };

  return (
    <Card>
      <CardTitle className="mb-1">Send documents</CardTitle>
      <p className="mb-4 text-sm text-muted">
        A PDF or a clear photograph of each, up to 5 MB. You can also bring the
        originals to the school office.
      </p>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="Choose the file to send"
        tabIndex={-1}
        onChange={(e) => picked(e.target.files?.[0])}
      />

      {missing.length > 0 && (
        <ul className="space-y-2">
          {missing.map((k) => (
            <li key={k} className="flex items-center justify-between gap-3">
              <span className="text-sm">{DOCUMENT_LABEL[k] ?? k}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => choose(k)}
                isLoading={send.isPending && kind === k}
                aria-label={`Send ${DOCUMENT_LABEL[k] ?? k}`}
              >
                <Upload className="mr-1 h-4 w-4" aria-hidden /> Send
              </Button>
            </li>
          ))}
        </ul>
      )}

      {tooBig && (
        <p role="alert" className="mt-3 text-sm text-danger">
          That file is over 5 MB. Take a smaller photograph, or save the PDF at a
          lower quality, and send it again.
        </p>
      )}

      {sent.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Already sent
          </p>
          <ul className="space-y-1">
            {sent.map((d, i) => (
              <li key={`${d.kind}-${i}`} className="flex items-center gap-2 text-sm">
                <CheckCircle2
                  className={d.checked ? "h-4 w-4 text-success" : "h-4 w-4 text-muted"}
                  aria-hidden
                />
                {d.label}
                <span className="text-xs text-muted">
                  {d.checked ? "checked by the school" : "waiting to be checked"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
