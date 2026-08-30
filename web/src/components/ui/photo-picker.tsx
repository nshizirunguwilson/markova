"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { Button } from "./button";
import { resolveUploadUrl } from "@/lib/assets";

/**
 * Choosing a profile photograph.
 *
 * Two things about this are deliberate.
 *
 * The frame is round and crops to the centre, and the photograph somebody
 * picks off a phone almost never is. So the chosen file is shown in the frame
 * it will actually appear in, at the size it will actually appear, before
 * anything is uploaded - the alternative is finding out from the topbar that
 * the school now holds a picture of your forehead.
 *
 * And the file is checked here before it is sent. The API refuses the wrong
 * type and anything over its limit, correctly, but a person who picked a
 * 12MB photo should be told so at once rather than after uploading it over a
 * school's connection.
 */

/** What the API stores, so what it will accept back. */
const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** A size a person recognises, rather than a count of bytes. */
export const sizeLabel = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;

/**
 * Why this file cannot be used, or null when it can.
 *
 * Named after what the reader has to do about it. "Invalid file" tells
 * somebody that something is wrong and nothing about which of their choices
 * to change.
 */
export function refusePhoto(file: {
  type: string;
  size: number;
}): string | null {
  if (!ACCEPTED.includes(file.type.split(";")[0].trim().toLowerCase())) {
    return "That file is not a photograph. Choose a JPG, PNG, GIF or WEBP.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `That photograph is ${sizeLabel(file.size)}. The largest the school stores is ${sizeLabel(MAX_PHOTO_BYTES)}.`;
  }
  return null;
}

export interface PhotoPickerProps {
  /** What is on file now, as the API stores it. */
  photoUrl?: string | null;
  /** Shown in the frame when there is no photograph. */
  initials: string;
  /** Whose photograph this is, for the labels a screen reader announces. */
  name: string;
  /**
   * Returning a promise lets the picker settle back to its resting state
   * once the photograph is actually stored - and, just as importantly, stay
   * in the preview holding the chosen file when the upload is refused, so
   * somebody can press Save again rather than hunt for the file a second
   * time.
   */
  onSave: (file: File) => void | Promise<unknown>;
  onRemove: () => void;
  saving?: boolean;
  removing?: boolean;
  /** Said aloud when a file is refused. */
  onRefuse?: (why: string) => void;
}

export function PhotoPicker({
  photoUrl,
  initials,
  name,
  onSave,
  onRemove,
  saving,
  removing,
  onRefuse,
}: PhotoPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  /*
    The file and the URL that previews it are made together and dropped
    together. Holding them as two pieces of state would need an effect to
    keep them in step, and setting state from an effect leaves a frame where
    the file is chosen and the preview is not yet drawn.
  */
  const [chosen, setChosen] = useState<{ file: File; url: string } | null>(
    null,
  );

  /*
    An object URL is a handle on memory the page keeps until it is revoked,
    so every one has to be let go of: when another file is chosen, when the
    choice is cancelled, and when the page goes away. A cleanup-only effect
    covers all three, because React runs the previous cleanup before the next
    effect and once more on unmount.
  */
  useEffect(() => {
    const url = chosen?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [chosen]);

  const take = (file: File | undefined) => {
    if (!file) return;
    const why = refusePhoto(file);
    if (why) {
      onRefuse?.(why);
      return;
    }
    setChosen({ file, url: URL.createObjectURL(file) });
  };

  const clear = () => {
    setChosen(null);
    if (input.current) input.current.value = "";
  };

  const save = async (file: File) => {
    try {
      await onSave(file);
      clear();
    } catch {
      /* The caller has already said what went wrong. Keeping the choice is
         the whole point: pressing Save again must not mean finding the file
         again. */
    }
  };

  const shown = chosen?.url ?? resolveUploadUrl(photoUrl);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* The frame itself is the control. A photograph is the thing people
          reach for, and a button beside it that does the same job teaches
          them the picture is not clickable. */}
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={
          photoUrl ? `Change ${name}'s photo` : `Add a photo for ${name}`
        }
        className="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-full border-2 border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {shown ? (
          <img
            src={shown}
            alt={chosen ? "The photograph you chose" : name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-primary text-2xl font-bold text-on-primary">
            {initials}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
          <Camera className="h-6 w-6 text-white" />
        </span>
      </button>

      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        aria-label="Choose a photo"
        onChange={(e) => take(e.target.files?.[0])}
      />

      <div className="min-w-0">
        {chosen ? (
          <>
            {/* Deliberately naming the file: somebody who picked the wrong
                one of four near-identical photographs can tell from here. */}
            <p className="text-sm text-foreground">
              <span className="font-medium">{chosen.file.name}</span>{" "}
              <span className="text-muted">
                ({sizeLabel(chosen.file.size)})
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              This is how it will appear. Photographs are cropped to a circle
              from the centre.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" isLoading={saving} onClick={() => save(chosen.file)}>
                <Upload className="mr-1.5 h-4 w-4" /> Save photo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => input.current?.click()}
              >
                Choose another
              </Button>
              <Button variant="secondary" size="sm" onClick={clear}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              Profile photo
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {photoUrl
                ? "Shown beside your name across the school."
                : "Your initials are shown until you add one."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => input.current?.click()}>
                <Camera className="mr-1.5 h-4 w-4" />
                {photoUrl ? "Change photo" : "Add a photo"}
              </Button>
              {photoUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={removing}
                  onClick={onRemove}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Remove
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
