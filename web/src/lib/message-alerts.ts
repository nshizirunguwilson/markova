/**
 * Being told about a message while you are somewhere else in the system.
 *
 * A message that arrives while a teacher is entering marks is invisible: the
 * thread updates on a page nobody is looking at. So there are three levels,
 * quietest first, and they are deliberately in that order:
 *
 *   1. a count beside Messages in the sidebar, always
 *   2. a notice in the corner, when the message is new to you and you are not
 *      already looking at the thread it belongs to
 *   3. a notification from the browser itself, only if the person asked for
 *      one, and only when the tab is not the one they are looking at
 *
 * Nothing here interrupts. There is no sound added: a school office with
 * thirty tabs open does not need thirty beeps, and anyone who wants one has
 * their browser's own notification sound at level three.
 */

export interface IncomingMessage {
  id?: string;
  conversationId?: string;
  content?: string | null;
  contentType?: string | null;
  senderUserId?: string | null;
  sender?: {
    id?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

/**
 * Should this message put a notice on the screen?
 *
 * No for your own messages, which you just sent. No while you are looking at
 * the very thread it landed in, where you can already see it — a notice for a
 * message visible two inches away is noise, and it is the thing that makes
 * people turn notifications off altogether.
 */
export function shouldAnnounce({
  message,
  myUserId,
  pathname,
  openConversationId,
}: {
  message: IncomingMessage;
  myUserId?: string | null;
  /** Where in the app the person currently is. */
  pathname?: string | null;
  /** The thread open on screen, when one is. */
  openConversationId?: string | null;
}): boolean {
  if (!message?.id) return false;

  // `sender.id` is not always present on the socket payload; `senderUserId`
  // always is. Reading the wrong one meant every message looked like
  // somebody else's, including your own.
  const from = message.senderUserId ?? message.sender?.id ?? null;
  if (myUserId && from === myUserId) return false;

  const onMessages = (pathname ?? "").includes("/messages");
  if (onMessages && openConversationId === message.conversationId) return false;

  return true;
}

/** Who it is from. */
export function alertTitle(message: IncomingMessage): string {
  const name = `${message.sender?.firstName ?? ""} ${
    message.sender?.lastName ?? ""
  }`.trim();
  return name || "New message";
}

/**
 * What it says, short enough for a corner of the screen.
 *
 * A file says what kind of thing it is rather than its stored name: "Photo"
 * tells somebody more at a glance than "a1b2c3.jpg" does.
 */
export function alertBody(message: IncomingMessage, limit = 90): string {
  const kind = message.contentType ?? "TEXT";
  if (kind === "VOICE") return "Voice note";

  const text = (message.content ?? "").trim();
  if (kind === "FILE") return text || "Attachment";
  if (!text) return "New message";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
