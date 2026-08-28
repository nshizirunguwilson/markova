"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

import { VideoPlayer } from "./video-player";

/**
 * One picture or clip, opened large.
 *
 * Not fullscreen: about nine tenths of the window, on a dimmed ground, with
 * the page still visible at the edges. Fullscreen hides where you were and
 * takes over the whole screen for something you meant to glance at; this is
 * the size every messaging app opens a photograph to, and leaving a margin is
 * what makes clicking outside to close feel obvious.
 *
 * Only the media. No filmstrip of the other things in the conversation, no
 * sender, no caption — those are all on the page behind it, and putting them
 * here again just makes the thing you wanted to look at smaller.
 *
 * Portalled to the body, because the thread scrolls and animates its own
 * opacity, and a fixed child of an animating ancestor is trapped inside it.
 */
export function MediaLightbox({
  src,
  kind,
  name,
  onClose,
}: {
  src: string;
  kind: "image" | "video";
  name?: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll under the overlay.
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [onKey]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name || (kind === "video" ? "Video" : "Image")}
      // Clicking the ground closes it, which is the gesture people try first.
      onClick={onClose}
      className="motion-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      <a
        href={src}
        download={name || undefined}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Download ${name || "file"}`}
        className="absolute right-16 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <Download className="h-5 w-5" />
      </a>

      {/*
        The media itself, capped at nine tenths of the window in both
        directions so a tall photograph and a wide one both fit whole. The
        click guard stops the ground's close handler firing when somebody
        means to touch the picture — or a control on the clip.
      */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] max-w-[90vw] items-center justify-center"
      >
        {kind === "video" ? (
          /* Our own controls, not the browser's — this is the only place a
             clip plays, so it is the only place they are needed. */
          <VideoPlayer
            src={src}
            autoPlay
            className="max-h-[90vh] max-w-[90vw]"
          />
        ) : (
          <img
            src={src}
            alt={name || ""}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
