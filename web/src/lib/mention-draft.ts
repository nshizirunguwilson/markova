/**
 * Writing a mention.
 *
 * ── What the person typing sees ────────────────────────────────────────────
 *
 * The wire format is `@[Aline Uwase](<uuid>)`, which is what makes a mention
 * survive a rename and stops it addressing somebody who is not in the room.
 * It is also unreadable, and putting it in the box means somebody watches a
 * uuid appear in the middle of their sentence.
 *
 * So the box holds what they meant - "@Aline Uwase, can you check this" - and
 * the people they actually picked are remembered beside it. The wire format is
 * built at the moment of sending, from the picks rather than from the text.
 *
 * ── Why picks rather than a pattern ────────────────────────────────────────
 *
 * The alternative is to scan the finished text for "@" followed by a name and
 * look each one up. That guesses, and a mention that guesses wrong is worse
 * than no mention: somebody types "@Aline" meaning the Aline in this group,
 * and it resolves to the other one, who now reads a message that was not for
 * them. A pick is unambiguous because a person chose a row.
 *
 * Text that was typed rather than picked stays plain text. That is the safe
 * failure: nobody is notified, and the sender can see they were not offered
 * the name.
 */

/** Somebody who can be mentioned, as the picker lists them. */
export interface Mentionable {
  id: string;
  name: string;
}

/** A mention the writer chose, as opposed to text that merely looks like one. */
export interface Pick {
  /** The exact text put into the box, without the leading at sign. */
  display: string;
  userId: string;
}

/**
 * The mention being typed at the caret, if there is one.
 *
 * A token runs from an "@" to the caret and may hold spaces, because names
 * do: somebody typing "@Aline Uw" is still choosing. It ends at punctuation
 * or a second "@", and it only counts at the start of a word - "aline@markova"
 * is an address, not the beginning of a mention.
 */
export function activeToken(
  text: string,
  caret: number,
): { query: string; from: number } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;

  // Must start a word.
  if (at > 0 && !/\s/.test(before[at - 1])) return null;

  const query = before.slice(at + 1);
  /* Two words is as far as a name search runs. Past that the person is
     writing a sentence and the picker should get out of the way. */
  if (/[\n,.;:!?]/.test(query) || query.split(/\s+/).length > 2) return null;

  return { query, from: at };
}

/** The people worth offering for what has been typed so far. */
export function suggest(
  people: Mentionable[],
  query: string,
  limit = 6,
): Mentionable[] {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice(0, limit);
  /* Matching on any word of the name, so "@uwase" finds Aline Uwase. A
     Rwandan family name is as likely to be typed as a given one. */
  return people
    .filter((p) =>
      p.name
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.startsWith(q)),
    )
    .slice(0, limit);
}

/**
 * The box after somebody picks a name.
 *
 * A trailing space, because the next thing they type is a word rather than
 * more of the name, and every chat system that omits it makes people type it.
 */
export function applyPick(
  text: string,
  caret: number,
  person: Mentionable,
): { text: string; caret: number; pick: Pick } {
  const token = activeToken(text, caret);
  const from = token ? token.from : caret;
  const inserted = `@${person.name} `;
  const next = text.slice(0, from) + inserted + text.slice(caret);
  return {
    text: next,
    caret: from + inserted.length,
    pick: { display: person.name, userId: person.id },
  };
}

/**
 * The message as it goes to the API.
 *
 * Only picks that are still in the text become mentions: somebody who chose
 * a name and then deleted it has not mentioned anybody, and sending the
 * mention anyway would notify a person about a message that does not name
 * them.
 */
export function toWire(text: string, picks: Pick[]): string {
  let out = text;
  /* Longest first, so "@Aline Uwase" is not half-consumed by a pick of
     "@Aline" that happens to be listed before it. */
  const ordered = [...picks].sort((a, b) => b.display.length - a.display.length);
  const used = new Set<string>();

  for (const pick of ordered) {
    if (used.has(pick.userId)) continue;
    const needle = `@${pick.display}`;
    const at = out.indexOf(needle);
    if (at < 0) continue;
    used.add(pick.userId);
    out =
      out.slice(0, at) +
      `@[${pick.display}](${pick.userId})` +
      out.slice(at + needle.length);
  }
  return out;
}

/** Picks whose text is still in the box, so the list does not grow for ever. */
export function stillMentioned(text: string, picks: Pick[]): Pick[] {
  return picks.filter((p) => text.includes(`@${p.display}`));
}

/**
 * A stored message, split into the parts a component draws.
 *
 * The reader sees "@Aline Uwase" highlighted; the id is what decides whether
 * the highlight is the one that means *you*.
 */
export type Part =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; userId: string };

const WIRE = /@\[([^\]]{1,120})\]\(([0-9a-fA-F-]{36})\)/g;

export function splitMentions(content: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of content.matchAll(WIRE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ kind: "text", text: content.slice(last, at) });
    parts.push({ kind: "mention", text: `@${m[1]}`, userId: m[2] });
    last = at + m[0].length;
  }
  if (last < content.length) {
    parts.push({ kind: "text", text: content.slice(last) });
  }
  return parts;
}
