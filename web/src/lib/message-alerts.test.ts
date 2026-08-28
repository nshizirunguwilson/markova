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

  // A notice for a message visible two inches away is noise, and it is the
  // thing that makes people turn notifications off altogether.
  it("says nothing while you are looking at that very thread", () => {
    expect(
      shouldAnnounce({
        message: arriving(),
        myUserId: "u-1",
        pathname: "/messages",
        openConversationId: "conv-1",
      }),
    ).toBe(false);
  });

  it("still says so for a different thread on the chat page", () => {
    expect(
      shouldAnnounce({
        message: arriving({ conversationId: "conv-2" }),
        myUserId: "u-1",
        pathname: "/messages",
        openConversationId: "conv-1",
      }),
    ).toBe(true);
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

  it("repeats a short message in full", () => {
    expect(alertBody(arriving())).toBe("Muraho neza");
  });

  it("cuts a long one to fit a corner of the screen", () => {
    const body = alertBody(arriving({ content: "a".repeat(200) }), 30);
    expect(body).toHaveLength(30);
    expect(body.endsWith("…")).toBe(true);
  });

  // "Voice note" tells somebody more at a glance than a stored filename does.
  it("says what a voice note is rather than naming the file", () => {
    expect(
      alertBody(arriving({ contentType: "VOICE", content: "voice-note-1.weba" })),
    ).toBe("Voice note");
  });

  it("names an attachment by what the sender called it", () => {
    expect(
      alertBody(arriving({ contentType: "FILE", content: "Term 1 marks.pdf" })),
    ).toBe("Term 1 marks.pdf");
  });

  it("says something rather than nothing for an empty message", () => {
    expect(alertBody(arriving({ content: "" }))).toBe("New message");
    expect(alertBody(arriving({ content: null }))).toBe("New message");
  });

  // A message with no kind at all is words, which is what the API defaults to.
  it("treats a message with no stated kind as words", () => {
    expect(alertBody(arriving({ contentType: null }))).toBe("Muraho neza");
  });

  it("falls back to the word Attachment for a file with no name", () => {
    expect(alertBody(arriving({ contentType: "FILE", content: "" }))).toBe(
      "Attachment",
    );
  });
});
