"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, User, ChevronDown, Search } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Topbar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
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
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          placeholder="Search..."
          className="w-full rounded-lg border border-border bg-accent-light/50 py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative rounded-lg p-2 text-muted hover:bg-accent-light hover:text-foreground transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />
        </button>

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
