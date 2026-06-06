"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

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
      toast.error(err.response?.data?.message || "Reset link is invalid or has expired.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md" padding="lg">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
          <ShieldCheck className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-primary">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">Choose a strong password you don&apos;t use elsewhere.</p>
      </div>

      {!token ? (
        <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-600">
          This reset link is missing its token. Request a new one from the
          {" "}
          <Link href="/forgot-password" className="font-medium underline">forgot-password</Link> page.
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-accent-light">
      <Suspense fallback={<Card className="w-full max-w-md" padding="lg">Loading…</Card>}>
        <ResetPasswordInner />
      </Suspense>
    </div>
  );
}
