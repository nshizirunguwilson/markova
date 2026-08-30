"use client";

import { Fragment } from "react";
import { splitMentions } from "@/lib/mention-draft";

/**
 * The words of a message, with links made clickable.
 *
 * A teacher pasting a link to a past paper and everybody having to retype it
 * is the whole problem. Detection is deliberately narrow - `http://`,
 * `https://`, a bare `www.`, and email addresses - rather than anything that
 * looks vaguely like a domain: "See you at 9.30am" contains no link, and a
 * greedy matcher turns "9.30am" into one.
 *
 * Links open in a new tab with `noopener noreferrer`, so a page somebody in
 * the school was sent cannot reach back into the tab that opened it.
 */

/*
  Three alternatives in one pass so the pieces come back in order:
  a full URL, a bare www. host, or an email address. The trailing character
  class stops before punctuation, because "read https://x.rw/paper." ends in a
  full stop that belongs to the sentence rather than to the address.
*/
const LINKS =
  /(https?:\/\/[^\s<]+[^\s<.,:;"')\]}]|www\.[^\s<]+[^\s<.,:;"')\]}]|[^\s<@]+@[^\s<@]+\.[a-z]{2,})/gi;

export interface Piece {
  text: string;
  href: string | null;
}

/** Splits a message into runs of plain text and runs that are links. */
export function linkPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;

  for (const match of text.matchAll(LINKS)) {
    const found = match[0];
    const start = match.index ?? 0;
    if (start > at) pieces.push({ text: text.slice(at, start), href: null });

    const isEmail = found.includes("@") && !found.includes("/");
    pieces.push({
      text: found,
      href: isEmail
        ? `mailto:${found}`
        : found.startsWith("www.")
          ? `https://${found}`
          : found,
    });
    at = start + found.length;
  }

  if (at < text.length) pieces.push({ text: text.slice(at), href: null });
  return pieces;
}

export function MessageText({
  text,
  mine,
  meId,
}: {
  text: string;
  /** Inside one of your own bubbles the ground is the brand colour. */
  mine?: boolean;
  /**
   * Who is reading. A mention of you is the whole reason mentions exist, and
   * it has to be told apart from a mention of somebody else in the same
   * sentence - otherwise a busy group is a wall of highlights that says
   * nothing about whether any of them wants you.
   */
  meId?: string;
}) {
  /* The stored form carries the person's id so a mention survives a rename.
     A reader must never see it, so the text is split before anything is
     drawn and only the name goes on screen. */
  const parts = splitMentions(text);

  return (
    <p className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed">
      {parts.map((part, p) =>
        part.kind === "mention" ? (
          <span
            key={`m${p}`}
            /* Two weights of highlight. Somebody else being named is
               context; you being named is a thing to answer, so it carries a
               ground of its own rather than only a colour. */
            className={
              part.userId === meId
                ? mine
                  ? "rounded bg-white/25 px-1 font-semibold"
                  : "rounded bg-warning-wash px-1 font-semibold text-warning"
                : mine
                  ? "font-semibold opacity-90"
                  : "font-semibold text-primary"
            }
          >
            {part.text}
          </span>
        ) : (
          <MentionFreeText
            key={`t${p}`}
            text={part.text}
            mine={mine}
          />
        ),
      )}
    </p>
  );
}

/** The stretches between mentions, where links are still made clickable. */
function MentionFreeText({ text, mine }: { text: string; mine?: boolean }) {
  return (
    <>
      {linkPieces(text).map((piece, i) =>
        piece.href ? (
          <a
            key={i}
            href={piece.href}
            target="_blank"
            rel="noopener noreferrer"
            // Underlined rather than only coloured: on the brand ground a
            // colour change alone is not enough of a difference to read as a
            // link, and colour alone never is for anyone who cannot see it.
            className={`underline underline-offset-2 hover:opacity-80 ${
              mine ? "text-on-primary" : "text-primary"
            }`}
          >
            {piece.text}
          </a>
        ) : (
          <Fragment key={i}>{piece.text}</Fragment>
        ),
      )}
    </>
  );
}
