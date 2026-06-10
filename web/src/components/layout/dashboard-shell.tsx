"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useSocketConnection } from "@/hooks/use-socket";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { PageSpinner } from "@/components/ui/spinner";
import api from "@/lib/api";

interface DashboardShellProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

// Dashboard routes are grouped by role under their own path prefix. Anything
// not listed (e.g. the shared /messages and /help) is open to every role.
const ROLE_BY_PREFIX: Record<string, string> = {
  admin: "ADMIN",
  teacher: "TEACHER",
  student: "STUDENT",
  parent: "PARENT",
  librarian: "LIBRARIAN",
};

export function DashboardShell({
  children,
  allowedRoles,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // The role a route belongs to, derived from its first path segment.
  const requiredRole = ROLE_BY_PREFIX[pathname.split("/")[1] || ""];
  const roleMismatch =
    !!user &&
    ((!!requiredRole && user.role !== requiredRole) ||
      (!!allowedRoles && !allowedRoles.includes(user.role)));

  // A signed-in user landing on another role's page is sent to their own
  // dashboard. This is the real guard — the API still enforces data access,
  // but a student should never even reach /admin/* by typing the URL.
  useEffect(() => {
    if (roleMismatch && user) {
      router.replace(`/${user.role.toLowerCase()}`);
    }
  }, [roleMismatch, user, router]);

  // Initialize WebSocket connection for real-time chat
  useSocketConnection();

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    async function checkAuth() {
      const token = localStorage.getItem("access_token");
      if (!token) {
        logout();
        router.push("/login");
        return;
      }

      if (!isAuthenticated) {
        try {
          const res = await api.get("/auth/profile");
          setUser(res.data);
        } catch {
          logout();
          router.push("/login");
        }
      } else {
        setLoading(false);
      }
    }

    checkAuth();
  }, [isAuthenticated, router, setUser, setLoading, logout]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated || !user) {
    return null;
  }

  // Wrong role for this route — render nothing while the effect above redirects.
  if (roleMismatch) {
    return null;
  }

  return (
    <div className="min-h-screen bg-accent-light/30">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-primary focus:shadow-lg focus:rounded-lg">
        Skip to content
      </a>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={closeSidebar}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      <Topbar onToggleSidebar={toggleSidebar} />
      <main id="main-content" className="ml-0 md:ml-60 mt-16 p-6">{children}</main>
    </div>
  );
}
