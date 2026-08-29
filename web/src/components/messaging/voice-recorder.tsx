"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Trash2 } from "lucide-react";

import {
  MAX_VOICE_SECONDS,
  WAVEFORM_BARS,
  barHeight,
  clockDuration,
  extensionForRecording,
  recordingMimeType,
} from "@/lib/voice";

/**
 * Recording a voice note.
 *
 * Press to start, and the field is replaced by the recorder: a red dot that
 * counts, the sound of your own voice drawn as it goes in, and two ways out -
 * throw it away or send it. Nothing is uploaded until send is pressed, so a
 * recording nobody meant to make never leaves the machine.
 *
 * The live bars are the microphone's actual level, read off an analyser as it
 * records. They exist to answer the one question a recorder has to answer
 * before you have finished speaking: is this thing hearing me.
 *
 * It stops itself at five minutes. A voice note that long is a phone call,
 * and a recorder left running by accident should not become a fifty megabyte
 * upload.
 */

export function VoiceRecorder({
  onRecorded,
  onStart,
  onCancel,
  disabled,
  hidden,
}: {
  /** A finished recording, ready to be sent as a message. */
  onRecorded: (file: File, seconds: number) => void;
  /** Recording has actually begun - the microphone was allowed. */
  onStart?: () => void;
  onCancel: () => void;
  disabled?: boolean;
  /**
   * Stand down: there is something to send, so Send has the end of the row.
   *
   * Hidden rather than unmounted, so a recording already running is not torn
   * out from under somebody who starts typing mid-sentence - the recorder
   * still owns the row until it is sent or thrown away.
   */
  hidden?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [refused, setRefused] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  /** Set when the recording is being thrown away rather than kept. */
  const discardingRef = useRef(false);

  /** Everything this recorder holds open: the microphone, the meter, the timers. */
  const releaseEverything = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    // The browser shows a recording indicator for as long as a track is live,
    // so every one of them has to be stopped or the school is told it is
    // still being listened to.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    recorderRef.current = null;
  };

  // A recorder left running because the page moved on is a microphone left
  // open, which is the one bug in this file that actually matters.
  useEffect(() => releaseEverything, []);

  const start = async () => {
    const mimeType = recordingMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setRefused(
        "This browser cannot record audio here. Chrome, Firefox or Safari over a secure connection can.",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Refused, or no microphone. Either way the person needs to be told
      // what to do rather than watching a button do nothing.
      setRefused(
        "Markova needs permission to use the microphone. Allow it in your browser and try again.",
      );
      return;
    }

    streamRef.current = stream;
    setRefused(null);
    chunksRef.current = [];
    discardingRef.current = false;
    secondsRef.current = 0;
    setSeconds(0);
    setLevels([]);

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const held = chunksRef.current;
      const ran = secondsRef.current;
      const thrownAway = discardingRef.current;
      releaseEverything();
      setRecording(false);

      if (thrownAway || held.length === 0) return;

      const blob = new Blob(held, { type: mimeType });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const file = new File(
        [blob],
        `voice-note-${stamp}.${extensionForRecording(mimeType)}`,
        { type: mimeType },
      );
      onRecorded(file, ran);
    };

    recorder.start();
    setRecording(true);
    // Only now, after permission was granted and the recorder actually
    // started - the composer must not hide its field for a recording that
    // was refused.
    onStart?.();

    /*
      The live meter. An analyser on the same stream, read once a frame - the
      recording itself is untouched by this, so a browser that cannot do it
      still records perfectly well.
    */
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        contextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);

        const readLevel = () => {
          analyser.getByteTimeDomainData(buffer);
          // Distance from the middle is the amplitude; the loudest sample in
          // the frame is what the bar shows.
          let loudest = 0;
          for (const sample of buffer) {
            const level = Math.abs(sample - 128) / 128;
            if (level > loudest) loudest = level;
          }
          setLevels((was) =>
            // Only the last row's worth is kept, so the bars scroll leftwards
            // rather than growing until they are hairlines.
            [...was, Math.min(loudest * 1.6, 1)].slice(-WAVEFORM_BARS),
          );
          frameRef.current = requestAnimationFrame(readLevel);
        };
        frameRef.current = requestAnimationFrame(readLevel);
      }
    } catch {
      // No meter. The recording is what matters.
    }

    tickRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_VOICE_SECONDS) {
        // Five minutes is a phone call. Kept rather than thrown away: the
        // person was mid-sentence, not mid-mistake.
        recorderRef.current?.stop();
      }
    }, 1000);
  };

  const stopAndSend = () => {
    discardingRef.current = false;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const throwAway = () => {
    discardingRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else {
      releaseEverything();
      setRecording(false);
    }
    onCancel();
  };

  // Nothing recording and Send has the row: show nothing at all.
  if (!recording && hidden) return null;

  if (!recording) {
    return (
      <>
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          aria-label="Record a voice note"
          title="Record a voice note"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
        >
          <Mic className="h-[17px] w-[17px]" />
        </button>
        {refused && (
          <span role="alert" className="sr-only">
            {refused}
          </span>
        )}
      </>
    );
  }

  const bars = [
    ...new Array(Math.max(0, WAVEFORM_BARS - levels.length)).fill(0),
    ...levels,
  ];

  /*
    Deliberately narrow. Recording used to take the whole composer, which put
    a forty-bar meter across the width of the window for what is a small,
    momentary control - it read as the app having changed mode rather than as
    a button being held. It now sits at about a third, the size it needs to
    say "recording, this long, throw away or send".
  */
  return (
    /*
      Anchored to the right, where the microphone that started it was.

      As the last child of the composer it used to lay out from the left, so
      pressing a button on the right made the recorder appear on the other
      side of the row - the control looked like it had jumped away from the
      hand that pressed it. `ml-auto` keeps it under the same finger.
    */
    <div className="ml-auto flex w-[min(22rem,60%)] items-center gap-2 px-1">
      <button
        type="button"
        onClick={throwAway}
        aria-label="Discard recording"
        title="Discard recording"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger/10"
      >
        <Trash2 className="h-[17px] w-[17px]" />
      </button>

      {/* The dot the eye goes to: this is recording, right now. */}
      <span
        aria-hidden="true"
        className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-danger"
      />
      <span className="flex-shrink-0 text-[0.8125rem] tabular-nums text-foreground">
        {clockDuration(seconds)}
      </span>

      <div
        className="flex h-7 min-w-0 flex-1 items-center gap-[2px] overflow-hidden"
        aria-hidden="true"
      >
        {bars.map((level, i) => (
          <span
            key={i}
            style={{ height: barHeight(level) }}
            className="w-[3px] flex-shrink-0 rounded-full bg-primary/70"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={stopAndSend}
        aria-label="Send voice note"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-opacity hover:opacity-90"
      >
        <Send className="h-[16px] w-[16px]" />
      </button>

      <span role="status" className="sr-only">
        Recording, {clockDuration(seconds)}
      </span>
    </div>
  );
}
