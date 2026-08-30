/**
 * Mentioning somebody in a conversation.
 *
 * ── How a mention is decided ────────────────────────────────────────────────
 *
 * The obvious approach is to look for `@word` when a message is drawn, and it
 * is wrong in four ways that all show up in a real school within a week:
 *
 *   "email me @ 5pm" becomes a mention of nobody.
 *   Two teachers called Aline make "@Aline" mean neither of them.
 *   A person who marries and changes their name breaks every mention of them.
 *   "@Aline" typed in a group Aline is not in looks sent and notifies no one,
 *   and the sender has no way to tell.
 *
 * So a mention is decided when it is *written*, not when it is read. The
 * composer offers the people actually in the conversation, and choosing one
 * stores a reference to their id. Every chat system that has survived contact
 * with users works this way, and this is why.
 *
 * ── What is stored ─────────────────────────────────────────────────────────
 *
 * The content carries `@[Aline Uwase](<user id>)`, and a row per mention is
 * written beside it. Both, deliberately:
 *
 *   The markup keeps the message readable on its own. A push notification, a
 *   plain-text export, or a client that knows nothing about mentions still
 *   shows "@Aline Uwase, can you check this" rather than a dangling id.
 *
 *   The rows are what answers "was I mentioned", and what a notification is
 *   built from. Searching message text with LIKE for an id would be both slow
 *   and wrong - it would match somebody quoting an id in a sentence.
 *
 * They cannot drift, because the rows are derived from the content in the
 * same transaction that stores it.
 *
 * ── Where mentions work ────────────────────────────────────────────────────
 *
 * Groups and broadcasts only. In a conversation between two people there is
 * exactly one person a message could be directed at, so a mention carries no
 * information and would only add a notification for something already read.
 */

/** `@[Display Name](uuid)`. The name is for reading; the id is the mention. */
const MENTION = /@\[([^\]]{1,120})\]\(([0-9a-fA-F-]{36})\)/g;

/**
 * Everyone in the room.
 *
 * Worth having: "@everyone" in a class group is the single most useful thing
 * a class teacher types all term. Also the classic way to make a system
 * people mute, which is why sending it is a permission rather than a
 * capability - see `refuseMention`.
 */
export const EVERYONE = '@everyone';
const EVERYONE_PATTERN = /(^|\s)@everyone\b/;

export interface ParsedMention {
  userId: string;
  /** The name as it was written, kept for what the message reads like. */
  display: string;
}

/** Who this message names, in the order they appear, without repeats. */
export function parseMentions(content: string): ParsedMention[] {
  const seen = new Set<string>();
  const found: ParsedMention[] = [];
  for (const match of content.matchAll(MENTION)) {
    const userId = match[2].toLowerCase();
    if (seen.has(userId)) continue;
    seen.add(userId);
    found.push({ userId, display: match[1] });
  }
  return found;
}

/** Whether this message addresses the whole room. */
export function mentionsEveryone(content: string): boolean {
  return EVERYONE_PATTERN.test(content);
}

/**
 * The message as a person reads it, with the markup taken out.
 *
 * Used for the line under a conversation in the inbox, for a push
 * notification, and anywhere else the text appears without a component to
 * render it - none of which should show a uuid.
 */
export function plainText(content: string): string {
  return content.replace(MENTION, '@$1');
}

export type MentionRefusal =
  | 'NOT_A_GROUP'
  | 'NOT_A_PARTICIPANT'
  | 'EVERYONE_NEEDS_ADMIN'
  | null;

/**
 * Why this message's mentions cannot be sent, or null when they can.
 *
 * Refusing rather than quietly dropping them. A mention that is silently
 * turned into plain text is the failure this whole design exists to prevent:
 * the sender believes somebody was told and nobody was.
 */
export function refuseMention(
  content: string,
  context: {
    conversationType: 'ONE_ON_ONE' | 'GROUP' | 'BROADCAST';
    /** Everybody in the room, including the sender. */
    participantIds: string[];
    senderIsAdmin: boolean;
  },
): MentionRefusal {
  const named = parseMentions(content);
  const everyone = mentionsEveryone(content);
  if (!named.length && !everyone) return null;

  if (context.conversationType === 'ONE_ON_ONE') return 'NOT_A_GROUP';

  if (everyone && !context.senderIsAdmin) return 'EVERYONE_NEEDS_ADMIN';

  /*
    A mention of somebody who is not in the room would notify them about a
    conversation they cannot open - which is both a dead end for them and a
    way to tell somebody a private group exists.
  */
  const inRoom = new Set(context.participantIds.map((id) => id.toLowerCase()));
  if (named.some((m) => !inRoom.has(m.userId))) return 'NOT_A_PARTICIPANT';

  return null;
}

/** What to tell the sender, in words that say which choice to change. */
export const MENTION_REFUSAL: Record<
  Exclude<MentionRefusal, null>,
  string
> = {
  NOT_A_GROUP:
    'Mentions only work in groups and broadcasts. In a direct message there is only one person to address.',
  NOT_A_PARTICIPANT:
    'You have mentioned somebody who is not in this conversation. Add them first, or take the mention out.',
  EVERYONE_NEEDS_ADMIN:
    'Only an administrator of this conversation can notify everybody at once.',
};

/**
 * Who a message should notify, given who is in the room.
 *
 * The sender is never notified of their own message, which is the one case
 * everybody hits within a minute of shipping a mention feature.
 */
export function whoToNotify(
  content: string,
  context: { participantIds: string[]; senderId: string },
): string[] {
  const everyone = mentionsEveryone(content);
  const ids = everyone
    ? context.participantIds
    : parseMentions(content).map((m) => m.userId);

  const room = new Map(
    context.participantIds.map((id) => [id.toLowerCase(), id]),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const real = room.get(id.toLowerCase());
    if (!real || real === context.senderId || seen.has(real)) continue;
    seen.add(real);
    out.push(real);
  }
  return out;
}
