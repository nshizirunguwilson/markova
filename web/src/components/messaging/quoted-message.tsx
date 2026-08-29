"use client";

import { personName } from "@/lib/person";

/**
 * The message being answered, drawn above the answer.
 *
 * A coloured bar down the leading edge, the name of whoever said it, and one
 * line of what they said. That shape is the convention across every messaging
 * app there is, and a reply that does not show what it answers is a reply
 * nobody can follow after scrolling away.
 *
 * One line, clipped: the quote exists to identify the message, not to repeat
 * it. Anyone who wants the whole thing taps through to it.
 */

export interface QuotedFor {
  id?: string;
  content?: string | null;
  contentType?: string | null;
  senderUserId?: string | null;
  sender?: { firstName?: string | null; lastName?: string | null } | null;
}

/** What a quote says for something that is not words. */
export function quotedSummary(message: QuotedFor | null | undefined): string {
  if (!message) return "";
  const kind = message.contentType ?? "TEXT";
  // Its stored filename is not a sentence; what it is, is a voice message.
  if (kind === "VOICE") return "Voice message";
  if (kind === "FILE") return message.content?.trim() || "Attachment";
  return message.content?.trim() || "";
}

export function QuotedMessage({
  message,
  mine,
  onJump,
  className = "",
}: {
  message: QuotedFor | null | undefined;
  /** Drawn inside one of your own bubbles, where the ground is the brand. */
  mine?: boolean;
  /** Given when the original is still there to be jumped to. */
  onJump?: () => void;
  className?: string;
}) {
  if (!message) return null;

  const body = (
    <>
      <span
        className={`block truncate text-[0.75rem] font-semibold ${
          mine ? "text-on-primary/90" : "text-primary"
        }`}
      >
        {personName(message.sender)}
      </span>
      <span
        className={`block truncate text-[0.8125rem] ${
          mine ? "text-on-primary/75" : "text-muted"
        }`}
      >
        {quotedSummary(message) || "Message"}
      </span>
    </>
  );

  const shell = `block w-full min-w-0 rounded border-l-[3px] px-2 py-1 text-left ${
    mine
      ? "border-on-primary/60 bg-black/15"
      : "border-primary bg-primary/10"
  } ${className}`;

  // Tapping a quote goes to what it answers — the reason a quote is worth
  // having once the conversation has moved on.
  if (onJump) {
    return (
      <button type="button" onClick={onJump} className={`${shell} hover:opacity-90`}>
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}
