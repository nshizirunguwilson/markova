"use client";

import { useSyncExternalStore } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

import {
  SERVER_ALERT_STANDING,
  alertStanding,
  notifyStandingChanged,
  setBrowserAlertsWanted,
  subscribeToAlertStanding,
} from "@/hooks/use-message-alerts";

/**
 * Turning on notifications from the browser itself.
 *
 * Off until asked for, deliberately. A permission prompt that appears the
 * moment somebody opens the chat is the prompt everybody denies, and a denied
 * permission cannot be asked for again — so this is a button they press when
 * they have decided they want it.
 *
 * It sits in the chat rather than in Settings because that is where somebody
 * has the thought. What it controls is what happens when they are *not* here.
 */
export function NotifyToggle() {
  /*
    What the browser will actually do, read through `useSyncExternalStore`.

    `Notification` and `localStorage` do not exist on the server, so the
    answer has to be "cannot" there and the real one on the client. This is
    the hook that says exactly that: no effect, no second render to correct
    itself, and no first paint that disagrees with the markup it hydrated.
  */
  const { on, possible, refused } = useSyncExternalStore(
    subscribeToAlertStanding,
    alertStanding,
    () => SERVER_ALERT_STANDING,
  );

  if (!possible) return null;

  const toggle = async () => {
    if (on) {
      setBrowserAlertsWanted(false);
      toast.success("Notifications turned off");
      return;
    }

    // Asked for only now, when somebody has pressed the button that says
    // what it is for.
    let allowed = Notification.permission === "granted";
    if (!allowed && Notification.permission !== "denied") {
      try {
        allowed = (await Notification.requestPermission()) === "granted";
      } catch {
        allowed = false;
      }
    }

    if (!allowed) {
      // Asking may have turned "default" into "denied", which changes what
      // this button should say.
      notifyStandingChanged();
      toast.error(
        "Your browser is blocking notifications for this site. Allow them in its settings to turn this on.",
      );
      return;
    }

    setBrowserAlertsWanted(true);
    toast.success("You will be told about new messages in other tabs");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={
        on ? "Turn off new message notifications" : "Notify me about new messages"
      }
      title={
        refused
          ? "Your browser is blocking notifications for this site"
          : on
            ? "Turn off new message notifications"
            : "Notify me about new messages"
      }
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
        on
          ? "text-primary hover:bg-accent-light"
          : "text-muted hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      {on ? <Bell className="h-[17px] w-[17px]" /> : <BellOff className="h-[17px] w-[17px]" />}
    </button>
  );
}
