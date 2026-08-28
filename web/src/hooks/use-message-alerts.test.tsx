import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => {
  const watchers = new Set<(m: unknown) => void>();
  return {
    watchers,
    toast: Object.assign(vi.fn(), {
      success: vi.fn(),
      error: vi.fn(),
    }),
    router: { push: vi.fn() },
    pathname: { current: "/teacher/marks" },
    chat: {
      onNewMessage: (handler: (m: unknown) => void) => {
        watchers.add(handler);
        return () => watchers.delete(handler);
      },
    },
  };
});

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => h.pathname.current,
}));
vi.mock("@/stores/chat-store", () => ({
  useChatStore: (selector?: (s: unknown) => unknown) =>
    selector ? selector(h.chat) : h.chat,
}));

import {
  BROWSER_ALERTS_KEY,
  useMessageAlerts,
} from "./use-message-alerts";
import { signIn } from "@/test/harness";

/** A message arriving over the socket, from somebody else. */
const arriving = (over = {}) => ({
  id: "m-9",
  conversationId: "conv-1",
  content: "Muraho neza",
  contentType: "TEXT",
  senderUserId: "u-3",
  sender: { firstName: "Aline", lastName: "Uwase" },
  ...over,
});

/** Hand a message to everyone watching, the way the store does. */
function arrive(message: unknown) {
  for (const watcher of h.watchers) watcher(message);
}

beforeEach(() => {
  h.watchers.clear();
  h.toast.mockReset();
  h.router.push.mockReset();
  h.pathname.current = "/teacher/marks";
  localStorage.clear();
  signIn("TEACHER", { id: "u-1" });
  window.history.replaceState({}, "", "/teacher/marks");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("being told about a message from elsewhere in the system", () => {
  it("shows a notice", async () => {
    renderHook(() => useMessageAlerts());
    arrive(arriving());
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(h.toast.mock.calls[0][0]).toBe("Aline Uwase");
    expect(h.toast.mock.calls[0][1].description).toBe("Muraho neza");
  });

  it("takes you to the conversation when the notice is followed", async () => {
    renderHook(() => useMessageAlerts());
    arrive(arriving());
    await waitFor(() => expect(h.toast).toHaveBeenCalled());

    h.toast.mock.calls[0][1].action.onClick();

    expect(h.router.push).toHaveBeenCalledWith("/messages");
  });

  it("says nothing about your own message", async () => {
    renderHook(() => useMessageAlerts());
    arrive(arriving({ senderUserId: "u-1" }));
    expect(h.toast).not.toHaveBeenCalled();
  });

  // A notice for a message visible two inches away is noise.
  it("says nothing while you are looking at that very thread", () => {
    h.pathname.current = "/messages";
    window.history.replaceState({}, "", "/messages?conversation=conv-1");
    renderHook(() => useMessageAlerts());
    arrive(arriving());
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("still says so for another thread while on the chat page", async () => {
    h.pathname.current = "/messages";
    window.history.replaceState({}, "", "/messages?conversation=conv-2");
    renderHook(() => useMessageAlerts());
    arrive(arriving());
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
  });

  // Registered once: re-registering on every navigation would drop a message
  // arriving in the gap.
  it("stops watching when the page it is mounted in goes", () => {
    const { unmount } = renderHook(() => useMessageAlerts());
    expect(h.watchers.size).toBe(1);
    unmount();
    expect(h.watchers.size).toBe(0);
  });
});

/**
 * The browser's own notification, for somebody working in another tab. Only
 * when asked for, and never when this tab is already in front.
 */
describe("a notification from the browser itself", () => {
  function stubNotification(permission: NotificationPermission) {
    const made = vi.fn();
    vi.stubGlobal(
      "Notification",
      Object.assign(made, { permission, requestPermission: vi.fn() }),
    );
    return made;
  }

  function hideTheTab() {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
  }

  it("is raised when it was asked for and the tab is behind", async () => {
    const made = stubNotification("granted");
    localStorage.setItem(BROWSER_ALERTS_KEY, "on");
    hideTheTab();

    renderHook(() => useMessageAlerts());
    arrive(arriving());

    await waitFor(() => expect(made).toHaveBeenCalled());
    // Tagged by conversation, so ten messages from one person replace each
    // other rather than stacking ten notifications up.
    expect(made.mock.calls[0][1].tag).toBe("markova-conv-1");
  });

  it("is not raised when the tab is the one in front", async () => {
    const made = stubNotification("granted");
    localStorage.setItem(BROWSER_ALERTS_KEY, "on");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    renderHook(() => useMessageAlerts());
    arrive(arriving());

    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(made).not.toHaveBeenCalled();
  });

  it("is not raised when it was never asked for", async () => {
    const made = stubNotification("granted");
    hideTheTab();

    renderHook(() => useMessageAlerts());
    arrive(arriving());

    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(made).not.toHaveBeenCalled();
  });

  it("is not raised when the browser is blocking them", async () => {
    const made = stubNotification("denied");
    localStorage.setItem(BROWSER_ALERTS_KEY, "on");
    hideTheTab();

    renderHook(() => useMessageAlerts());
    arrive(arriving());

    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(made).not.toHaveBeenCalled();
  });

  /*
    Private browsing, or storage turned off altogether. Reading the preference
    must not throw inside the message handler and take the message with it.
  */
  it("treats unreadable storage as not asked for", async () => {
    const made = stubNotification("granted");
    hideTheTab();
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("no storage here");
      });

    renderHook(() => useMessageAlerts());
    expect(() => arrive(arriving())).not.toThrow();

    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(made).not.toHaveBeenCalled();
    getItem.mockRestore();
  });

  // The corner notice has already done the job; a browser that refuses to
  // raise one must not take the rest with it.
  it("survives a browser that refuses to raise one", async () => {
    localStorage.setItem(BROWSER_ALERTS_KEY, "on");
    hideTheTab();
    vi.stubGlobal(
      "Notification",
      Object.assign(
        vi.fn(() => {
          throw new Error("no");
        }),
        { permission: "granted", requestPermission: vi.fn() },
      ),
    );

    renderHook(() => useMessageAlerts());
    expect(() => arrive(arriving())).not.toThrow();
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
  });
});
