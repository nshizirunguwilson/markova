import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MediaLightbox } from "./media-lightbox";

/**
 * Not fullscreen: about nine tenths of the window, on a dimmed ground, with
 * the page still visible at the edges. Only the media — no filmstrip, no
 * sender, no caption; those are all on the page behind it.
 */
describe("opening a picture large", () => {
  it("shows the image and nothing else from the conversation", () => {
    render(
      <MediaLightbox src="/uploads/a.jpg" kind="image" name="sports day.jpg" onClose={vi.fn()} />,
    );
    expect(screen.getByAltText("sports day.jpg")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("caps it at nine tenths of the window rather than filling it", () => {
    render(<MediaLightbox src="/uploads/a.jpg" kind="image" onClose={vi.fn()} />);
    const img = document.querySelector("img")!;
    expect(img.className).toContain("max-h-[90vh]");
    expect(img.className).toContain("max-w-[90vw]");
  });

  it("plays a clip when that is what was opened", () => {
    render(<MediaLightbox src="/uploads/a.mp4" kind="video" onClose={vi.fn()} />);
    const video = document.querySelector("video")!;
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("controls");
  });

  it("is announced as a dialog", () => {
    render(<MediaLightbox src="/uploads/a.jpg" kind="image" name="a.jpg" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  describe("getting out of it", () => {
    it("closes on the close button", async () => {
      const onClose = vi.fn();
      render(<MediaLightbox src="/uploads/a.jpg" kind="image" onClose={onClose} />);
      await userEvent.setup().click(screen.getByRole("button", { name: /close/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it("closes on Escape", async () => {
      const onClose = vi.fn();
      render(<MediaLightbox src="/uploads/a.jpg" kind="image" onClose={onClose} />);
      await userEvent.setup().keyboard("{Escape}");
      expect(onClose).toHaveBeenCalled();
    });

    // The gesture people try first.
    it("closes when the ground around it is clicked", async () => {
      const onClose = vi.fn();
      render(<MediaLightbox src="/uploads/a.jpg" kind="image" onClose={onClose} />);
      await userEvent.setup().click(screen.getByRole("dialog"));
      expect(onClose).toHaveBeenCalled();
    });

    // But touching the picture itself must not, or a clip's own controls
    // would close the thing the moment you reached for them.
    it("stays open when the media itself is clicked", async () => {
      const onClose = vi.fn();
      render(<MediaLightbox src="/uploads/a.jpg" kind="image" name="a.jpg" onClose={onClose} />);
      await userEvent.setup().click(screen.getByAltText("a.jpg"));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("offers a download without closing", async () => {
    const onClose = vi.fn();
    render(
      <MediaLightbox src="/uploads/a.jpg" kind="image" name="a.jpg" onClose={onClose} />,
    );
    const link = screen.getByRole("link", { name: /download/i });
    expect(link).toHaveAttribute("download", "a.jpg");
    await userEvent.setup().click(link);
    expect(onClose).not.toHaveBeenCalled();
  });

  // The page behind must not scroll under the overlay, and must get its
  // scrolling back afterwards.
  it("holds the page still while it is open", () => {
    const { unmount } = render(
      <MediaLightbox src="/uploads/a.jpg" kind="image" onClose={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  /*
    Portalled to the body: the thread scrolls and animates its own opacity,
    and a fixed child of an animating ancestor is trapped inside it — the same
    trap that once painted a modal underneath the sidebar.
  */
  it("is portalled out of the thread", () => {
    const { container } = render(
      <MediaLightbox src="/uploads/a.jpg" kind="image" onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector('[role="dialog"]')).toBeInTheDocument();
  });
});
