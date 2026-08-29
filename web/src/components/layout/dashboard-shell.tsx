"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSelectedLayoutSegments } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useSocketConnection } from "@/hooks/use-socket";
import { useMessageAlerts } from "@/hooks/use-message-alerts";
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
const ROLES_BY_PREFIX: Record<string, string[]> = {
  admin: ["ADMIN"],
  teacher: ["TEACHER"],
  student: ["STUDENT"],
  parent: ["PARENT"],
  librarian: ["LIBRARIAN"],
  // The boarding staff share one home: a patron and a matron do the same job
  // on opposite sides of the school, and two identical routes would be two
  // copies of one page.
  boarding: ["PATRON", "MATRON"],
  nurse: ["NURSE"],
};

/** Where a role lands when it has no business on the page it asked for. */
export function homeFor(role: string): string {
  if (role === "PATRON" || role === "MATRON") return "/boarding";
  if (role === "NURSE") return "/nurse";
  // The bursar's home is the register itself. There is no separate dashboard
  // worth building: the one screen they open every morning is the roll of who
  // has paid, and a summary page in front of it would be a click to nowhere.
  if (role === "BURSAR") return "/admin/finance";
  return `/${role.toLowerCase()}`;
}

/**
 * Pages under /admin that the boarding staff also need.
 *
 * A patron, matron, nurse or bursar is not an administrator, and must not
 * reach the rest of /admin. But pocket money, the clinic and the fee register
 * are their jobs, and putting them under a second prefix would mean two
 * copies of the same page.
 */
const SHARED_ADMIN_PAGES: Record<string, string[]> = {
  "pocket-money": ["PATRON", "MATRON"],
  health: ["PATRON", "MATRON", "NURSE"],
  activities: ["PATRON", "MATRON"],
  // The fee pages are the bursar's whole job, and the head reads them too.
  // One copy under /admin rather than a second prefix holding the same code.
  finance: ["BURSAR"],
};

/** Which roles may see this path, or undefined when it is open to all. */
function rolesForPath(pathname: string): string[] | undefined {
  const [, prefix, page] = pathname.split("/");
  const base = ROLES_BY_PREFIX[prefix ?? ""];
  if (!base) return undefined;
  const shared = prefix === "admin" ? SHARED_ADMIN_PAGES[page ?? ""] : undefined;
  return shared ? [...base, ...shared] : base;
}

export function DashboardShell({
  children,
  allowedRoles,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  /*
    Which page is on screen, as opposed to what the address bar says. A screen
    that rewrites its own URL without navigating keeps the same route, and so
    keeps the same key.
  */
  const routeKey = useSelectedLayoutSegments().join("/");
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Which roles this route belongs to, derived from its path.
  const routeRoles = rolesForPath(pathname);
  const roleMismatch =
    !!user &&
    ((!!routeRoles && !routeRoles.includes(user.role)) ||
      (!!allowedRoles && !allowedRoles.includes(user.role)));

  // A signed-in user landing on another role's page is sent to their own
  // dashboard. This is the real guard — the API still enforces data access,
  // but a student should never even reach /admin/* by typing the URL.
  useEffect(() => {
    if (roleMismatch && user) {
      router.replace(homeFor(user.role));
    }
  }, [roleMismatch, user, router]);

  // Initialize WebSocket connection for real-time chat
  useSocketConnection();

  // A message that arrives while somebody is entering marks is otherwise
  // invisible — the thread updates on a page nobody is looking at.
  useMessageAlerts();

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
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:text-primary focus:shadow-popover focus:rounded-lg">
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
      {/*
        Keyed on the route so each page fades in as it arrives.

        Opacity only, and only 150ms: the content is in the document from the
        first frame, so nothing is delayed and nothing moves — a reader's eye
        does not have to track anything. That is the difference between this
        and a sliding route transition, which does make an app people use all
        day feel slower.

        It also softens the moment a page swaps its spinner for data, which is
        the most-seen transition in the whole app and was a hard cut.

        The route, not the pathname. Rebuilding on every URL change meant a
        page that changes its own address — the chat, which puts the open
        thread in the URL — was destroyed and faded back in every time you
        clicked a conversation, taking its scroll position and anything you
        had half written with it. That flash was the whole page being thrown
        away, not a transition.
      */}
      <main
        key={routeKey}
        id="main-content"
        className="motion-fade-in ml-0 md:ml-60 mt-16 p-6"
      >
        {children}
      </main>
    </div>
  );
}
