"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/stores/auth-store";
import { useMySchools } from "@/hooks/use-schools";
import { switchSchool, type Membership } from "@/lib/schools";
import { homeFor } from "@/lib/navigation";
import { errorMessage } from "@/lib/errors";
import { badgeCount, badgeLabel } from "@/lib/badge-count";
import { labelForRole } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Open a school, the whole way.
 *
 * A full page load into the new school's home rather than a client-side
 * route change. Everything on screen belongs to the school being left: the
 * cached queries, the chat connection, the colours. Starting the page again
 * is the one way to be sure none of it follows the person into the other
 * school.
 */
export async function openSchool(m: Membership) {
  try {
    const user = await switchSchool(m.userId);
    window.location.assign(homeFor(user.role));
  } catch (err) {
    toast.error(errorMessage(err, "Could not open that school"));
  }
}

/**
 * The person's schools, as a list to choose from. Shared by the switcher in
 * the top bar and the menu that holds it on a phone.
 */
export function SchoolList({
  schools,
  currentUserId,
  onChoose,
}: {
  schools: Membership[];
  currentUserId?: string;
  onChoose: (m: Membership) => void;
}) {
  return (
    <ul role="list" className="py-1">
      {schools.map((m) => {
        const current = m.userId === currentUserId;
        const unread = m.unreadMessages ?? 0;
        return (
          <li key={m.userId}>
            <button
              type="button"
              onClick={() => !current && onChoose(m)}
              aria-current={current ? "true" : undefined}
              aria-label={`${m.school.name}, ${labelForRole(m.role)}${
                unread > 0 ? `, ${badgeLabel(unread, "unread message")}` : ""
              }${current ? ", open now" : ""}`}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm",
                current ? "cursor-default" : "hover:bg-accent-light",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">
                  {m.school.name}
                </span>
                <span className="block text-xs text-muted">
                  {labelForRole(m.role)}
                </span>
              </span>
              {unread > 0 && (
                <span
                  aria-hidden="true"
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-on-danger"
                >
                  {badgeCount(unread)}
                </span>
              )}
              {current && (
                <Check aria-hidden="true" className="h-4 w-4 text-primary" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The school open now, next to the person's name, and the way to another.
 *
 * Somebody who belongs to one school sees its name and nothing to press.
 * Somebody who belongs to several gets the list, each with its own count
 * of unread messages, so they know where to look. Switching does not ask
 * for the password again.
 */
export function SchoolSwitcher({ className }: { className?: string }) {
  const user = useAuthStore((s) => s.user);
  const { data: schools } = useMySchools(!!user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = user?.school?.name;
  if (!name) return null;

  const several = (schools?.length ?? 0) > 1;
  const waitingElsewhere = (schools ?? [])
    .filter((m) => m.userId !== user?.id)
    .reduce((sum, m) => sum + (m.unreadMessages ?? 0), 0);

  if (!several) {
    return (
      <div
        className={cn(
          "flex max-w-48 items-center gap-2 text-sm text-muted",
          className,
        )}
      >
        <Building2 aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="truncate">{name}</span>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`School: ${name}. Switch school${
          waitingElsewhere > 0
            ? `, ${badgeLabel(waitingElsewhere, "unread message")} elsewhere`
            : ""
        }`}
        className="flex max-w-56 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent-light"
      >
        <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
        <span className="truncate font-medium">{name}</span>
        {waitingElsewhere > 0 && (
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-danger"
          />
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-border bg-surface shadow-popover">
          <p className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted">
            Your schools
          </p>
          <SchoolList
            schools={schools ?? []}
            currentUserId={user?.id}
            onChoose={(m) => {
              setOpen(false);
              void openSchool(m);
            }}
          />
        </div>
      )}
    </div>
  );
}
