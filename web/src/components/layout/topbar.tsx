"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  LogOut,
  User,
  ChevronDown,
  Search,
  CheckCheck,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { getNavigation, type NavItem } from "@/lib/navigation";
import {
  useUnreadCount,
  useNotifications,
  useMarkAllRead,
  useMarkRead,
} from "@/hooks/use-notifications";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

export function Topbar() {
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

  // --- Search ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const allNavItems = useMemo<NavItem[]>(() => {
    if (!user?.role) return [];
    const sections = getNavigation(user.role);
    return sections.flatMap((s) => s.items);
  }, [user?.role]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allNavItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [searchQuery, allNavItems]);

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

  // Close search on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    logout();
    router.push("/login");
  };

  const handleSearchSelect = (href: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    router.push(href);
  };

  const handleNotificationClick = (id: string) => {
    markRead.mutate(id);
  };

  const roleBadgeVariant = {
    ADMIN: "info" as const,
    TEACHER: "success" as const,
    STUDENT: "default" as const,
    PARENT: "warning" as const,
    LIBRARIAN: "info" as const,
  };

  return (
    <header className="fixed left-60 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white px-6">
      {/* Search */}
      <div className="relative w-80" ref={searchRef}>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
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
        />
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
          <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-lg border border-border bg-white py-1 shadow-lg">
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
            <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-border bg-white shadow-lg">
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
                  notifications.map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif.id)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-accent-light last:border-0",
                        !notif.read && "bg-primary/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm",
                            notif.read
                              ? "text-foreground"
                              : "font-medium text-foreground"
                          )}
                        >
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted">
                        {notif.message}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {timeAgo(notif.createdAt)}
                      </p>
                    </button>
                  ))
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
                {user?.role}
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
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-white py-1 shadow-lg">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  router.push(`/${user?.role?.toLowerCase()}/profile`);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent-light"
              >
                <User className="h-4 w-4" />
                My Profile
              </button>
              <hr className="my-1 border-border" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
