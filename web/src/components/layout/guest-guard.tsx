"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";

/**
 * The mirror of {@link DashboardShell}'s guard: signed-in people do not get to
 * see the signed-out screens.
 *
 * Without this, the browser back button walked straight from a dashboard onto
 * the login form. The page is a plain client route, so nothing stopped it
 * rendering. Worse, the form was live: signing in again minted a second
 * session, and a half-typed identifier sat on screen for whoever walked past.
 */

// Routes in this group that stay reachable with a live session. A reset link
// arrives by email and carries its own single-use token; the person clicking it
// is often already signed in on this browser, and bouncing them to a dashboard
// would burn the link for nothing.
const ALWAYS_PUBLIC = ["/reset-password"];

/**
 * Where a role lands after signing in.
 *
 * The boarding staff have no dashboard of their own; their work lives on the
 * pocket money and clinic pages under /admin, which the shell lets them
 * through to. Sending them to /patron would be a 404.
 */
function dashboardFor(role: string): string {
  if (role === "PATRON" || role === "MATRON") return "/admin/pocket-money";
  if (role === "NURSE") return "/admin/health";
  return `/${role.toLowerCase()}`;
}

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, setUser, logout } = useAuthStore();

  const exempt = ALWAYS_PUBLIC.some((p) => pathname.startsWith(p));
  // Start closed. Rendering the form first and redirecting after would flash
  // the very screen this guard exists to hide. An exempt route is let through
  // by the `checking` expression below rather than by resolving this state, so
  // that navigating into one mid-check cannot strand it on the spinner.
  const [resolved, setResolved] = useState(false);
  const checking = !exempt && !resolved;

  useEffect(() => {
    if (exempt) return;

    let cancelled = false;

    async function check() {
      // Already resolved in this tab, so there is no need to ask the API twice.
      if (isAuthenticated && user) {
        if (!user.forcePasswordChange) {
          router.replace(dashboardFor(user.role));
          return;
        }
        // Mid forced-change flow. The step that handles it lives on this page.
        setResolved(true);
        return;
      }

      const token = localStorage.getItem("access_token");
      if (!token) {
        if (!cancelled) setResolved(true);
        return;
      }

      // A token in storage is not proof of a live session: it may be revoked,
      // past refreshing, or belong to a since-deactivated user. Ask the API,
      // which is the only thing that actually knows.
      try {
        const res = await api.get("/auth/profile");
        if (cancelled) return;

        if (res.data.forcePasswordChange) {
          setResolved(true);
          return;
        }

        setUser(res.data);
        router.replace(dashboardFor(res.data.role));
      } catch {
        if (cancelled) return;
        logout();
        setResolved(true);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [exempt, isAuthenticated, user, router, setUser, logout]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-primary to-primary-dark">
        <Loader2 className="h-12 w-12 animate-spin text-white/80" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  return <>{children}</>;
}
