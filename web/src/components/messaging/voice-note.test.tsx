import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VoiceNote, clearKnownWaveforms } from "./voice-note";

beforeEach(() => {
  clearKnownWaveforms();
  vi.restoreAllMocks();
});

/** The row of bars, whatever else is on the page. */
function bars() {
  return document.querySelectorAll('[role="presentation"] > span');
}

describe("playing a voice note", () => {
  it("offers one button to play it", () => {
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    expect(
      screen.getByRole("button", { name: /play voice note/i }),
    ).toBeInTheDocument();
  });

  it("plays the file it was given", () => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    expect(container.querySelector("audio")).toHaveAttribute(
      "src",
      expect.stringContaining("a1.weba"),
    );
  });

  it("shows nothing at all without a file", () => {
    const { container } = render(<VoiceNote fileUrl="" />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The bars are drawn straight away, flat, rather than waiting for the clip
   * to decode: an empty space that fills in later reads as a broken layout.
   */
  it("draws a row of bars before the audio has been read", () => {
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    expect(bars().length).toBeGreaterThan(0);
  });

  it("gives every bar a height, so none of them is a gap", () => {
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    for (const bar of bars()) {
      expect((bar as HTMLElement).style.height).not.toBe("0%");
    }
  });

  // Counting up while it plays, its full length when it is not.
  it("shows a length", () => {
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    expect(screen.getByText(/^\d+:\d\d$/)).toBeInTheDocument();
  });

  it("says pause once it is playing", async () => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    const audio = container.querySelector("audio")!;
    // jsdom does not implement playback, so the event is what the component
    // actually listens to.
    audio.dispatchEvent(new Event("play"));
    expect(
      await screen.findByRole("button", { name: /pause voice note/i }),
    ).toBeInTheDocument();
  });

  // Pressing play at the end of a clip must replay it rather than doing
  // nothing because it is already finished.
  it("goes back to the start when it ends", async () => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    const audio = container.querySelector("audio")!;
    audio.dispatchEvent(new Event("play"));
    audio.dispatchEvent(new Event("ended"));
    expect(
      await screen.findByRole("button", { name: /play voice note/i }),
    ).toBeInTheDocument();
    expect(audio.currentTime).toBe(0);
  });

  it("plays and pauses from the one button", async () => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    const audio = container.querySelector("audio")!;
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(audio, "play", { value: play, configurable: true });
    Object.defineProperty(audio, "paused", { value: true, configurable: true });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /play voice note/i }));

    expect(play).toHaveBeenCalled();
  });

  it("takes its colours from your own bubble", () => {
    const { rerender } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    const theirs = bars()[0].className;
    rerender(<VoiceNote fileUrl="/uploads/attachments/a1.weba" mine />);
    expect(bars()[0].className).not.toBe(theirs);
  });
});
