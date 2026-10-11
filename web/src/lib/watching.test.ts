import { describe, expect, it } from "vitest";
import {
  isWatching,
  listOfNames,
  talkersOf,
  watchNotice,
  watchersOf,
} from "./watching";

const teacher = { id: "t", firstName: "Aline", lastName: "Uwase" };
const student = { id: "s", firstName: "Keza", lastName: "Habimana" };
const matron = { id: "m", firstName: "Beatrice", lastName: "Mukamana" };
const patron = { id: "p", firstName: "Emmanuel", lastName: "Habimana" };

const watched = {
  participants: [
    { user: teacher },
    { user: student },
    { user: matron, watching: true },
    { user: patron, watching: true },
  ],
};
const plain = { participants: [{ user: teacher }, { user: student }] };

describe("listOfNames", () => {
  it("reads like a sentence", () => {
    expect(listOfNames([])).toBe("");
    expect(listOfNames(["A"])).toBe("A");
    expect(listOfNames(["A", "B"])).toBe("A and B");
    expect(listOfNames(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("who watches over a chat", () => {
  it("finds the people watching", () => {
    expect(watchersOf(watched).map((u) => u.id)).toEqual(["m", "p"]);
    expect(watchersOf(plain)).toEqual([]);
    expect(watchersOf({})).toEqual([]);
  });

  it("knows when the reader is one of them", () => {
    expect(isWatching(watched, "m")).toBe(true);
    expect(isWatching(watched, "t")).toBe(false);
    expect(isWatching(watched, null)).toBe(false);
  });

  it("leaves the watchers and the reader out of who is talking", () => {
    expect(talkersOf(watched, "t").map((u) => u.id)).toEqual(["s"]);
    expect(talkersOf(watched, "m").map((u) => u.id)).toEqual(["t", "s"]);
  });
});

describe("watchNotice", () => {
  it("says nothing in a chat nobody watches", () => {
    expect(watchNotice(plain, "t")).toBeNull();
  });

  it("names the people watching, to the people talking", () => {
    expect(watchNotice(watched, "s")).toBe(
      "Beatrice Mukamana and Emmanuel Habimana are watching over this chat. Every chat between staff and a student is, so that no child is ever alone with an adult.",
    );
  });

  it("says is for one person", () => {
    const one = { participants: [{ user: teacher }, { user: matron, watching: true }] };
    expect(watchNotice(one, "t")).toMatch(/^Beatrice Mukamana is watching/);
  });

  it("tells a watcher that everyone can see them", () => {
    expect(watchNotice(watched, "p")).toMatch(/^You watch over this chat/);
  });
});
