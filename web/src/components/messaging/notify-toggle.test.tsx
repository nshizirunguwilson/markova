import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { NotifyToggle } from "./notify-toggle";
import {
  BROWSER_ALERTS_KEY,
  notifyStandingChanged,
} from "@/hooks/use-message-alerts";

/**
 * A stand-in for the browser's Notification.
 *
 * `requestPermission` moves `permission` to whatever the person chose, the
 * way a real browser does. Without that the component would be tested against
 * a browser that grants permission and then goes on reporting it was never
 * granted, which is not a state that exists.
 */
function stubNotification(permission: NotificationPermission, ask = permission) {
  const api = Object.assign(vi.fn(), {
    permission,
    requestPermission: vi.fn(async () => {
      api.permission = ask;
      return ask;
    }),
  });
  vi.stubGlobal("Notification", api);
  return api.requestPermission;
}

beforeEach(() => {
  localStorage.clear();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  // The standing is a store shared by every toggle on the page, so it has to
  // be dropped between tests along with the browser it was read from.
  notifyStandingChanged();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * A permission prompt that appears the moment somebody opens the chat is the
 * prompt everybody denies, and a denied permission cannot be asked for again.
 */
describe("turning on notifications", () => {
  it("does not ask until the button is pressed", () => {
    const request = stubNotification("default");
    render(<NotifyToggle />);
    expect(request).not.toHaveBeenCalled();
  });

  it("asks when it is pressed", async () => {
    const request = stubNotification("default", "granted");
    render(<NotifyToggle />);
    await userEvent.setup().click(screen.getByRole("button"));
    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it("remembers that it was turned on", async () => {
    stubNotification("default", "granted");
    render(<NotifyToggle />);
    await userEvent.setup().click(screen.getByRole("button"));
    await waitFor(() =>
      expect(localStorage.getItem(BROWSER_ALERTS_KEY)).toBe("on"),
    );
  });

  it("shows itself as on afterwards", async () => {
    stubNotification("default", "granted");
    render(<NotifyToggle />);
    await userEvent.setup().click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("comes back on for somebody who already allowed it", async () => {
    stubNotification("granted");
    localStorage.setItem(BROWSER_ALERTS_KEY, "on");
    render(<NotifyToggle />);
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"),
    );
  });

  // Allowed at the browser but never turned on here is off: the permission is
  // not the preference.
  it("stays off when it was allowed but never asked for", async () => {
    stubNotification("granted");
    render(<NotifyToggle />);
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false"),
    );
  });

  it("turns off again, and remembers that too", async () => {
    stubNotification("granted");
    localStorage.setItem(BROWSER_ALERTS_KEY, "on");
    render(<NotifyToggle />);
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"),
    );

    await userEvent.setup().click(screen.getByRole("button"));

    await waitFor(() =>
      expect(localStorage.getItem(BROWSER_ALERTS_KEY)).toBe("off"),
    );
  });

  // A blocked permission cannot be asked for again, so the person has to be
  // told where to change it rather than watching a button do nothing.
  it("says where to change it when the browser is blocking them", async () => {
    stubNotification("denied");
    render(<NotifyToggle />);
    await userEvent.setup().click(screen.getByRole("button"));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(localStorage.getItem(BROWSER_ALERTS_KEY)).not.toBe("on");
  });

  // An old browser, or a page not served over HTTPS.
  it("shows nothing at all where notifications do not exist", () => {
    vi.stubGlobal("Notification", undefined);
    const { container } = render(<NotifyToggle />);
    expect(container).toBeEmptyDOMElement();
  });
});
