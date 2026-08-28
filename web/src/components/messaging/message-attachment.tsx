"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";

import { resolveUploadUrl } from "@/lib/assets";
import { kindOfUrl, shortFilename } from "@/lib/attachments";
import { MediaLightbox } from "./media-lightbox";
import { PlayTriangle } from "./play-triangle";

/**
 * A file inside a message.
 *
 * Each kind gets the treatment that makes it useful in a conversation rather
 * than a row of identical paperclips:
 *
 *   image      shown, at a size you can read without opening it
 *   video      shown with the browser's own controls, not autoplaying
 *   audio      shown with the browser's own controls
 *   anything   a named row with its own download
 *
 * Every one of them can be downloaded, because "I can see it but I cannot
 * keep it" is the complaint every chat app that skipped this gets. Images and
 * video also open full size in a new tab, which is the gesture people already
 * try.
 *
 * Video is `preload="metadata"`: enough to draw the first frame and know the
 * length, without pulling 50MB down a mobile line for a clip nobody plays.
 */

export function MessageAttachment({
  fileUrl,
  fileName,
  mine,
}: {
  fileUrl: string;
  fileName?: string | null;
  /** Inside one of your own bubbles the ground is the brand colour. */
  mine?: boolean;
}) {
  const href = resolveUploadUrl(fileUrl);
  const kind = kindOfUrl(fileUrl);
  const name = fileName?.trim() || "Attachment";
  const [brokenImage, setBrokenImage] = useState(false);
  /** Open large, on a dimmed ground, when somebody asks for it. */
  const [opened, setOpened] = useState(false);

  if (!href) return null;

  /*
    The download control. An anchor rather than a button: `download` is what
    saves the file under the name the sender gave it rather than under the
    uuid it is stored as, and it needs no JavaScript to work.
  */
  const download = (
    <a
      href={href}
      download={name}
      aria-label={`Download ${name}`}
      title={`Download ${name}`}
      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
        mine
          ? "text-on-primary/80 hover:bg-black/20 hover:text-on-primary"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      <Download className="h-4 w-4" />
    </a>
  );

  if (kind === "image" && !brokenImage) {
    return (
      <figure className="group/att relative overflow-hidden rounded-md">
        {/* Opens large in place rather than in a new tab: a photograph in a
            conversation is something you glance at and come back from. */}
        <button
          type="button"
          onClick={() => setOpened(true)}
          aria-label={`Open ${name}`}
          className="block"
        >
          <img
            src={href}
            alt={name}
            onError={() => setBrokenImage(true)}
            /*
              Capped rather than sized: a tall photograph would otherwise push
              the rest of the conversation off the screen, and a narrow one
              should not be stretched to fill a box.
            */
            className="max-h-72 w-auto max-w-full rounded-md object-contain"
          />
        </button>
        {/* Over the picture, so it does not cost a row of height. Always
            visible on touch, where there is no hover to reveal it. */}
        <div className="absolute right-1.5 top-1.5 rounded-md bg-black/45 text-white backdrop-blur-sm">
          <a
            href={href}
            download={name}
            aria-label={`Download ${name}`}
            title={`Download ${name}`}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/60"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
        {opened && (
          <MediaLightbox
            src={href}
            kind="image"
            name={name}
            onClose={() => setOpened(false)}
          />
        )}
      </figure>
    );
  }

  if (kind === "video") {
    /*
      In the bubble a clip is a still with a play button on it — it does not
      play here at all. It used to, and expanding it then started a second
      copy from the beginning while the small one carried on playing behind
      the overlay: two soundtracks at once, and the position thrown away.

      One clip, one place. Pressing play opens it large and plays it there.
      Treated exactly like a photograph otherwise, down to where the download
      sits, because in a conversation they are the same kind of thing.
    */
    return (
      <figure className="group/att relative overflow-hidden rounded-md bg-black">
        <button
          type="button"
          onClick={() => setOpened(true)}
          aria-label={`Play ${name}`}
          className="block w-full"
        >
          <video
            src={href}
            // Enough to draw the first frame; nothing is fetched beyond it
            // until somebody actually opens the clip.
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            className="pointer-events-none max-h-72 w-full rounded-md bg-black object-contain"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors group-hover/att:bg-black/60">
              <PlayTriangle className="h-6 w-6" />
            </span>
          </span>
        </button>

        {/* Same corner as a photograph's. */}
        <div className="absolute right-1.5 top-1.5 rounded-md bg-black/45 text-white backdrop-blur-sm">
          <a
            href={href}
            download={name}
            aria-label={`Download ${name}`}
            title={`Download ${name}`}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/60"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>

        {opened && (
          <MediaLightbox
            src={href}
            kind="video"
            name={name}
            onClose={() => setOpened(false)}
          />
        )}
      </figure>
    );
  }

  if (kind === "audio") {
    return (
      <div className="min-w-[14rem]">
        <audio src={href} controls preload="metadata" className="w-full">
          <a href={href} download={name}>
            Download {name}
          </a>
        </audio>
        <div
          className={`mt-1 flex items-center gap-2 text-[0.75rem] ${
            mine ? "text-on-primary/80" : "text-muted"
          }`}
        >
          <span className="min-w-0 flex-1 truncate" title={name}>
            {shortFilename(name)}
          </span>
          {download}
        </div>
      </div>
    );
  }

  // Everything else: a named row. The name is the whole point — a recipient
  // offered "a1b2c3.pdf" does not know what they have been sent.
  return (
    <a
      href={href}
      download={name}
      title={name}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
        mine
          ? "bg-black/15 text-on-primary hover:bg-black/25"
          : "bg-surface text-foreground hover:bg-accent-light"
      }`}
    >
      <FileText className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
        {shortFilename(name)}
      </span>
      <Download className="h-4 w-4 flex-shrink-0 opacity-70" aria-hidden="true" />
    </a>
  );
}
