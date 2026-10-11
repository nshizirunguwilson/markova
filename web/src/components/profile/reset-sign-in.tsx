"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Button, Input } from "@/components/ui";
import { Modal } from "@/components/ui/modal";

/**
 * A school's way back in for somebody who lost their phone.
 *
 * Normally only the person changes how they sign in. The one exception: when
 * this school is the only one they belong to, its admin may reset it, after
 * checking in person who they are. The API decides whether that applies and
 * says so if it does not. The new password is shown once, here, and must be
 * changed at the first sign in.
 */
export function ResetSignIn({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    login: { email: string | null; phone: string | null };
    password: string;
  } | null>(null);

  const close = () => {
    setOpen(false);
    setPhone("");
    setEmail("");
    setResult(null);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/users/${userId}/reset-login`, {
        ...(phone.trim() && { phone: phone.trim() }),
        ...(email.trim() && { email: email.trim() }),
      });
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ["user", userId] });
    } catch (err) {
      toast.error(errorMessage(err, "Could not reset how they sign in"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound aria-hidden="true" className="mr-1.5 h-4 w-4" />
        Reset sign in
      </Button>

      <Modal isOpen={open} onClose={close} title="Reset sign in">
        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              {name} can now sign in with{" "}
              <span className="font-medium">
                {result.login.phone || result.login.email}
              </span>{" "}
              and this password. They will choose their own when they first
              sign in.
            </p>
            <p className="rounded-lg bg-accent-light p-3 text-center font-mono text-lg tracking-wider text-foreground">
              {result.password}
            </p>
            <p className="text-xs text-muted">
              It is shown only once. Every device they were signed in on has
              been signed out.
            </p>
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              For somebody who lost their phone. Check who they are in person
              first. This works only when this school is the only one they
              belong to; otherwise they change it themselves from their
              profile.
            </p>
            <Input
              id="reset-phone"
              label="New phone (optional)"
              type="tel"
              placeholder="+250788123456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              id="reset-email"
              label="New email (optional)"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={submit} isLoading={busy}>
                Reset and make a password
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
