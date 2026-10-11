"use client";

import { Button, Modal } from "@/components/ui";
import type { IdleState } from "@/hooks/use-idle-sign-out";

/** "Still there?", a minute before a computer nobody is using signs out. */
export function IdleWarning({
  state,
  onStay,
}: {
  state: IdleState;
  onStay: () => void;
}) {
  if (state.kind !== "warning") return null;
  return (
    <Modal isOpen onClose={onStay} title="Still there?">
      <div className="space-y-4">
        <p className="text-sm text-foreground" role="timer" aria-live="polite">
          Nobody has used this computer for a while. You will be signed out in{" "}
          {state.secondsLeft} {state.secondsLeft === 1 ? "second" : "seconds"}, so
          the next person cannot open your account.
        </p>
        <div className="flex justify-end">
          <Button onClick={onStay}>Stay signed in</Button>
        </div>
      </div>
    </Modal>
  );
}
