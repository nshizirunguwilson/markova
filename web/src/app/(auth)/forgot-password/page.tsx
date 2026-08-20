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

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const res = await api.post("/auth/request-reset", { email: data.email });
      setSent(true);
      // In development the API returns the token so the flow is demoable without email.
      if (res.data?.devToken) setDevToken(res.data.devToken);
      toast.success("If that account exists, a reset link has been sent.");
    } catch {
      // Always show success to avoid leaking which emails exist.
      setSent(true);
      toast.success("If that account exists, a reset link has been sent.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
    >

        {!sent ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register("email")}
            />
            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              <Mail className="mr-2 h-4 w-4" />
              Send reset link
            </Button>
          </form>
        ) : (
          <div className="space-y-5 text-center">
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
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
