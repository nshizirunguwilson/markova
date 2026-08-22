"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, ArrowLeft } from "lucide-react";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/layout/auth-shell";
import { errorMessage } from "@/lib/errors";

/** True when the request never reached the API at all. */
function isUnreachable(error: unknown): boolean {
  return !(error as { response?: unknown })?.response;
}

/**
 * Takes an email or a phone number, for the same reason the login form does:
 * most parents on this system are registered with a phone number and no email
 * at all. Demanding an email here left them with a working login and no way to
 * recover it. The API accepts either field, and mobile already sent both.
 */
const schema = z.object({
  identifier: z
    .string()
    .min(1, "Enter your email or phone number")
    .refine(
      (v) => /^\S+@\S+\.\S+$/.test(v.trim()) || /^\+?\d[\d\s]{7,}$/.test(v.trim()),
      "That does not look like an email or a phone number",
    ),
});
type FormData = z.infer<typeof schema>;

/**
 * The API takes `email` and `phone` as separate fields and runs a whitelisting
 * validation pipe, so one combined value would be rejected. Splitting it here
 * keeps that detail out of the form.
 */
function buildCredential(identifier: string): { email?: string; phone?: string } {
  const value = identifier.trim();
  return value.includes("@")
    ? { email: value.toLowerCase() }
    : { phone: value.replace(/\s/g, "") };
}

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "" },
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const res = await api.post(
        "/auth/request-reset",
        buildCredential(data.identifier),
      );
      setSent(true);
      // In development the API returns the token so the flow is demoable without email.
      if (res.data?.devToken) setDevToken(res.data.devToken);
      toast.success("If that account exists, a reset link has been sent.");
    } catch (error) {
      // The same message either way: telling someone "no such account" is a way
      // to find out who is registered here. A request that never reached the
      // server is different, though. Claiming a link is on its way would leave
      // them waiting for a message nobody was ever asked to send.
      if (isUnreachable(error)) {
        toast.error(errorMessage(error, "Could not send the reset link."));
      } else {
        setSent(true);
        toast.success("If that account exists, a reset link has been sent.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email or phone number and we'll send you a reset link."
    >

        {!sent ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              id="identifier"
              label="Email or phone"
              placeholder="you@markova.edu or +250788…"
              error={errors.identifier?.message}
              {...register("identifier")}
            />
            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              <Mail className="mr-2 h-4 w-4" />
              Send reset link
            </Button>
          </form>
        ) : (
          <div className="space-y-5 text-center">
            <div className="rounded-lg bg-success-wash p-4 text-sm text-success">
              If an account with that email exists, a password-reset link is on its way.
              The link expires in 30 minutes.
            </div>
            {devToken && (
              <Link
                href={`/reset-password?token=${devToken}`}
                className="block rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10"
              >
                Dev shortcut: continue to reset →
              </Link>
            )}
          </div>
        )}

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-1 text-sm text-muted hover:text-primary-light"
        >
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>
    </AuthShell>
  );
}
