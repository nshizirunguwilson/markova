"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Volume2, VolumeX } from "lucide-react";

import { PlayTriangle } from "./play-triangle";

import { clockDuration } from "@/lib/voice";

/**
 * A video in a message, with controls of our own.
 *
 * The browser's built-in controls are a different shape, colour and size in
 * every browser, and in a chat bubble they look like a piece of somebody
 * else's application dropped into the conversation. These are the school's:
 * the same brand colour as everything around them, the same type, and only
 * the four things anybody uses on a clip in a chat - play, a scrub bar, mute,
 * and open it larger.
 *
 * `preload="metadata"` still: enough to know how long it is and draw the
 * first frame, without pulling fifty megabytes down a mobile line for a clip
 * nobody plays.
 */

export function VideoPlayer({
  src,
  onExpand,
  autoPlay,
  className = "",
}: {
  src: string;
  /** Given when there is somewhere larger to open it. */
  onExpand?: () => void;
  /** Start playing as soon as it can. The lightbox opens on a deliberate
   *  press, so the clip should already be running when it appears. */
  autoPlay?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  /** True once anything has been played, so the big centre button gets out of the way. */
  const [started, setStarted] = useState(!!autoPlay);

  // Controls linger while paused and after a touch, and get out of the way
  // while it is actually playing.
  const [showing, setShowing] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keepShowing = () => {
    setShowing(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // Never hide them on a clip that is not running: there would be no way
      // to get them back other than guessing.
      if (!videoRef.current?.paused) setShowing(false);
    }, 2200);
  };

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setStarted(true);
    } else {
      video.pause();
    }
    keepShowing();
  };

  const seekTo = (event: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !length) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    video.currentTime = Math.min(Math.max(fraction, 0), 1) * length;
    keepShowing();
  };

  const progress = length > 0 ? Math.min(at / length, 1) : 0;

  return (
    <div
      className={`group/video relative overflow-hidden rounded-lg bg-black ${className}`}
      onMouseMove={keepShowing}
      onMouseLeave={() => {
        if (!videoRef.current?.paused) setShowing(false);
      }}
    >
      <video
        ref={videoRef}
        src={src}
        // Opened on a deliberate press, so it is worth fetching the whole
        // clip here; in a bubble it is only ever a still.
        preload={autoPlay ? "auto" : "metadata"}
        autoPlay={autoPlay}
        playsInline
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
        }}
        onPause={() => {
          setPlaying(false);
          setShowing(true);
        }}
        onEnded={() => {
          setPlaying(false);
          setShowing(true);
        }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const found = e.currentTarget.duration;
          if (Number.isFinite(found)) setLength(found);
        }}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        className={`w-full cursor-pointer bg-black ${
          autoPlay ? "max-h-[90vh]" : "max-h-72"
        }`}
      />

      {/*
        The big target, until it has been started. Tapping a small control on
        a phone is a worse first move than tapping the clip.

        Hidden from the accessibility tree on purpose: the play button in the
        bar below does exactly the same thing and is always present, so
        announcing this one too would offer a screen reader two identical
        controls and no way to tell them apart.
      */}
      {!started && (
        <button
          type="button"
          onClick={toggle}
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/35"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-primary">
            <PlayTriangle className="h-6 w-6" />
          </span>
        </button>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6 transition-opacity ${
          showing || !playing ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause video" : "Play video"}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <PlayTriangle className="h-4 w-4" />
          )}
        </button>

        <span className="flex-shrink-0 text-[0.6875rem] tabular-nums text-white/90">
          {clockDuration(at)} / {clockDuration(length)}
        </span>

        {/* The scrub bar. A div rather than a slider because the video element
            is the real control; this is the visible half of it, and the
            buttons either side are what a keyboard reaches. */}
        <div
          onClick={seekTo}
          role="presentation"
          className="h-4 min-w-0 flex-1 cursor-pointer py-[6px]"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = !video.muted;
            setMuted(video.muted);
            keepShowing();
          }}
          aria-label={muted ? "Unmute video" : "Mute video"}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            aria-label="Open video larger"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
          >
            <Maximize2 className="h-[15px] w-[15px]" />
          </button>
        )}
      </div>
    </div>
  );
}
