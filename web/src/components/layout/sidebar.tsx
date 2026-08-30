"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getNavigation, type NavSection } from "@/lib/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useUnreadMessageCount } from "@/hooks/use-messaging";
import { badgeCount, badgeLabel } from "@/lib/badge-count";
import { useBrandStore } from "@/stores/brand-store";
import { BrandMark } from "@/components/brand-mark";
import type { Role } from "@/types";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const schoolName = useBrandStore((s) => s.schoolName);
  const sections = getNavigation((user?.role || "ADMIN") as Role);
  // The same count the chat itself keeps; the socket invalidates it as
  // messages arrive, so the badge follows without polling.
  const { data: unreadMessages } = useUnreadMessageCount();
  const unread = unreadMessages?.unreadCount ?? 0;
  /* A mention is somebody waiting on an answer, which is not the same as one
     more message in a group of thirty. The badge changes colour rather than
     growing a second number: the row has space for one. */
  const mentions = unreadMessages?.mentionCount ?? 0;

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-surface transition-transform duration-200 ease-in-out",
        "md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Logo - the school's own uploaded logo when set, otherwise Markova's mark */}
      <div className="flex h-16 items-center justify-center border-b border-border px-5">
        {/* The uploaded logo carries the school name itself, so it stands
            alone; BrandMark keeps the name as the image's alt text. */}
        <BrandMark className="h-9 w-auto max-w-full shrink-0" />
      </div>

      {/* Navigation */}
      <nav role="navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, si) => (
          <div key={si} className={cn(si > 0 && "mt-5")}>
            {section.title && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== `/${user?.role?.toLowerCase()}` &&
                    pathname.startsWith(item.href));

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-accent text-primary"
                          : "text-muted hover:bg-accent-light hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {/*
                        How many are waiting, beside the word Messages. The
                        quietest of the three ways of being told: no notice,
                        no sound, just a number that is there when you next
                        look at the sidebar.
                      */}
                      {item.href.endsWith("/messages") && unread > 0 && (
                        <span
                          aria-label={
                            mentions > 0
                              ? `${badgeLabel(unread, "unread message")}, ${badgeLabel(mentions, "mentioning you")}`
                              : badgeLabel(unread, "unread message")
                          }
                          className={`ml-auto min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] font-semibold leading-none tabular-nums ${
                            mentions > 0
                              ? "bg-danger text-on-danger"
                              : "bg-primary text-on-primary"
                          }`}
                        >
                          {badgeCount(unread)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <p className="text-center text-[10px] text-muted">
          Markova v1.0
        </p>
      </div>
    </aside>
  );
}
