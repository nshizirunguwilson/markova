/**
 * Turning a flat list of messages into the shape a thread is read in.
 *
 * A thread is not a list of equal rows. People send three messages in a row
 * and mean them as one remark, and a message from Tuesday is a different
 * thing from one sent a minute ago. Repeating the sender's name and the clock
 * on every bubble gives the least important information the same rhythm as
 * the words, which is what makes a chat look like a log file.
 */

/** Messages closer together than this, from one person, read as one remark. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface ViewMessage {
  id: string;
  senderUserId?: string | null;
  createdAt: string;
  sender?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
  [key: string]: unknown;
}

export interface MessageGroup {
  /** Stable across renders: the first message's id. */
  key: string;
  senderId: string | null;
  senderName: string;
  /** Was this sent by the person reading it? */
  mine: boolean;
  messages: ViewMessage[];
}

export interface ThreadBlock {
  /** The day these groups were sent, as it should be labelled. */
  day: string;
  key: string;
  groups: MessageGroup[];
}

/** The id of whoever sent a message, from whichever field carries it. */
export function senderIdOf(message: ViewMessage): string | null {
  return message.senderUserId ?? message.sender?.id ?? null;
}

function displayName(message: ViewMessage): string {
  const first = message.sender?.firstName?.trim() ?? "";
  const last = message.sender?.lastName?.trim() ?? "";
  return `${first} ${last}`.trim() || "Someone";
}

/**
 * "Today", "Yesterday", or the date written out.
 *
 * Compared by calendar day rather than by elapsed hours: something sent at
 * 11pm is "Yesterday" at 1am, not "2 hours ago".
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(date)) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** The clock time on a message, without the date. */
export function clockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Split a chronological thread into days, and each day into runs by one
 * person. A run breaks when the sender changes or when the gap since the
 * previous message is long enough that the two are separate thoughts.
 */
export function groupThread(
  messages: ViewMessage[],
  viewerId: string | undefined,
  now: Date = new Date(),
): ThreadBlock[] {
  const blocks: ThreadBlock[] = [];

  for (const message of messages) {
    const day = dayLabel(message.createdAt, now);
    const senderId = senderIdOf(message);
    const sentAt = new Date(message.createdAt).getTime();

    let block = blocks[blocks.length - 1];
    if (!block || block.day !== day) {
      block = { day, key: `${day}-${message.id}`, groups: [] };
      blocks.push(block);
    }

    const group = block.groups[block.groups.length - 1];
    const last = group?.messages[group.messages.length - 1];
    const withinWindow =
      last !== undefined &&
      Math.abs(sentAt - new Date(last.createdAt).getTime()) <= GROUP_WINDOW_MS;

    if (group && group.senderId === senderId && withinWindow) {
      group.messages.push(message);
    } else {
      block.groups.push({
        key: message.id,
        senderId,
        senderName: displayName(message),
        mine: senderId !== null && senderId === viewerId,
        messages: [message],
      });
    }
  }

  return blocks;
}
