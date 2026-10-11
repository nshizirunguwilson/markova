"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Button, Card, CardTitle } from "@/components/ui";

/** Roles that can hold the post: everybody who works for the school. */
const NOT_STAFF = ["STUDENT", "PARENT"];

/**
 * Naming a member of staff a safeguarding lead.
 *
 * A lead watches over every chat between a member of staff and a student, so
 * that no child is ever alone in a chat with an adult. A school with no lead
 * named has its principal do it instead.
 */
export function SafeguardingLead({
  userId,
  role,
  isActive,
  lead,
}: {
  userId: string;
  role: string;
  isActive: boolean;
  lead: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (NOT_STAFF.includes(role)) return null;
  // Somebody who has left can be stood down, but not named.
  if (!isActive && !lead) return null;

  const set = async (next: boolean) => {
    setBusy(true);
    try {
      await api.put(`/users/${userId}/safeguarding-lead`, { lead: next });
      await queryClient.invalidateQueries({ queryKey: ["user", userId] });
      toast.success(
        next ? "Named a safeguarding lead" : "No longer a safeguarding lead",
      );
    } catch (err) {
      toast.error(errorMessage(err, "Could not change that"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle>Safeguarding</CardTitle>
      <div className="mt-3 space-y-3">
        <p className="flex items-start gap-2 text-sm text-foreground">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted"
          />
          <span data-testid="safeguarding-status">
            {lead
              ? "A safeguarding lead. Watches over every chat between a member of staff and a student."
              : "Not a safeguarding lead."}
          </span>
        </p>
        <p className="text-xs text-muted">
          Every chat between staff and a student is watched over by the
          school&apos;s safeguarding leads, so no child is ever alone in a chat
          with an adult. Where the school names none, the principal does it.
        </p>
        <Button
          size="sm"
          variant={lead ? "outline" : "primary"}
          disabled={busy}
          onClick={() => set(!lead)}
        >
          {lead ? "Stand down as safeguarding lead" : "Make safeguarding lead"}
        </Button>
      </div>
    </Card>
  );
}
