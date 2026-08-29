"use client";

import { useEffect, useRef, useState } from "react";
import { Pause } from "lucide-react";

import { PlayTriangle } from "./play-triangle";

import { resolveUploadUrl } from "@/lib/assets";
import {
  WAVEFORM_BARS,
  barHeight,
  barsPlayed,
  clockDuration,
  peaksFrom,
} from "@/lib/voice";

/**
 * A voice note, played the way people expect one to be played.
 *
 * One button, a row of bars showing the shape of the speech, and the length.
 * The bars behind the playhead are filled and the ones ahead are not, and
 * clicking anywhere in the row jumps to that point — which is the only way to
 * skip back over a sentence you missed without starting again.
 *
 * The bars are the real audio, not a decoration. They are worked out by
 * decoding the clip in the browser, which costs a few milliseconds for
 * something the length of a spoken sentence. Until that is done the row shows
 * flat bars: honestly nothing yet, rather than a made-up shape.
 */

/**
 * Clips already read, by URL: their bars and their length.
 *
 * A thread scrolled up and down would otherwise decode the same clip every
 * time it came back into view. The length is kept alongside the bars because
 * it comes from the same decode — a WebM recording reports its own length as
 * Infinity until it has been seeked, so this is often the only place the real
 * one is known.
 */
const known = new Map<string, { peaks: number[]; duration: number }>();

/** Only for tests, which must not inherit waveforms from each other. */
export function clearKnownWaveforms(): void {
  known.clear();
}

export function VoiceNote({
  fileUrl,
  mine,
}: {
  fileUrl: string;
  /** Inside one of your own bubbles the ground is the brand colour. */
  mine?: boolean;
}) {
  const href = resolveUploadUrl(fileUrl);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  // What is already known about this clip, so a thread scrolled back to does
  // not redraw from nothing.
  const read = href ? known.get(href) : undefined;
  const [length, setLength] = useState(read?.duration ?? 0);
  const [peaks, setPeaks] = useState<number[] | null>(read?.peaks ?? null);

  /*
    Decoding the clip to find its shape. Deliberately best effort: a browser
    with no AudioContext, a file that will not decode, or a network that drops
    all leave the flat bars in place, and the clip still plays — the waveform
    is how it looks, not whether it works.
  */
  useEffect(() => {
    if (!href || known.has(href)) return;

    let cancelled = false;
    const Ctx =
      typeof window !== "undefined"
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)
        : undefined;
    if (!Ctx) return;

    (async () => {
      try {
        const bytes = await (await fetch(href)).arrayBuffer();
        if (cancelled) return;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(bytes);
        void ctx.close();
        if (cancelled) return;

        const found = peaksFrom(decoded.getChannelData(0));
        known.set(href, { peaks: found, duration: decoded.duration });
        setPeaks(found);
        // The decoded clip knows its own length before the element does.
        setLength((was) => was || decoded.duration);
      } catch {
        // Flat bars, and a clip that still plays.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [href]);

  if (!href) return null;

  const bars = peaks ?? new Array(WAVEFORM_BARS).fill(0);
  const progress = length > 0 ? at / length : 0;
  const filled = barsPlayed(progress, bars.length);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  /** Jump to the point in the clip that was clicked. */
  const seekTo = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !length) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    audio.currentTime = Math.min(Math.max(fraction, 0), 1) * length;
  };

  return (
    <div className="flex w-[15rem] max-w-full items-center gap-2.5">
      <audio
        ref={audioRef}
        src={href}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          // Back to the start, so pressing play again replays it rather than
          // doing nothing because the clip is already at its end.
          setAt(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const found = e.currentTarget.duration;
          // A WebM recording often reports Infinity until it has been seeked;
          // the decoded length above covers that case.
          if (Number.isFinite(found)) setLength(found);
        }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
          mine
            ? "bg-on-primary/20 text-on-primary hover:bg-on-primary/30"
            : "bg-primary text-on-primary hover:opacity-90"
        }`}
      >
        {playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <PlayTriangle className="h-4 w-4" />
        )}
      </button>

      {/*
        The bars. A div rather than a slider because the audio element is
        the real control — this is the visible half of it, and the button
        beside it is what a keyboard reaches.
      */}
      <div className="min-w-0 flex-1">
        <div
          onClick={seekTo}
          role="presentation"
          className="flex h-9 cursor-pointer items-center gap-[2px]"
        >
          {bars.map((peak, i) => (
            <span
              key={i}
              style={{ height: barHeight(peak) }}
              className={`w-[3px] flex-shrink-0 rounded-full transition-colors ${
                i < filled
                  ? mine
                    ? "bg-on-primary"
                    : "bg-primary"
                  : mine
                    ? "bg-on-primary/35"
                    : "bg-primary/25"
              }`}
            />
          ))}
        </div>
      </div>

      {/*
        The length goes at the end of the row, in the space the bars leave.

        The bars are a fixed count at a fixed width, so a bubble sized for the
        widest of them always ends with a gap on the right — and the length
        was sitting on a line of its own underneath, making the bubble taller
        for a number that already had somewhere to be. One row now: press it,
        scrub it, read how long it is.
      */}
      <span
        className={`flex-shrink-0 text-[0.6875rem] tabular-nums ${
          mine ? "text-on-primary/70" : "text-muted"
        }`}
      >
        {/* Counting up while it plays, its full length when it is not —
            the same as every voice note anybody has used. */}
        {clockDuration(playing || at > 0 ? at : length)}
      </span>
    </div>
  );
}
