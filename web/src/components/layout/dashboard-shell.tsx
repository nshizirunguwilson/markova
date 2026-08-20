"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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

export function DashboardShell({
  children,
  allowedRoles,
}: DashboardShellProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Role check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    router.push(`/${user.role.toLowerCase()}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:text-primary focus:shadow-lg focus:rounded-lg">
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
