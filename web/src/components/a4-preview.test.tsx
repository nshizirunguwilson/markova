import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { A4Preview } from "./a4-preview";

/**
 * A report card shown at the size it will print.
 *
 * The page is a fixed A4 in millimetres, and the preview scales it down to
 * whatever width the panel happens to be. jsdom reports every element as zero
 * wide and ships no ResizeObserver, which is exactly the state a real browser
 * is in for the first frame: nothing measured yet. The component must not draw
 * a zero-height iframe or a page scaled to nothing while it waits.
 */

/** A stand-in ResizeObserver whose callback a test can fire. */
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  disconnected = false;
  constructor(public cb: () => void) {
    FakeResizeObserver.last = this;
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
}

const HTML = "<html><body><h1>Report</h1></body></html>";

beforeEach(() => {
  FakeResizeObserver.last = null;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

/** Makes every element report a width, the way a real browser would. */
function givenPanelWidth(px: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => px,
  });
}

describe("before anything has been measured", () => {
  it("draws no page rather than one scaled to nothing", () => {
    givenPanelWidth(0);
    render(<A4Preview html={HTML} title="Report card" />);

    expect(screen.queryByTitle("Report card")).toBeNull();
  });

  it("leaves the frame's height to the browser", () => {
    givenPanelWidth(0);
    const { container } = render(<A4Preview html={HTML} title="Report card" />);

    // A height of nought would collapse the panel and shift the page.
    const box = container.querySelector<HTMLElement>("div > div")!;
    expect(box.style.height).toBe("");
  });
});

describe("once the panel has a width", () => {
  it("draws the page", async () => {
    givenPanelWidth(800);
    render(<A4Preview html={HTML} title="Report card" />);

    await waitFor(() =>
      expect(screen.getByTitle("Report card")).toBeInTheDocument(),
    );
  });

  it("shows the markup it was given", async () => {
    givenPanelWidth(800);
    render(<A4Preview html={HTML} title="Report card" />);

    const frame = await screen.findByTitle("Report card");
    expect(frame).toHaveAttribute("srcdoc", HTML);
  });

  it("gives the box a height in proportion to the page", async () => {
    givenPanelWidth(800);
    const { container } = render(<A4Preview html={HTML} title="Report card" />);

    await waitFor(() =>
      expect(screen.getByTitle("Report card")).toBeInTheDocument(),
    );
    // The height is set inline in pixels; jsdom keeps it on the attribute.
    const box = container.querySelector<HTMLElement>("[style*='height']")!;
    const height = parseFloat(box.getAttribute("style")!.match(/height:\s*([\d.]+)/)![1]);
    // A4 is taller than it is wide, so a 800px panel is more than 800 tall.
    expect(height).toBeGreaterThan(800);
  });

  it("re-measures when the panel is resized", async () => {
    givenPanelWidth(800);
    const { container } = render(<A4Preview html={HTML} title="Report card" />);
    await waitFor(() =>
      expect(screen.getByTitle("Report card")).toBeInTheDocument(),
    );
    const heightOf = () =>
      container.querySelector<HTMLElement>("[style*='height']")!.getAttribute("style");
    const before = heightOf();

    givenPanelWidth(400);
    await act(async () => {
      FakeResizeObserver.last!.cb();
    });

    expect(heightOf()).not.toBe(before);
  });

  it("stops watching when the preview goes away", async () => {
    givenPanelWidth(800);
    const { unmount } = render(<A4Preview html={HTML} title="Report card" />);
    await waitFor(() =>
      expect(screen.getByTitle("Report card")).toBeInTheDocument(),
    );

    unmount();
    expect(FakeResizeObserver.last!.disconnected).toBe(true);
  });
});
