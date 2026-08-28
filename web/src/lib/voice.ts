/**
 * Voice notes: what the browser can record, and how a recording is turned
 * into the row of bars people expect to see.
 */

/**
 * The recording formats, best first.
 *
 * Opus in WebM is what Chrome and Firefox record and is far the smallest for
 * speech — a minute is about 500KB. Safari records neither, and gives back
 * MP4/AAC instead, so both have to be offered or half a school cannot record
 * at all. Every one of these is on the API's accepted list.
 */
const RECORDING_FORMATS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

/**
 * The format this browser will actually record in, or null when it cannot
 * record at all — an old browser, or a page not served over HTTPS, where
 * `MediaRecorder` is simply absent.
 */
export function recordingMimeType(
  /*
    Injected so the choice can be tested. The default answers false for every
    format when there is no MediaRecorder at all, which is the same answer as
    a browser that supports none of them: nothing can be recorded.
  */
  supported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported(type),
): string | null {
  return RECORDING_FORMATS.find((type) => supported(type)) ?? null;
}

/**
 * The extension the API stores each of those under, so the recording arrives
 * with a filename that matches what is inside it.
 */
export function extensionForRecording(mimeType: string): string {
  if (mimeType.startsWith("audio/webm")) return "weba";
  if (mimeType.startsWith("audio/mp4")) return "m4a";
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  return "weba";
}

/** How long a voice note may run before it stops itself. */
export const MAX_VOICE_SECONDS = 5 * 60;

/** "0:07", "1:42", "12:05" — the way every player writes a length. */
export function clockDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  return `${mins}:${String(whole % 60).padStart(2, "0")}`;
}

/** How many bars a waveform is drawn with. */
export const WAVEFORM_BARS = 40;

/**
 * The heights of those bars, from the audio itself.
 *
 * The samples are divided into as many buckets as there are bars and each
 * bucket's loudest moment becomes one bar. Peak rather than average, because
 * an average over several thousand samples of speech flattens into a nearly
 * straight line — the shape people recognise as a voice comes from the peaks.
 *
 * Heights come back between 0 and 1, scaled so the loudest bar in the clip is
 * full height. A voice note recorded quietly should look like a voice note,
 * not like silence.
 */
export function peaksFrom(
  samples: Float32Array | number[],
  bars = WAVEFORM_BARS,
): number[] {
  const total = samples.length;
  if (!total || bars < 1) return new Array(Math.max(bars, 0)).fill(0);

  const width = total / bars;
  const peaks: number[] = [];

  for (let bar = 0; bar < bars; bar += 1) {
    const from = Math.floor(bar * width);
    const to = Math.min(total, Math.floor((bar + 1) * width));
    let loudest = 0;
    for (let i = from; i < to; i += 1) {
      const level = Math.abs(samples[i]);
      if (level > loudest) loudest = level;
    }
    peaks.push(loudest);
  }

  const tallest = Math.max(...peaks);
  // Silence stays silence rather than being divided by nothing.
  if (tallest <= 0) return peaks.map(() => 0);
  return peaks.map((p) => p / tallest);
}

/**
 * A bar's height as a percentage of the row.
 *
 * Floored at a visible minimum: a bar of zero height is a gap, and a row with
 * gaps in it reads as a broken picture rather than as a pause in speech.
 */
export function barHeight(peak: number): string {
  const pct = 12 + Math.min(Math.max(peak, 0), 1) * 88;
  return `${Math.round(pct)}%`;
}

/**
 * How far through the clip a given bar sits, so the bars behind the playhead
 * can be coloured and the ones ahead left grey — the way every voice note in
 * every messaging app shows progress.
 */
export function barsPlayed(progress: number, bars = WAVEFORM_BARS): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return Math.round(clamped * bars);
}
