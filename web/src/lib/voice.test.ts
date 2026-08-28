import { describe, expect, it } from "vitest";

import {
  MAX_VOICE_SECONDS,
  WAVEFORM_BARS,
  barHeight,
  barsPlayed,
  clockDuration,
  extensionForRecording,
  peaksFrom,
  recordingMimeType,
} from "./voice";

/**
 * Opus in WebM is what Chrome and Firefox record. Safari records neither and
 * gives back MP4/AAC, so both have to be offered or half a school cannot
 * record at all.
 */
describe("what this browser can record", () => {
  it("prefers Opus, which is far the smallest for speech", () => {
    expect(recordingMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("falls back to what Safari can do", () => {
    expect(recordingMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("answers nothing when the browser can record none of them", () => {
    expect(recordingMimeType(() => false)).toBeNull();
  });

  // The recording has to arrive with a filename matching what is inside it,
  // because the API stores files under an extension taken from their type.
  it("names each recording after what it actually is", () => {
    expect(extensionForRecording("audio/webm;codecs=opus")).toBe("weba");
    expect(extensionForRecording("audio/mp4")).toBe("m4a");
    expect(extensionForRecording("audio/ogg;codecs=opus")).toBe("ogg");
  });
});

describe("how long a clip is, in words", () => {
  it("writes it the way every player does", () => {
    expect(clockDuration(7)).toBe("0:07");
    expect(clockDuration(102)).toBe("1:42");
    expect(clockDuration(725)).toBe("12:05");
  });

  // A WebM recording reports Infinity for its length until it has been
  // seeked, and "Infinity:NaN" in a bubble is worse than "0:00".
  it("copes with a length the browser does not know yet", () => {
    expect(clockDuration(Infinity)).toBe("0:00");
    expect(clockDuration(NaN)).toBe("0:00");
    expect(clockDuration(-1)).toBe("0:00");
  });

  // Five minutes is a phone call, and a recorder left running by accident
  // should not become a fifty megabyte upload.
  it("stops itself well before the audio size cap", () => {
    expect(MAX_VOICE_SECONDS).toBe(300);
  });
});

/**
 * The bars are the audio itself, not a decoration. Peak rather than average,
 * because an average over thousands of samples of speech flattens into a
 * nearly straight line.
 */
describe("turning audio into bars", () => {
  it("gives back one bar for each bar asked for", () => {
    expect(peaksFrom(new Float32Array(1000), 40)).toHaveLength(40);
    expect(peaksFrom(new Float32Array(1000))).toHaveLength(WAVEFORM_BARS);
  });

  it("takes the loudest moment of each stretch, not the average", () => {
    // Quiet throughout with one loud sample in the second half.
    const samples = new Float32Array(100).fill(0.1);
    samples[75] = 1;
    const peaks = peaksFrom(samples, 4);
    expect(peaks[3]).toBe(1);
    expect(peaks[0]).toBeLessThan(0.5);
  });

  it("hears a negative swing as loudly as a positive one", () => {
    expect(peaksFrom([0, -1, 0, 0], 1)[0]).toBe(1);
  });

  // A voice note recorded quietly should look like a voice note, not like
  // silence, so the loudest bar in the clip is always full height.
  it("scales a quiet recording up to fill the row", () => {
    const peaks = peaksFrom([0.01, 0.02, 0.03, 0.04], 4);
    expect(Math.max(...peaks)).toBe(1);
  });

  it("leaves silence as silence rather than dividing by nothing", () => {
    expect(peaksFrom(new Float32Array(40), 4)).toEqual([0, 0, 0, 0]);
  });

  it("copes with no audio at all", () => {
    expect(peaksFrom([], 5)).toEqual([0, 0, 0, 0, 0]);
  });

  it("copes with being asked for no bars", () => {
    expect(peaksFrom([0.5, 0.5], 0)).toEqual([]);
  });
});

/**
 * A bar of zero height is a gap, and a row with gaps in it reads as a broken
 * picture rather than as a pause in speech.
 */
describe("how tall a bar is drawn", () => {
  it("never draws one as nothing", () => {
    expect(parseInt(barHeight(0), 10)).toBeGreaterThan(0);
  });

  it("draws the loudest at full height", () => {
    expect(barHeight(1)).toBe("100%");
  });

  it("grows with the sound", () => {
    expect(parseInt(barHeight(0.8), 10)).toBeGreaterThan(
      parseInt(barHeight(0.2), 10),
    );
  });

  it("holds a stray value inside the row", () => {
    expect(barHeight(5)).toBe("100%");
    expect(parseInt(barHeight(-1), 10)).toBeGreaterThan(0);
  });
});

/** The bars behind the playhead are filled and the ones ahead are not. */
describe("how much of a clip has played", () => {
  it("fills none at the start and all at the end", () => {
    expect(barsPlayed(0, 40)).toBe(0);
    expect(barsPlayed(1, 40)).toBe(40);
  });

  it("fills half way through", () => {
    expect(barsPlayed(0.5, 40)).toBe(20);
  });

  // The length is not known until the metadata loads, and dividing by it
  // before then produces numbers outside the row.
  it("holds a stray progress inside the row", () => {
    expect(barsPlayed(2, 40)).toBe(40);
    expect(barsPlayed(-1, 40)).toBe(0);
  });
});
