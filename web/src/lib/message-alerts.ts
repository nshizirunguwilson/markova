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
 * No for your own messages, which you just sent. And no anywhere on the chat
 * page at all - not merely in the thread it landed in.
 *
 * That is wider than it first looks, and deliberately so: on the chat page
 * the inbox on the left already moves the conversation to the top, bolds it
 * and counts it. A notice in the corner saying the same thing is the app
 * telling you something you are looking straight at, and that is what makes
 * people turn notifications off for good.
 */
export function shouldAnnounce({
  message,
  myUserId,
  pathname,
}: {
  message: IncomingMessage;
  myUserId?: string | null;
  /** Where in the app the person currently is. */
  pathname?: string | null;
}): boolean {
  if (!message?.id) return false;

  // `sender.id` is not always present on the socket payload; `senderUserId`
  // always is. Reading the wrong one meant every message looked like
  // somebody else's, including your own.
  const from = message.senderUserId ?? message.sender?.id ?? null;
  if (myUserId && from === myUserId) return false;

  // Anywhere under the chat page, whichever thread happens to be open.
  return !(pathname ?? "").includes("/messages");
}

/** Who it is from. */
export function alertTitle(message: IncomingMessage): string {
  const name = `${message.sender?.firstName ?? ""} ${
    message.sender?.lastName ?? ""
  }`.trim();
  return name || "New message";
}

/**
 * What it says: that a message arrived, and nothing about what is in it.
 *
 * A notice is read by whoever is looking at the screen, which in a school is
 * not always the person the message is for - a laptop on a desk in a staff
 * room, a screen shared in a meeting, a parent's phone handed to a child. A
 * message about a child's discipline record or a parent's fees has no
 * business appearing in the corner of any of them.
 *
 * The name is enough to decide whether to open it, and opening it is one
 * click away. Anything more is detail the notice does not need to carry.
 */
export function alertBody(): string {
  return "sent a message";
}
