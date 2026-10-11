"use client";

import { useState } from "react";

import { Button, Card, CardTitle, Input, Modal } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";
import { useParentPassedAway } from "@/hooks/use-journey";
import { dayWords, schoolToday } from "@/lib/standing";

/**
 * Recording that a parent or guardian passed away.
 *
 * Their account closes so nothing more is sent to them. Each child's class
 * teacher is told privately, and a child left with no parent or guardian at
 * all is put to the principal straight away.
 */
export function ParentPassedAway({
  userId,
  name,
  passedAwayOn,
}: {
  userId: string;
  name: string;
  passedAwayOn: string | null;
}) {
  const role = useAuthStore((s) => s.user?.role);
  const record = useParentPassedAway(userId);
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState("");
  const [note, setNote] = useState("");

  if (role !== "ADMIN") return null;

  if (passedAwayOn) {
    return (
      <Card>
        <CardTitle>Family</CardTitle>
        <p className="mt-3 text-sm text-foreground" data-testid="parent-passed-away">
          Passed away on {dayWords(passedAwayOn)}. Nothing is sent to {name} any more.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Family</CardTitle>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted">
          If {name} has passed away, record it here so nothing more is sent to
          them, and so the school is asked who now looks after their children.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOn(schoolToday());
            setNote("");
            setOpen(true);
          }}
        >
          Passed away
        </Button>
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Passed away: ${name}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Their account closes, so nothing more is sent to them. Each of their
            children&apos;s class teachers is told privately. A child left with no
            parent or guardian in Markova is put to you at once, so you can add
            who looks after them now.
          </p>
          <Input label="Date" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!on}
              isLoading={record.isPending}
              onClick={() =>
                record.mutate(
                  { on, ...(note.trim() && { note: note.trim() }) },
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              Record
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
