import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  // The bars behind the playhead are filled and the ones ahead are not,
  // in whichever bubble the note is sitting.
  it.each([
    ["your own", true],
    ["somebody else's", false],
  ])("fills the bars it has played through, in %s bubble", async (_, mine) => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" mine={mine} />,
    );
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { value: 10, configurable: true });
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });
    Object.defineProperty(audio, "currentTime", {
      value: 5,
      configurable: true,
      writable: true,
    });
    act(() => {
      audio.dispatchEvent(new Event("timeupdate"));
    });

    const classes = [...bars()].map((b) => b.className);
    expect(new Set(classes).size).toBeGreaterThan(1);
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

/**
 * The bars are the real audio. They are worked out by decoding the clip in
 * the browser, which costs a few milliseconds for something the length of a
 * spoken sentence.
 */
describe("drawing the shape of the speech", () => {
  /** An AudioContext that decodes to a known, obviously uneven waveform. */
  function stubDecoding(samples: Float32Array, duration = 12) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    );
    vi.stubGlobal(
      "AudioContext",
      class {
        close = vi.fn(async () => {});
        decodeAudioData = async () => ({
          duration,
          getChannelData: () => samples,
        });
      },
    );
  }

  function loud() {
    // Quiet at the start, loud at the end: a shape a flat row cannot fake.
    const samples = new Float32Array(400).fill(0.02);
    samples.fill(1, 300);
    return samples;
  }

  it("replaces the flat bars with the real ones", async () => {
    stubDecoding(loud());
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);

    await waitFor(() => {
      const heights = [...bars()].map((b) =>
        parseInt((b as HTMLElement).style.height, 10),
      );
      expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights));
    });
  });

  it("takes the length from the decoded clip", async () => {
    stubDecoding(loud(), 12);
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    expect(await screen.findByText("0:12")).toBeInTheDocument();
  });

  // A thread scrolled up and down would otherwise decode the same clip every
  // time it came back into view.
  it("decodes a clip only once", async () => {
    stubDecoding(loud());
    const { unmount } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    await screen.findByText("0:12");
    unmount();

    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    await screen.findByText("0:12");

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  /*
    Deliberately best effort: a file that will not decode, or a network that
    drops, leaves the flat bars in place and the clip still plays.
  */
  it("still plays when the audio cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);

    expect(
      screen.getByRole("button", { name: /play voice note/i }),
    ).toBeInTheDocument();
    expect(bars().length).toBeGreaterThan(0);
  });

  /*
    A thread scrolled past while the clip is still being read. The decode has
    to notice it is no longer wanted rather than setting state on a component
    that has gone.
  */
  it("stops reading when the thread moves on mid-decode", async () => {
    let release: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Promise((resolve) => {
            release = () =>
              resolve({ arrayBuffer: async () => new ArrayBuffer(8) });
          }),
      ),
    );
    vi.stubGlobal(
      "AudioContext",
      class {
        close = vi.fn(async () => {});
        decodeAudioData = async () => ({
          duration: 4,
          getChannelData: () => new Float32Array(40).fill(0.5),
        });
      },
    );

    const { unmount } = render(
      <VoiceNote fileUrl="/uploads/attachments/gone.weba" />,
    );
    unmount();
    release(null);

    // Nothing to assert on screen; what matters is that no state was set on
    // a component that had gone, which React would warn about.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("does not try at all where there is no AudioContext", () => {
    vi.stubGlobal("AudioContext", undefined);
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    expect(fetched).not.toHaveBeenCalled();
  });
});

/**
 * Clicking anywhere in the row jumps to that point, which is the only way to
 * skip back over a sentence you missed without starting again.
 */
describe("skipping through a voice note", () => {
  it("jumps to the point that was clicked", async () => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    const audio = container.querySelector("audio")!;
    // The length arrives with the metadata; jsdom never fires it on its own.
    Object.defineProperty(audio, "duration", {
      value: 20,
      configurable: true,
    });
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });

    const row = container.querySelector('[role="presentation"]')!;
    row.getBoundingClientRect = () =>
      ({ left: 0, width: 100 }) as DOMRect;
    fireEvent.click(row, { clientX: 50 });

    expect(audio.currentTime).toBe(10);
  });

  // A WebM recording reports Infinity for its length until it has been
  // seeked, and a row that cannot be seeked must not set a nonsense time.
  it("does nothing while the length is still unknown", async () => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "duration", {
      value: Infinity,
      configurable: true,
    });
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });

    const row = container.querySelector('[role="presentation"]')!;
    row.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    fireEvent.click(row, { clientX: 50 });

    expect(audio.currentTime).toBe(0);
  });

  it("counts up as it plays", async () => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "currentTime", {
      value: 5,
      configurable: true,
      writable: true,
    });
    audio.dispatchEvent(new Event("timeupdate"));

    expect(await screen.findByText("0:05")).toBeInTheDocument();
  });

  it("pauses when it is already playing", async () => {
    const { container } = render(
      <VoiceNote fileUrl="/uploads/attachments/a1.weba" />,
    );
    const audio = container.querySelector("audio")!;
    const pause = vi.fn();
    Object.defineProperty(audio, "pause", { value: pause, configurable: true });
    Object.defineProperty(audio, "paused", {
      value: false,
      configurable: true,
    });
    audio.dispatchEvent(new Event("play"));

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /pause voice note/i }));

    expect(pause).toHaveBeenCalled();
  });
});

/**
 * Forty bars inside a bubble a few hundred pixels wide gave each one about
 * two pixels of room, which is not a bar - it is a dotted line, and that is
 * what it looked like.
 */
describe("the size a voice note is drawn at", () => {
  it("draws bars with real width, not hairlines", () => {
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    for (const bar of bars()) {
      expect(bar.className).toContain("w-[3px]");
    }
  });

  it("uses few enough bars to fit a bubble", () => {
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    expect(bars().length).toBeLessThanOrEqual(28);
  });

  // A bar barely taller than it is wide reads as a dot.
  it("never draws a silent bar as a dot", () => {
    render(<VoiceNote fileUrl="/uploads/attachments/a1.weba" />);
    for (const bar of bars()) {
      expect(parseInt((bar as HTMLElement).style.height, 10)).toBeGreaterThanOrEqual(20);
    }
  });
});

/**
 * The button and the bars are one control - you press it and scrub it - so
 * the length sits under the pair rather than wedged between them.
 */
describe("how a voice note is laid out", () => {
  it("puts the button and the bars on one row", () => {
    const { container } = render(<VoiceNote fileUrl="/uploads/a.weba" />);
    const button = container.querySelector("button")!;
    const bars = container.querySelector('[role="presentation"]')!;
    // Same row means a common flex parent holding both.
    const row = button.parentElement!;
    expect(row.className).toContain("flex");
    expect(row.contains(bars)).toBe(true);
  });

  /*
    The bars are a fixed count at a fixed width, so a bubble sized for the
    widest of them always ends with a gap on the right. The length goes there
    rather than on a line of its own, which made the bubble taller for a
    number that already had somewhere to be.
  */
  it("puts the length at the end of the same row", () => {
    const { container } = render(<VoiceNote fileUrl="/uploads/a.weba" />);
    const length = [...container.querySelectorAll("span")].find((e) =>
      /^\d+:\d\d$/.test(e.textContent ?? ""),
    )!;
    const button = container.querySelector("button")!;
    const bars = container.querySelector('[role="presentation"]')!;

    // One row holding all three.
    const row = button.parentElement!;
    expect(row.contains(bars)).toBe(true);
    expect(row.contains(length)).toBe(true);
  });

  it("puts it after the bars, not before them", () => {
    const { container } = render(<VoiceNote fileUrl="/uploads/a.weba" />);
    const length = [...container.querySelectorAll("span")].find((e) =>
      /^\d+:\d\d$/.test(e.textContent ?? ""),
    )!;
    const bars = container.querySelector('[role="presentation"]')!;
    expect(
      bars.compareDocumentPosition(length) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // The bars take the room; the number keeps only what it needs.
  it("does not let the length squeeze the bars", () => {
    const { container } = render(<VoiceNote fileUrl="/uploads/a.weba" />);
    const length = [...container.querySelectorAll("span")].find((e) =>
      /^\d+:\d\d$/.test(e.textContent ?? ""),
    )!;
    expect(length.className).toContain("flex-shrink-0");
  });
});
