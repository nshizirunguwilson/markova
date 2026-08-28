import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { NotifyToggle } from "./notify-toggle";
import { BROWSER_ALERTS_KEY } from "@/hooks/use-message-alerts";

function stubNotification(permission: NotificationPermission, ask = permission) {
  const request = vi.fn(async () => ask);
  vi.stubGlobal(
    "Notification",
    Object.assign(vi.fn(), { permission, requestPermission: request }),
  );
  return request;
}

beforeEach(() => {
  localStorage.clear();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
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
