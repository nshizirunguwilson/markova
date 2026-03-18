"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
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
    <div className="min-h-screen bg-accent-light/30">
      <Sidebar />
      <Topbar />
      <main className="ml-60 mt-16 p-6">{children}</main>
    </div>
  );
}
