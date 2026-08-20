"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, ArrowLeft } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/layout/auth-shell";
import { errorMessage } from "@/lib/errors";

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, "At least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/,
        "Needs upper, lower, number and a special character"
      ),
    confirmPassword: z.string().min(8, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type FormData = z.infer<typeof schema>;

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (data: FormData) => {
    if (!token) {
      toast.error("Missing or invalid reset link.");
      return;
    }
    setIsLoading(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword: data.newPassword });
      toast.success("Password reset. Please log in with your new password.");
      router.push("/login");
    } catch (err: any) {
      toast.error(errorMessage(err, "Reset link is invalid or has expired."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {!token ? (
        <div className="rounded-lg bg-danger-wash p-4 text-center text-sm text-danger">
          This reset link is missing its token. Request a new one from the
          {" "}
          <Link href="/forgot-password" className="font-medium underline">forgot-password</Link> page.
        </div>
      ) : (
        <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            id="newPassword"
            label="New Password"
            type="password"
            placeholder="At least 8 characters"
            error={errors.newPassword?.message}
            {...register("newPassword")}
          />
          <Input
            id="confirmPassword"
            label="Confirm New Password"
            type="password"
            placeholder="Re-enter new password"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />
          <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
            <KeyRound className="mr-2 h-4 w-4" />
            Reset password
          </Button>
        </form>
      )}

      <Link
        href="/login"
        className="mt-6 flex items-center justify-center gap-1 text-sm text-muted hover:text-primary-light"
      >
        <ArrowLeft className="h-4 w-4" /> Back to login
      </Link>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password you don't use elsewhere."
    >
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ResetPasswordInner />
      </Suspense>
    </AuthShell>
  );
}
