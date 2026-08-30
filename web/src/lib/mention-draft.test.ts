import { describe, expect, it } from "vitest";
import {
  activeToken,
  applyPick,
  plainText,
  splitMentions,
  stillMentioned,
  suggest,
  toWire,
  type Pick,
} from "./mention-draft";

/**
 * Writing a mention.
 *
 * The box holds what a person meant - "@Aline Uwase, can you check this" -
 * and the people they picked are remembered beside it. The wire format is
 * built at the moment of sending, from the picks rather than from the text,
 * because text that was typed rather than chosen is ambiguous and a mention
 * that guesses wrong is worse than no mention at all.
 */

const ALINE = "11111111-1111-1111-1111-111111111111";
const JEAN = "22222222-2222-2222-2222-222222222222";

const people = [
  { id: ALINE, name: "Aline Uwase" },
  { id: JEAN, name: "Jean Bosco Habimana" },
  { id: "33333333-3333-3333-3333-333333333333", name: "Rose Mukamana" },
];

describe("the mention being typed", () => {
  it("starts at an at sign", () => {
    expect(activeToken("hello @al", 9)).toEqual({ query: "al", from: 6 });
  });

  it("is there the moment the at sign is typed", () => {
    expect(activeToken("hello @", 7)).toEqual({ query: "", from: 6 });
  });

  it("starts one at the very beginning of a message", () => {
    expect(activeToken("@al", 3)).toEqual({ query: "al", from: 0 });
  });

  /* Names have spaces in them, so somebody typing "@Aline Uw" is still
     choosing rather than writing a sentence. */
  it("survives a space, because names have them", () => {
    expect(activeToken("@Aline Uw", 9)?.query).toBe("Aline Uw");
  });

  /* Past two words they are writing a sentence, and the picker should get
     out of the way rather than hover over the rest of the message. */
  it("gives up once it stops looking like a name", () => {
    expect(activeToken("@Aline can you check this", 25)).toBeNull();
  });

  it("ends at punctuation", () => {
    expect(activeToken("@Aline, thanks", 14)).toBeNull();
  });

  // "aline@markova.edu" is an address, not the start of a mention.
  it("is not started by an at sign inside a word", () => {
    expect(activeToken("aline@markova", 13)).toBeNull();
  });

  it("is nothing where there is no at sign at all", () => {
    expect(activeToken("hello there", 11)).toBeNull();
  });

  // What is after the caret is not being typed yet.
  it("reads up to the caret rather than the whole box", () => {
    expect(activeToken("@al and more", 3)?.query).toBe("al");
  });
});

describe("who to offer", () => {
  it("offers everybody before anything is typed", () => {
    expect(suggest(people, "")).toHaveLength(3);
  });

  it("narrows on a given name", () => {
    expect(suggest(people, "ali").map((p) => p.name)).toEqual(["Aline Uwase"]);
  });

  /* A Rwandan family name is as likely to be typed as a given one, so any
     word of the name matches. */
  it("narrows on a family name too", () => {
    expect(suggest(people, "uwase").map((p) => p.name)).toEqual([
      "Aline Uwase",
    ]);
  });

  it("ignores the case somebody typed in", () => {
    expect(suggest(people, "ALINE")).toHaveLength(1);
  });

  it("offers nobody where nobody matches", () => {
    expect(suggest(people, "zzz")).toEqual([]);
  });

  // A group of two hundred parents would otherwise fill the screen.
  it("never offers more than a list somebody can read", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `id-${i}`,
      name: `Person ${i}`,
    }));
    expect(suggest(many, "")).toHaveLength(6);
  });
});

describe("picking somebody", () => {
  it("puts their name in the box, not their id", () => {
    const out = applyPick("hello @al", 9, people[0]);
    expect(out.text).toBe("hello @Aline Uwase ");
    expect(out.text).not.toContain(ALINE);
  });

  /* The next thing typed is a word rather than more of the name, and every
     chat system that omits this makes people type the space. */
  it("leaves a space after it", () => {
    expect(applyPick("@al", 3, people[0]).text.endsWith(" ")).toBe(true);
  });

  it("puts the caret after what it inserted", () => {
    const out = applyPick("hello @al", 9, people[0]);
    expect(out.caret).toBe(out.text.length);
  });

  it("keeps what came after the caret", () => {
    const out = applyPick("@al please", 3, people[0]);
    expect(out.text).toBe("@Aline Uwase  please");
  });

  it("remembers who was chosen", () => {
    expect(applyPick("@al", 3, people[0]).pick).toEqual({
      display: "Aline Uwase",
      userId: ALINE,
    });
  });
});

/**
 * What goes to the API. Only picks still present in the text become mentions:
 * somebody who chose a name and then deleted it has not mentioned anybody.
 */
describe("the message as it is sent", () => {
  const picked: Pick[] = [
    { display: "Aline Uwase", userId: ALINE },
    { display: "Jean Bosco Habimana", userId: JEAN },
  ];

  it("turns a chosen name into the wire format", () => {
    expect(toWire("@Aline Uwase can you check", picked)).toBe(
      `@[Aline Uwase](${ALINE}) can you check`,
    );
  });

  it("turns several", () => {
    const out = toWire("@Aline Uwase and @Jean Bosco Habimana", picked);
    expect(out).toContain(`@[Aline Uwase](${ALINE})`);
    expect(out).toContain(`@[Jean Bosco Habimana](${JEAN})`);
  });

  /**
   * The safe failure. Somebody who typed a name rather than choosing it is
   * not offering an unambiguous person, and guessing wrong sends a message
   * to somebody it was not for.
   */
  it("leaves a name that was typed rather than chosen as plain text", () => {
    expect(toWire("@Aline Uwase hello", [])).toBe("@Aline Uwase hello");
  });

  it("drops a pick whose name was deleted again", () => {
    expect(toWire("never mind", picked)).toBe("never mind");
  });

  /* Longest first, so "@Aline Uwase" is not half-consumed by a pick of
     "@Aline" that happened to be listed before it. */
  it("prefers the longer name where one contains the other", () => {
    const both: Pick[] = [
      { display: "Aline", userId: JEAN },
      { display: "Aline Uwase", userId: ALINE },
    ];
    expect(toWire("@Aline Uwase hello", both)).toBe(
      `@[Aline Uwase](${ALINE}) hello`,
    );
  });

  it("leaves an ordinary message alone", () => {
    expect(toWire("bring your books", picked)).toBe("bring your books");
  });
});

describe("keeping the picks tidy", () => {
  const picked: Pick[] = [
    { display: "Aline Uwase", userId: ALINE },
    { display: "Jean Bosco Habimana", userId: JEAN },
  ];

  it("keeps the ones still written", () => {
    expect(stillMentioned("@Aline Uwase hello", picked)).toEqual([picked[0]]);
  });

  it("drops the ones deleted", () => {
    expect(stillMentioned("hello", picked)).toEqual([]);
  });
});

/**
 * Anywhere the text appears without a component to draw it: the inbox line
 * under a conversation, a notification, a search result. This is where the
 * uuid actually leaked - the inbox preview rendered raw content and showed
 * one in the middle of a sentence.
 */
describe("the message where there is nothing to render it", () => {
  it("shows the name and hides the id", () => {
    expect(plainText(`@[Aline Uwase](${ALINE}) can you check`)).toBe(
      "@Aline Uwase can you check",
    );
  });

  it("does the same for several in one message", () => {
    expect(
      plainText(`@[Aline Uwase](${ALINE}) and @[Jean Bosco](${JEAN}) please`),
    ).toBe("@Aline Uwase and @Jean Bosco please");
  });

  /* The pattern is global, and a shared instance keeps its `lastIndex`
     between calls - so the second call would skip the first match. */
  it("gives the same answer every time it is asked", () => {
    const text = `@[Aline Uwase](${ALINE}) hello`;
    expect(plainText(text)).toBe(plainText(text));
  });

  it("leaves an ordinary message alone", () => {
    expect(plainText("bring your books")).toBe("bring your books");
  });
});

/**
 * Reading one back. The reader sees "@Aline Uwase" highlighted; the id is
 * what decides whether the highlight is the one that means you.
 */
describe("drawing a message that names somebody", () => {
  it("splits the mention out of the text around it", () => {
    expect(
      splitMentions(`hi @[Aline Uwase](${ALINE}) please check`),
    ).toEqual([
      { kind: "text", text: "hi " },
      { kind: "mention", text: "@Aline Uwase", userId: ALINE },
      { kind: "text", text: " please check" },
    ]);
  });

  it("carries the id, so a reader can be told when it is them", () => {
    const [mention] = splitMentions(`@[Aline Uwase](${ALINE})`);
    expect(mention).toEqual({
      kind: "mention",
      text: "@Aline Uwase",
      userId: ALINE,
    });
  });

  it("handles a message that is nothing but a mention", () => {
    expect(splitMentions(`@[Aline Uwase](${ALINE})`)).toHaveLength(1);
  });

  it("leaves an ordinary message as one piece of text", () => {
    expect(splitMentions("bring your books")).toEqual([
      { kind: "text", text: "bring your books" },
    ]);
  });

  it("never shows a uuid to a reader", () => {
    const drawn = splitMentions(`hi @[Aline Uwase](${ALINE})`)
      .map((p) => p.text)
      .join("");
    expect(drawn).not.toContain(ALINE);
    expect(drawn).toBe("hi @Aline Uwase");
  });

  it("copes with an empty message", () => {
    expect(splitMentions("")).toEqual([]);
  });

  // Same reason as above: a shared global regex would skip a match.
  it("splits the same message the same way twice", () => {
    const text = `hi @[Aline Uwase](${ALINE})`;
    expect(splitMentions(text)).toEqual(splitMentions(text));
  });
});
