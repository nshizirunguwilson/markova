"use client";

import { EyeOff } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Something an adult child keeps from their parents.
 *
 * Said calmly, and plainly a choice rather than a fault: an empty page would
 * have a parent phoning the school to ask what broke. The sentence comes from
 * the API ("Keza has chosen to keep their health visits private."), so it is
 * the same wherever it shows.
 */
export function KeptPrivateNotice({ message }: { message: string }) {
  return (
    <Card>
      <div className="flex items-start gap-3" data-testid="kept-private">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted">
          <EyeOff className="h-5 w-5 text-muted" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{message}</p>
          <p className="mt-1 text-sm text-muted">
            From 18, a student decides what their parents see. Fees are always
            shared with whoever pays them.
          </p>
        </div>
      </div>
    </Card>
  );
}
