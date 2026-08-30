import { plainText as plainMentions } from "./mention-draft";
/**
 * How long ago someone was last online, in words.
 *
 * Relative time is a classic place for off-by-one bugs, and this one is read by
 * a parent deciding whether a teacher is likely to reply now or tomorrow. Lives
 * here rather than inside the messages page so it can be checked at each
 * boundary without standing up a chat screen.
 */
export function formatLastSeen(date: string | null | undefined, now: Date = new Date()): string {
  if (!date) return "offline";

  const seen = new Date(date);
  if (Number.isNaN(seen.getTime())) return "offline";

  const diffMin = Math.floor((now.getTime() - seen.getTime()) / 60000);

  // A clock that is slightly behind the server should not read as the future.
  if (diffMin < 1) return "last seen just now";
  if (diffMin < 60) return `last seen ${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `last seen ${diffHr}h ago`;

  return `last seen ${seen.toLocaleDateString()}`;
}

export type DeliveryStatus = "SENT" | "DELIVERED" | "READ";

/**
 * What a message of this status says about itself.
 *
 * Words rather than ticks. One tick against two, and two grey against two
 * blue, is a convention people learn from one particular app and then argue
 * about - a parent looking at a message to the school should not have to know
 * it. An unknown status reads as "Sent", which is the one thing that is
 * certainly true of a message that exists.
 */
export function deliveryLabel(status: string | undefined): "Sent" | "Delivered" | "Read" {
  if (status === "READ") return "Read";
  if (status === "DELIVERED") return "Delivered";
  return "Sent";
}

/**
 * Who sent the last message in a thread, as the inbox line labels it.
 *
 * The viewer reads as "You", because seeing your own name quoted back at you
 * in your own inbox is a small but constant jar - every other messaging app
 * says "You". Anyone else is named, which is what makes a group thread
 * readable at a glance.
 *
 * The id to compare is `senderUserId`. `sender` is a two-field projection of
 * the user - `{ firstName, lastName }` and nothing else - so reading an id off
 * it silently compares undefined and every message ends up attributed by name.
 * Checked against a live `GET /messaging/conversations`.
 */
export function lastMessagePrefix(
  message:
    | {
        senderUserId?: string | null;
        sender?: { firstName?: string | null } | null;
      }
    | null
    | undefined,
  viewerId: string | undefined,
): string {
  if (!message) return "Someone: ";
  if (viewerId && message.senderUserId === viewerId) return "You: ";
  const name = message.sender?.firstName?.trim();
  return `${name || "Someone"}: `;
}

/**
 * What a message reads as in a one-line preview.
 *
 * A voice note is stored under the name it was recorded as -
 * `voice-note-2026-08-29-05-47-12.weba` - which is a filename, not a
 * sentence. In the inbox it filled the line and told nobody anything; the
 * only useful thing to say is that it is a voice message.
 *
 * Files keep their own names, because "Term 1 marks.pdf" is exactly what a
 * person needs to see there.
 */
export function messagePreview(
  message:
    | { content?: string | null; contentType?: string | null }
    | null
    | undefined,
): string {
  if (!message) return "";
  if (message.contentType === "VOICE") return "Voice message";
  /* Mentions are stored with the person's id beside the name, so a mention
     survives a rename. The id is machinery: this line is read by a person,
     and it shows "@Aline Uwase" rather than a uuid in the middle of a
     sentence. */
  return plainMentions(message.content ?? "");
}
