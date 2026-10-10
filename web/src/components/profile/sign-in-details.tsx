"use client";

import { useState } from "react";
import { KeyRound, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Button, Card, Input } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";

type Field = "email" | "phone";

const LABEL: Record<Field, string> = { email: "email", phone: "phone number" };

/**
 * How the person signs in, and the one way to change it.
 *
 * The email or phone a person signs in with belongs to their login, which
 * every school they belong to shares, so only they may change it, and only
 * after proving they hold the new one: a code goes to it, and nothing changes
 * until it comes back. This is distinct from the contact details above it,
 * which are how this school reaches them.
 */
export function SignInDetails() {
  const { user, setUser } = useAuthStore();
  const [field, setField] = useState<Field | null>(null);
  const [value, setValue] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const login = user.login ?? { email: user.email, phone: user.phone };

  const reset = () => {
    setField(null);
    setValue("");
    setSessionId(null);
    setCode("");
    setDevCode(null);
  };

  const sendCode = async () => {
    if (!field || !value.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login-details", {
        [field]: value.trim(),
      });
      setSessionId(data.sessionId);
      setDevCode(data.devOtp ?? null);
      toast.info(`A code is on its way to ${value.trim()}`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the code"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!sessionId || code.length !== 6) return;
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login-details/confirm", {
        sessionId,
        code,
      });
      setUser({ ...user, ...data });
      toast.success(`You now sign in with ${value.trim()}`);
      reset();
    } catch (err) {
      toast.error(errorMessage(err, "Could not change how you sign in"));
    } finally {
      setBusy(false);
    }
  };

  const row = (f: Field, Icon: typeof Mail) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground-muted">
          <Icon aria-hidden="true" className="mr-1 inline h-4 w-4" />
          {f === "email" ? "Email" : "Phone"}
        </p>
        <p className="truncate text-sm text-foreground">
          {login[f] || "Not set"}
        </p>
      </div>
      {field === null && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setField(f)}
          aria-label={`Change the ${LABEL[f]} you sign in with`}
        >
          {login[f] ? "Change" : "Add"}
        </Button>
      )}
    </div>
  );

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          <KeyRound aria-hidden="true" className="mr-1 inline h-4 w-4" /> How
          you sign in
        </h3>
        <p className="mt-1 text-sm text-muted">
          The same at every school you belong to. Only you can change it.
        </p>
      </div>

      {row("email", Mail)}
      {row("phone", Phone)}

      {field && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          {!sessionId ? (
            <>
              <Input
                id="new-login"
                label={`New ${LABEL[field]}`}
                type={field === "email" ? "email" : "tel"}
                placeholder={
                  field === "email" ? "you@example.com" : "+250788123456"
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted">
                We will send a code to it. Nothing changes until you enter
                the code.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={sendCode}
                  isLoading={busy}
                  disabled={!value.trim()}
                >
                  Send code
                </Button>
              </div>
            </>
          ) : (
            <>
              <Input
                id="login-code"
                label={`Code sent to ${value.trim()}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
              {devCode && (
                <button
                  type="button"
                  onClick={() => setCode(devCode)}
                  className="block w-full rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2 text-sm font-medium text-primary hover:bg-primary/10"
                >
                  Dev shortcut: use code {devCode}
                </button>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={confirm}
                  isLoading={busy}
                  disabled={code.length !== 6}
                >
                  Confirm
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
