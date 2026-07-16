"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, LogIn, KeyRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useBrandStore } from "@/stores/brand-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or phone is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const otpSchema = z.object({
  otp: z.string().min(6, "Enter the 6-digit code").max(6),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/,
        "Needs upper, lower, number and a special character"
      ),
    confirmPassword: z.string().min(8, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type LoginFormData = z.infer<typeof loginSchema>;
type OtpFormData = z.infer<typeof otpSchema>;
type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

// ─── Role → Dashboard Route ───────────────────────────────────────────────────

function getDashboardRoute(role: string): string {
  const routes: Record<string, string> = {
    ADMIN: "/admin",
    TEACHER: "/teacher",
    STUDENT: "/student",
    PARENT: "/parent",
    LIBRARIAN: "/librarian",
  };
  return routes[role] || "/admin";
}

// ─── Timing (mirrors backend) ─────────────────────────────────────────────────

const OTP_TTL_SECONDS = 300; // backend OTP_EXPIRY_MINUTES (5 min)
const RESEND_COOLDOWN_SECONDS = 30; // backend RESEND_COOLDOWN_SECONDS

function formatMmSs(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Login Page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const schoolName = useBrandStore((s) => s.schoolName);

  const [step, setStep] = useState<"login" | "otp" | "change-password">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState("");
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpiry, setOtpExpiry] = useState(0);
  const [isResending, setIsResending] = useState(false);

  // ─── Login Form ─────────────────────────────────────────────────────────────

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const isEmail = data.identifier.includes("@");
      const payload = isEmail
        ? { email: data.identifier, password: data.password }
        : { phone: data.identifier, password: data.password };

      const res = await api.post("/auth/login", payload);

      if (res.data.requiresOtp) {
        setOtpSessionId(res.data.sessionId);
        setStep("otp");
        setOtpExpiry(OTP_TTL_SECONDS);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        toast.info("OTP sent to your email");
      } else {
        handleLoginSuccess(res.data);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || "Login failed";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── OTP Form ───────────────────────────────────────────────────────────────

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  });

  const onVerifyOtp = async (data: OtpFormData) => {
    setIsLoading(true);
    try {
      const res = await api.post("/auth/verify-otp", {
        sessionId: otpSessionId,
        otp: data.otp,
      });
      handleLoginSuccess(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.message || "Invalid OTP";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const onResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      const res = await api.post("/auth/resend-otp", {
        sessionId: otpSessionId,
      });
      if (res.data.sessionId) setOtpSessionId(res.data.sessionId);
      setOtpExpiry(OTP_TTL_SECONDS);
      setResendCooldown(res.data.cooldownSeconds ?? RESEND_COOLDOWN_SECONDS);
      otpForm.reset({ otp: "" });
      toast.success("A new code has been sent");
    } catch (err: any) {
      const msg = err.response?.data?.message || "Could not resend code";
      toast.error(msg);
      // Server-side cooldown hit — reflect a wait on the button
      if (err.response?.status === 429 && resendCooldown <= 0) {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setIsResending(false);
    }
  };

  // Tick down the resend cooldown and the code-expiry while on the OTP step
  useEffect(() => {
    if (step !== "otp") return;
    const id = setInterval(() => {
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
      setOtpExpiry((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  // Auto-submit once all 6 digits are entered
  const otpValue = otpForm.watch("otp");
  useEffect(() => {
    if (step === "otp" && otpValue?.length === 6 && !isLoading) {
      otpForm.handleSubmit(onVerifyOtp)();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue]);

  // ─── Change Password Form ──────────────────────────────────────────────────

  const changeForm = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onChangePassword = async (data: ChangePasswordFormData) => {
    setIsLoading(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success("Password changed successfully");

      // Update user state and redirect
      if (pendingUser) {
        setUser({ ...pendingUser, forcePasswordChange: false });
        router.push(getDashboardRoute(pendingUser.role));
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to change password";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Login Success Handler ──────────────────────────────────────────────────

  function handleLoginSuccess(data: {
    accessToken: string;
    refreshToken: string;
    user: any;
  }) {
    localStorage.setItem("access_token", data.accessToken);
    localStorage.setItem("refresh_token", data.refreshToken);

    if (data.user.forcePasswordChange) {
      setPendingUser(data.user);
      setStep("change-password");
      toast.warning("You must change your password before continuing");
    } else {
      setUser(data.user);
      router.push(getDashboardRoute(data.user.role));
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-accent-light">
      <Card className="w-full max-w-md" padding="lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <BrandMark className="mx-auto mb-4 h-14 w-auto max-w-[180px]" />
          <h1 className="text-xl md:text-2xl font-bold text-primary">{schoolName}</h1>
          <p className="mt-1 text-sm text-muted">School Management System</p>
        </div>

        {/* Step: Login */}
        {step === "login" && (
          <form
            method="post"
            onSubmit={loginForm.handleSubmit(onLogin)}
            className="space-y-5"
          >
            <Input
              id="identifier"
              label="Email or Phone"
              placeholder="Enter your email or phone"
              error={loginForm.formState.errors.identifier?.message}
              {...loginForm.register("identifier")}
            />

            <div className="relative">
              <Input
                id="password"
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                error={loginForm.formState.errors.password?.message}
                {...loginForm.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-8.5 text-muted hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Button>

            <p className="text-center text-xs text-muted">
              Forgot password?{" "}
              <a href="/forgot-password" className="text-primary-light hover:underline">
                Reset it here
              </a>
            </p>
          </form>
        )}

        {/* Step: OTP */}
        {step === "otp" && (
          <form onSubmit={otpForm.handleSubmit(onVerifyOtp)} className="space-y-5">
            <div className="mb-2 text-center">
              <KeyRound className="mx-auto mb-2 h-8 w-8 text-primary-light" />
              <p className="text-sm text-muted">
                Enter the 6-digit code sent to your registered contact
              </p>
            </div>

            <Input
              id="otp"
              label="Verification Code"
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d*"
              autoFocus
              className="text-center text-2xl tracking-[0.5em]"
              error={otpForm.formState.errors.otp?.message}
              {...otpForm.register("otp")}
            />

            {/* Expiry countdown */}
            <p className="text-center text-xs">
              {otpExpiry > 0 ? (
                <span className="text-muted">
                  Code expires in{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMmSs(otpExpiry)}
                  </span>
                </span>
              ) : (
                <span className="text-danger">
                  Your code has expired — request a new one below.
                </span>
              )}
            </p>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              Verify & Continue
            </Button>

            {/* Resend */}
            <div className="text-center text-sm">
              <span className="text-muted">Didn&apos;t get the code? </span>
              <button
                type="button"
                onClick={onResendOtp}
                disabled={resendCooldown > 0 || isResending}
                className="font-medium text-primary-light hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
              >
                {isResending
                  ? "Sending…"
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend code"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setStep("login");
                setOtpSessionId("");
                setResendCooldown(0);
                setOtpExpiry(0);
                otpForm.reset({ otp: "" });
              }}
              className="block w-full text-center text-sm text-muted hover:text-primary-light"
            >
              Back to login
            </button>
          </form>
        )}

        {/* Step: Force Password Change */}
        {step === "change-password" && (
          <form
            method="post"
            onSubmit={changeForm.handleSubmit(onChangePassword)}
            className="space-y-5"
          >
            <div className="mb-2 rounded-lg bg-amber-50 p-3 text-center">
              <p className="text-sm font-medium text-amber-700">
                You must change your password before continuing
              </p>
            </div>

            <Input
              id="currentPassword"
              label="Current Password"
              type="password"
              placeholder="Enter current password"
              error={changeForm.formState.errors.currentPassword?.message}
              {...changeForm.register("currentPassword")}
            />

            <Input
              id="newPassword"
              label="New Password"
              type="password"
              placeholder="At least 8 characters"
              error={changeForm.formState.errors.newPassword?.message}
              {...changeForm.register("newPassword")}
            />

            <Input
              id="confirmPassword"
              label="Confirm New Password"
              type="password"
              placeholder="Re-enter new password"
              error={changeForm.formState.errors.confirmPassword?.message}
              {...changeForm.register("confirmPassword")}
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              Change Password & Continue
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
