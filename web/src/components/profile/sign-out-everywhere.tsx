"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { MonitorX } from "lucide-react";

import { Button, Card } from "@/components/ui";
import { signOut } from "@/lib/sign-out";

/**
 * Ending every sign in, on every device and in every school.
 *
 * For the student who left the lab without signing out, or the parent who
 * lost a phone. This device is signed out too.
 */
export function SignOutEverywhere() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  return (
    <Card className="p-6 space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <MonitorX aria-hidden="true" className="h-4 w-4 text-muted" />
        Signed in somewhere else?
      </h2>
      <p className="text-sm text-muted">
        If you left a computer signed in, at the school lab or a cyber café, sign
        out everywhere. Every device will need your password again, this one too.
      </p>
      <Button
        variant="outline"
        isLoading={busy}
        onClick={async () => {
          setBusy(true);
          await signOut(queryClient, { everywhere: true });
          router.push("/login");
        }}
      >
        Sign out everywhere
      </Button>
    </Card>
  );
}
