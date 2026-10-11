"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getNavigation,
  isFormerStudent,
  type NavSection,
} from "@/lib/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useUnreadMessageCount } from "@/hooks/use-messaging";
import { badgeCount, badgeLabel } from "@/lib/badge-count";
import { useBrandStore } from "@/stores/brand-store";
import { BrandMark } from "@/components/brand-mark";
import type { Role } from "@/types";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

/**
 * The navigation, as a card that floats on the page rather than a column
 * bolted to its edge.
 *
 * Two things drove the change. At a reduced width the old sidebar kept its
 * full 15rem and simply ate the content beside it, so the messages list had
 * about 90px to live in - the pane was there, and unusable. And a panel that
 * runs edge to edge has to be a rectangle, which fixed the whole shell to one
 * shape.
 *
 * Floating solves both. Below `lg` it lifts off and becomes an overlay the
 * hamburger opens, so the content underneath keeps its whole width; at `lg`
 * and up it sits inset with the page showing around it.
 *
 * `lg` rather than `md`, and that is the fix rather than a preference: at
 * 768px a permanent 15rem panel left the messages screen 496px to hold a
 * 19rem conversation list and a thread beside it, so the pane was there and
 * unusable. The panel earns its place in the layout only once the page can
 * still do its job beside it. The shape is the same
 * in both, so the drawer is recognisably the same object arriving, not a
 * different component for small screens.
 *
 * The corner is a squircle rather than an arc. At 44px the difference is
 * visible: an arc meets the straight edge at a sudden change of curvature and
 * reads as a stuck-on radius, while a squircle eases into it. That is the
 * whole reason the shape is worth the property - at 8px nobody could tell.
 */
export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  const user = useAuthStore((s) => s.user);
  const schoolName = useBrandStore((s) => s.schoolName);
  const former = isFormerStudent(user);
  const sections = getNavigation((user?.role || "ADMIN") as Role, former);
  // The same count the chat itself keeps; the socket invalidates it as
  // messages arrive, so the badge follows without polling.
  // A student who has left has no part in the school's chat any more.
  const { data: unreadMessages } = useUnreadMessageCount(!former);
  const unread = unreadMessages?.unreadCount ?? 0;
  /* A mention is somebody waiting on an answer, which is not the same as one
     more message in a group of thirty. The badge changes colour rather than
     growing a second number: the row has space for one. */
  const mentions = unreadMessages?.mentionCount ?? 0;

  return (
    <aside
      id="app-sidebar"
      /*
        Hidden from assistive technology and taken out of the tab order while
        it is off-screen. It was only translated away before, so on a phone
        every link in a closed drawer was still reachable by Tab and still
        read out - forty invisible items between the hamburger and the page.
        `inert` is the one attribute that does both, and it is lifted at `lg`
        where the panel is always on screen.
      */
      inert={!isOpen && !isDesktop}
      className={cn(
        "fixed z-40 flex w-60 flex-col overflow-hidden bg-surface",
        "rounded-panel squircle shadow-card",
        /* Inset on every side, so the page shows around it and the corners
           are corners rather than a curve cut off by the viewport. */
        "left-3 top-3 bottom-3 lg:left-4 lg:top-4 lg:bottom-4",
        "transition-transform duration-settle ease-enter",
        "lg:translate-x-0",
        /* Far enough for the shadow to clear the edge too: at exactly -100%
           the elevation still bleeds back onto the page as a grey smear. */
        isOpen ? "translate-x-0" : "-translate-x-[calc(100%+1.25rem)]"
      )}
    >
      {/*
        Logo - the school's own uploaded logo when set, otherwise Markova's
        mark. The divider is inset rather than full-bleed: a rule that runs
        into a 44px corner meets the curve at a tangent and reads as a line
        somebody forgot to finish. Inside the curve it reads as a divider.
      */}
      <div className="relative mx-4 flex h-16 shrink-0 items-center justify-center border-b border-border px-1 pt-1">
        {/* The uploaded logo carries the school name itself, so it stands
            alone; BrandMark keeps the name as the image's alt text. */}
        <BrandMark className="h-9 w-auto max-w-full shrink-0" />
        {/*
          A way out that is visible, only where the panel is covering the
          page. Tapping the scrim and pressing Escape both close it, but
          neither is on the screen: a panel that covers what you were reading
          should show you how to put it back, not assume you know.
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the menu"
          className="absolute right-0 rounded-lg p-2 text-muted transition-colors hover:bg-accent-light hover:text-foreground lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      {/* The only part that scrolls, so the logo and the footer stay put and
          the curve always has the panel's own colour behind it. */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4"
      >
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

      {/* Footer. Inset for the same reason as the header's rule, and with the
          extra bottom padding the bottom corners need to stay clear. */}
      <div className="mx-4 shrink-0 border-t border-border px-1 pb-3 pt-3">
        <p className="text-center text-[10px] text-muted">
          Markova v1.0
        </p>
      </div>
    </aside>
  );
}
