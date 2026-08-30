"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  LogOut,
  User,
  ChevronDown,
  ChevronRight,
  Search,
  CheckCheck,
  X,
  Menu,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuthStore } from "@/stores/auth-store";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { getNavigation, type NavItem } from "@/lib/navigation";
import {
  useUnreadCount,
  useNotifications,
  useMarkAllRead,
  useMarkRead,
  type Notification,
} from "@/hooks/use-notifications";
import { notificationHref } from "@/lib/notification-target";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { labelForRole } from "@/types";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface TopbarProps {
  onToggleSidebar?: () => void;
}

/** Nothing to subscribe to: whether this is a Mac does not change. */
const subscribeToNothing = () => () => {};

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  // --- User menu ---
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // --- Notification bell ---
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { data: unreadData } = useUnreadCount();
  const { data: notifications } = useNotifications();
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const unreadCount = unreadData?.count ?? 0;

  // --- Logout confirmation ---
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // --- Search ---
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // getNavigation is pure and returns a static table; the React Compiler
  // memoizes this for us, and a hand-written useMemo here only gave the
  // compiler a dependency list it could not verify.
  const allNavItems: NavItem[] = user?.role
    ? getNavigation(user.role).flatMap((s) => s.items)
    : [];

  const searchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return [];
    const q = debouncedSearchQuery.toLowerCase();
    return allNavItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [debouncedSearchQuery, allNavItems]);

  // Click-outside handler for all three dropdowns
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /**
   * Escape closes what is open; Cmd+K (Ctrl+K off a Mac) puts the cursor in
   * the search box from anywhere in the app.
   *
   * The shortcut every tool with a search box uses, so it is the one people
   * try. It selects what is already typed rather than clearing it, so pressing
   * it twice does not lose a half-finished search - and typing simply replaces
   * the selection, which is what people expect.
   *
   * The browser's own Ctrl+K focuses the address bar, so this has to say it
   * handled the key.
   */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        return;
      }

      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const box = searchInputRef.current;
        if (!box) return;
        box.focus();
        box.select();
        if (box.value.trim()) setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  /*
    Mac writes it ⌘K and everybody else Ctrl K.

    Through `useSyncExternalStore` rather than an effect that sets state: the
    server has no navigator, so the answer has to be "no" there and the real
    one on the client, and this is the hook that says exactly that without a
    second render to correct itself. Nothing ever changes, so there is nothing
    to subscribe to.
  */
  const onAMac = useSyncExternalStore(
    subscribeToNothing,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    router.push("/login");
  };

  const handleSearchSelect = (href: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    router.push(href);
  };

  /**
   * Open a notification.
   *
   * This used to branch on `notif.type`, which is the channel the notice went
   * out on - SMS, EMAIL or PUSH. Every branch tested it for words like
   * "ATTENDANCE", so none could ever match and clicking a notification did
   * nothing but mark it read. What a notice is about lives on
   * `relatedEntityType`; `notificationHref` turns that plus the reader's role
   * into a page, and answers null when there is nothing to open.
   */
  const handleNotificationClick = (notif: Notification) => {
    if (!notif.isRead) markRead.mutate(notif.id);
    setNotifOpen(false);

    const href = notificationHref(notif, user?.role);
    if (href) router.push(href);
  };

  const roleBadgeVariant: Record<string, "info" | "success" | "default" | "warning"> = {
    ADMIN: "info",
    TEACHER: "success",
    STUDENT: "default",
    PARENT: "warning",
    LIBRARIAN: "info",
    // The boarding staff: welfare rather than academic, so they read as their
    // own group rather than borrowing a teacher's colour.
    PATRON: "warning",
    MATRON: "warning",
    NURSE: "success",
  };

  return (
    <header className="fixed left-0 md:left-60 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:px-6">
      {/* Mobile hamburger */}
      <button
        onClick={onToggleSidebar}
        className="mr-3 rounded-lg p-2 text-muted hover:bg-accent-light hover:text-foreground transition-colors md:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search */}
      <div className="relative w-80" ref={searchRef}>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search pages..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => {
            if (searchQuery.trim()) setSearchOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchResults.length > 0) {
              handleSearchSelect(searchResults[0].href);
            }
            if (e.key === "Escape") {
              setSearchOpen(false);
            }
          }}
          className="w-full rounded-lg border border-border bg-accent-light/50 py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
         aria-label="Search pages..."/>
        {/* A shortcut nobody can see is a shortcut nobody uses. */}
        {!searchQuery && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 select-none rounded border border-border bg-surface px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium text-muted md:block"
          >
            {onAMac ? "\u2318K" : "Ctrl K"}
          </kbd>
        )}
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              setSearchOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {searchOpen && searchQuery.trim() && (
          <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-lg border border-border bg-surface py-1 shadow-popover">
            {searchResults.length > 0 ? (
              searchResults.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => handleSearchSelect(item.href)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent-light"
                  >
                    <Icon className="h-4 w-4 text-muted" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-xs text-muted">
                      {item.href}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-3 text-center text-sm text-muted">
                No pages found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label="Notifications"
            className="relative rounded-lg p-2 text-muted hover:bg-accent-light hover:text-foreground transition-colors"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-border bg-surface shadow-popover">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications && notifications.length > 0 ? (
                  notifications.map((notif) => {
                    // Whether this one goes anywhere at all. A notice about
                    // nothing in particular ("System Ready") stays a notice,
                    // and saying so beats a row that looks clickable and
                    // silently is not.
                    const href = notificationHref(notif, user?.role);
                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        aria-label={
                          href ? `${notif.title} - open` : notif.title ?? ""
                        }
                        className={cn(
                          "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left last:border-0",
                          href ? "cursor-pointer hover:bg-accent-light" : "cursor-default",
                          !notif.isRead && "bg-primary/5"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm",
                              notif.isRead
                                ? "text-foreground"
                                : "font-medium text-foreground"
                            )}
                          >
                            {notif.title}
                          </p>
                          {!notif.isRead && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="line-clamp-2 text-xs text-muted">
                          {notif.message}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                          <span>{timeAgo(notif.createdAt)}</span>
                          {href && (
                            <span className="flex items-center gap-0.5 text-primary">
                              Open <ChevronRight className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted">
                    No notifications
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent-light transition-colors"
          >
            <Avatar
              src={user?.photoUrl}
              fallback={
                user ? `${user.firstName[0]}${user.lastName[0]}` : undefined
              }
              size="sm"
            />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                {user?.firstName} {user?.lastName}
              </p>
              <Badge variant={roleBadgeVariant[user?.role || "ADMIN"]}>
                {labelForRole(user?.role)}
              </Badge>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted transition-transform",
                dropdownOpen && "rotate-180"
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-surface py-1 shadow-popover">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  /*
                    One profile route for everybody.

                    This used to build the path from the role, which worked
                    for the five roles that happen to have a page of their
                    own and sent a bursar to /bursar/profile, a nurse to
                    /nurse/profile and the head teacher to
                    /head_teacher/profile - none of which exist, so the
                    shell bounced them back to their dashboard and their own
                    profile was unreachable from the only menu that offers
                    it. /profile is the real page; the per-role routes are
                    re-exports of it.
                  */
                  router.push("/profile");
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent-light"
              >
                <User className="h-4 w-4" />
                My Profile
              </button>
              <hr className="my-1 border-border" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-danger-wash"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} title="Sign Out">
        <p className="text-sm text-muted mb-4">Are you sure you want to sign out?</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowLogoutConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmLogout}>Sign Out</Button>
        </div>
      </Modal>
    </header>
  );
}
