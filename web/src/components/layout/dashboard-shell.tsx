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
import { homeFor } from "@/lib/navigation";

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
  /* The Director of Studies' own dashboard. The admin reads it too: a
     principal covering an absent head teacher needs the same view, and a
     page one account in the school can open is one that goes unread the week
     they are away. */
  "head-teacher": ["HEAD_TEACHER", "ADMIN"],
};

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
  /*
    The academic side, which is the head teacher's post.

    One screen for the report cards, shared with the class teachers who write
    on it: everybody involved in a card works from the same page and sees the
    same state, rather than each role holding a private copy that can disagree
    with the others about whether a class is ready.
  */
  timetable: ["HEAD_TEACHER"],
  teachers: ["HEAD_TEACHER"],
  classes: ["HEAD_TEACHER"],
};

/**
 * Pages that moved off the principal's desk entirely.
 *
 * Report cards, marks and attendance belong to the Director of Studies. They
 * still live under `/admin` because a second prefix would be a second copy of
 * the same screens, but the principal no longer reaches them - the API
 * refuses them, and a page that loads and then 403s on every request is worse
 * than a redirect.
 */
const MOVED_TO_HEAD_TEACHER: Record<string, string[]> = {
  marks: ["HEAD_TEACHER"],
  attendance: ["HEAD_TEACHER"],
  /*
    Both, because this one page holds two people's work: the report cards are
    the DOS's and the transfer letters, transcripts and testimonials are the
    principal's. Handing the whole page to the DOS made the letters
    unreachable by anybody - the principal was bounced from the page and the
    DOS was refused by the API, so "Generate" answered "Forbidden resource"
    whoever asked. The page itself shows each of them only their own tab.
  */
  reports: ["HEAD_TEACHER", "ADMIN"],
  /* The class teachers write on this one, so they reach it too - but the
     principal does not. It belongs here rather than in the shared map above,
     because that map adds roles to the prefix's own and this one replaces
     them: listed there, the principal kept it. */
  "report-cards": ["HEAD_TEACHER", "TEACHER"],
};

/** Which roles may see this path, or undefined when it is open to all. */
function rolesForPath(pathname: string): string[] | undefined {
  const [, prefix, page] = pathname.split("/");
  const base = ROLES_BY_PREFIX[prefix ?? ""];
  if (!base) return undefined;

  /* A page that moved replaces the prefix's own roles rather than adding to
     them: the point is that the principal no longer reaches it. */
  const moved =
    prefix === "admin" ? MOVED_TO_HEAD_TEACHER[page ?? ""] : undefined;
  if (moved) return moved;

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
  // dashboard. This is the real guard - the API still enforces data access,
  // but a student should never even reach /admin/* by typing the URL.
  useEffect(() => {
    if (roleMismatch && user) {
      router.replace(homeFor(user.role));
    }
  }, [roleMismatch, user, router]);

  // Initialize WebSocket connection for real-time chat
  useSocketConnection();

  // A message that arrives while somebody is entering marks is otherwise
  // invisible - the thread updates on a page nobody is looking at.
  useMessageAlerts();

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  /*
    What an overlay owes the reader, and none of it was here before.

    Escape closes it, because a thing that covers the page has to be
    dismissible from the keyboard; and the page behind it stops scrolling,
    because a drawer that scrolls the page under itself loses the reader's
    place while they are only looking at the menu.

    Both only below `lg`. Above it the panel is part of the layout: Escape
    means nothing there, and locking the page would be locking it for good.
  */
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);

    const overlay = window.matchMedia("(max-width: 1023px)").matches;
    const previous = document.body.style.overflow;
    if (overlay) document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      if (overlay) document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

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

  // Wrong role for this route - render nothing while the effect above redirects.
  if (roleMismatch) {
    return null;
  }

  return (
    <div
      /* The ground the panel and the cards float on. `background` is the
         token for exactly this, and with a panel that now floats the
         separation has to come from the palette rather than from a border. */
      className="min-h-screen bg-background"
    >
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:text-primary focus:shadow-popover focus:rounded-lg">
        Skip to content
      </a>
      {/*
        The scrim behind the drawer. Only below `lg`, where the panel is an
        overlay: above it the panel is part of the layout and dimming the page
        would be dimming it for no reason.

        aria-hidden because it is not a control - Escape and the close button
        are the ways out that assistive technology is told about.
      */}
      {sidebarOpen && (
        <div
          aria-hidden="true"
          className="motion-fade-in fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={closeSidebar}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      <Topbar onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
      {/*
        Keyed on the route so each page fades in as it arrives.

        Opacity only, and only 150ms: the content is in the document from the
        first frame, so nothing is delayed and nothing moves - a reader's eye
        does not have to track anything. That is the difference between this
        and a sliding route transition, which does make an app people use all
        day feel slower.

        It also softens the moment a page swaps its spinner for data, which is
        the most-seen transition in the whole app and was a hard cut.

        The route, not the pathname. Rebuilding on every URL change meant a
        page that changes its own address - the chat, which puts the open
        thread in the URL - was destroyed and faded back in every time you
        clicked a conversation, taking its scroll position and anything you
        had half written with it. That flash was the whole page being thrown
        away, not a transition.
      */}
      <main
        key={routeKey}
        id="main-content"
        className="motion-fade-in ml-0 mt-[5.5rem] p-4 lg:ml-[17rem] lg:mt-24 lg:p-6"
      >
        {children}
      </main>
    </div>
  );
}
