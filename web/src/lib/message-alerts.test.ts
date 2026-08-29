import { describe, expect, it } from "vitest";

import {
  alertBody,
  alertTitle,
  shouldAnnounce,
  type IncomingMessage,
} from "./message-alerts";

const arriving = (over: Partial<IncomingMessage> = {}): IncomingMessage => ({
  id: "m-1",
  conversationId: "conv-1",
  content: "Muraho neza",
  contentType: "TEXT",
  senderUserId: "u-3",
  sender: { firstName: "Aline", lastName: "Uwase" },
  ...over,
});

/**
 * A message that arrives while a teacher is entering marks is invisible: the
 * thread updates on a page nobody is looking at.
 */
describe("whether to say a message arrived", () => {
  it("says so when the person is elsewhere in the system", () => {
    expect(
      shouldAnnounce({
        message: arriving(),
        myUserId: "u-1",
        pathname: "/teacher/marks",
      }),
    ).toBe(true);
  });

  /*
    Nothing at all on the chat page, whichever thread is open. The inbox on
    the left already moves the conversation to the top, bolds it and counts
    it; a notice saying the same thing is the app telling you something you
    are looking straight at.
  */
  it("says nothing anywhere on the chat page", () => {
    expect(
      shouldAnnounce({
        message: arriving(),
        myUserId: "u-1",
        pathname: "/messages",
      }),
    ).toBe(false);
  });

  it("says nothing even for a thread you do not have open", () => {
    expect(
      shouldAnnounce({
        message: arriving({ conversationId: "conv-2" }),
        myUserId: "u-1",
        pathname: "/messages",
      }),
    ).toBe(false);
  });

  it("says nothing on a role-prefixed chat page either", () => {
    expect(
      shouldAnnounce({
        message: arriving(),
        myUserId: "u-1",
        pathname: "/admin/messages",
      }),
    ).toBe(false);
  });

  it("never says so for your own message", () => {
    expect(
      shouldAnnounce({
        message: arriving({ senderUserId: "u-1" }),
        myUserId: "u-1",
        pathname: "/teacher/marks",
      }),
    ).toBe(false);
  });

  /**
   * `sender.id` is not always on the socket payload; `senderUserId` always
   * is. Reading the wrong one made every message look like somebody else's,
   * including your own.
   */
  it("knows your own message even when the sender carries no id", () => {
    expect(
      shouldAnnounce({
        message: {
          id: "m-1",
          conversationId: "conv-1",
          senderUserId: "u-1",
          sender: { firstName: "You" },
        },
        myUserId: "u-1",
        pathname: "/admin",
      }),
    ).toBe(false);
  });

  it("says nothing about a message with no id, which is not a message", () => {
    expect(
      shouldAnnounce({ message: {}, myUserId: "u-1", pathname: "/admin" }),
    ).toBe(false);
  });

  // `sender.id` is what the REST payload carries; the socket sends
  // `senderUserId`. Both have to be read, or a message from one route looks
  // like somebody else's.
  it("reads the sender id off either shape", () => {
    expect(
      shouldAnnounce({
        message: { id: "m-1", conversationId: "c", sender: { id: "u-1" } },
        myUserId: "u-1",
        pathname: "/admin",
      }),
    ).toBe(false);
  });

  it("says so on a page with no path at all", () => {
    expect(shouldAnnounce({ message: arriving(), myUserId: "u-1" })).toBe(true);
  });

  it("copes with not knowing who you are yet", () => {
    expect(
      shouldAnnounce({ message: arriving(), pathname: "/admin" }),
    ).toBe(true);
  });
});

describe("what the notice says", () => {
  it("names who it is from", () => {
    expect(alertTitle(arriving())).toBe("Aline Uwase");
  });

  it("says something honest when the account has lost its name", () => {
    expect(alertTitle(arriving({ sender: null }))).toBe("New message");
    expect(alertTitle(arriving({ sender: { firstName: null, lastName: null } }))).toBe(
      "New message",
    );
  });

  it("names somebody who has only half a name", () => {
    expect(alertTitle(arriving({ sender: { firstName: "Aline" } }))).toBe("Aline");
  });

  /**
   * A notice is read by whoever is looking at the screen, which in a school
   * is not always the person the message is for - a laptop on a desk in a
   * staff room, a screen shared in a meeting, a phone handed to a child. A
   * message about a child's discipline record has no business appearing in
   * the corner of any of them.
   */
  it("says only that a message arrived", () => {
    expect(alertBody()).toBe("sent a message");
  });

  it("gives nothing away, whatever the message held", () => {
    const secrets = [
      arriving({ content: "Divine is being suspended on Monday" }),
      arriving({ contentType: "FILE", content: "Term 1 marks.pdf" }),
      arriving({ contentType: "VOICE", content: "voice-note-1.weba" }),
    ];
    for (const message of secrets) {
      expect(alertBody()).not.toContain(message.content!.slice(0, 8));
    }
  });
});
