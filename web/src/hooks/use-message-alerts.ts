"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuthStore } from "@/stores/auth-store";
import { useChatStore } from "@/stores/chat-store";
import {
  alertBody,
  alertTitle,
  shouldAnnounce,
  type IncomingMessage,
} from "@/lib/message-alerts";

/** Whether the person has asked for notifications from the browser itself. */
export const BROWSER_ALERTS_KEY = "markova.message-notifications";

export function browserAlertsWanted(): boolean {
  try {
    return localStorage.getItem(BROWSER_ALERTS_KEY) === "on";
  } catch {
    // Private browsing, or storage turned off. Not wanted, then.
    return false;
  }
}

export function setBrowserAlertsWanted(on: boolean): void {
  try {
    localStorage.setItem(BROWSER_ALERTS_KEY, on ? "on" : "off");
  } catch {
    /* nothing to be done, and nothing worth failing over */
  }
  notifyStandingChanged();
}

/**
 * Whether the browser will raise notifications, as a store a component can
 * subscribe to.
 *
 * A store rather than state in the toggle itself, for two reasons. It reads
 * `Notification` and `localStorage`, which do not exist on the server, so a
 * component needs a snapshot that is honest in both places without a second
 * render to correct itself. And two toggles on one page must agree: they are
 * looking at the same browser.
 */
export interface AlertStanding {
  /** Turned on here, by this person, in this browser. */
  on: boolean;
  /** The browser can raise notifications at all. */
  possible: boolean;
  /** The browser is blocking them, and cannot be asked again. */
  refused: boolean;
}

/** What the server renders: nothing to offer, because it cannot know. */
export const SERVER_ALERT_STANDING: AlertStanding = {
  on: false,
  possible: false,
  refused: false,
};

const listeners = new Set<() => void>();

/*
  `useSyncExternalStore` compares snapshots by identity and re-renders forever
  if a fresh object comes back each time, so the last one is held and replaced
  only when something has actually changed.
*/
let held: AlertStanding | null = null;

function readStanding(): AlertStanding {
  const canAsk = typeof Notification !== "undefined";
  return {
    possible: canAsk,
    refused: canAsk && Notification.permission === "denied",
    on: canAsk && Notification.permission === "granted" && browserAlertsWanted(),
  };
}

export function alertStanding(): AlertStanding {
  if (!held) held = readStanding();
  return held;
}

export function subscribeToAlertStanding(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Something changed the standing — the preference was written, or permission
 * was asked for. Drops the held snapshot and tells everyone looking.
 */
export function notifyStandingChanged(): void {
  held = null;
  for (const listener of listeners) listener();
}

/**
 * Tells somebody a message has arrived while they are elsewhere in the system.
 *
 * Mounted once, in the dashboard shell, because the socket is opened once for
 * the whole dashboard and the notice has to appear whichever page is open.
 *
 * Two levels: a notice in the corner that takes you to the conversation, and
 * — only if the person turned it on, and only when this tab is not the one
 * they are looking at — a notification from the browser itself. Nothing here
 * interrupts what they are doing.
 */
export function useMessageAlerts() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const onNewMessage = useChatStore((s) => s.onNewMessage);

  /*
    Read through a ref inside the handler rather than closed over, so the
    watcher is registered once. Re-registering on every navigation would drop
    a message arriving in the gap between the old handler leaving and the new
    one arriving.

    Written in an effect rather than during render: a render can be thrown
    away and run again, and a ref written during one keeps whatever the
    discarded attempt put there.
  */
  const where = useRef(pathname);
  const me = useRef(user?.id);
  useEffect(() => {
    where.current = pathname;
    me.current = user?.id;
  }, [pathname, user?.id]);

  useEffect(() => {
    return onNewMessage((raw) => {
      const message = raw as IncomingMessage;

      /*
        The thread open on screen, read from the URL rather than passed in:
        the chat page keeps that in its own state, and reaching into it from
        here would tie this hook to that page. The chat marks a conversation
        read as soon as it is open, so the unread count corrects itself even
        if a notice does slip through.
      */
      const openConversationId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("conversation")
          : null;

      if (
        !shouldAnnounce({
          message,
          myUserId: me.current,
          pathname: where.current,
          openConversationId,
        })
      ) {
        return;
      }

      const title = alertTitle(message);
      const body = alertBody(message);

      toast(title, {
        description: body,
        action: {
          label: "Open",
          onClick: () => router.push("/messages"),
        },
      });

      // The browser's own notification, for somebody working in another tab.
      // Only when asked for, and never when this tab is already in front —
      // the corner notice has that covered.
      if (
        browserAlertsWanted() &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        try {
          // Tagged by conversation, so ten messages from one person replace
          // each other rather than stacking ten notifications up.
          new Notification(title, {
            body,
            tag: `markova-${message.conversationId ?? "chat"}`,
          });
        } catch {
          /* the corner notice has already done the job */
        }
      }
    });
  }, [onNewMessage, router]);
}
