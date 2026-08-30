import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { MessageText, linkPieces } from "./message-text";

describe("finding links in a message", () => {
  it("finds a full URL", () => {
    const pieces = linkPieces("See https://markova.edu/papers for the paper");
    expect(pieces.find((p) => p.href)?.href).toBe("https://markova.edu/papers");
  });

  it("gives a bare www. address a scheme, so the link works", () => {
    expect(linkPieces("go to www.markova.edu")[1].href).toBe(
      "https://www.markova.edu",
    );
  });

  it("turns an email address into a mailto", () => {
    expect(linkPieces("write to a.uwase@markova.edu")[1].href).toBe(
      "mailto:a.uwase@markova.edu",
    );
  });

  /**
   * Detection is narrow on purpose. A greedy matcher turns "9.30am" into a
   * link to a domain that does not exist, and a message full of false links
   * is worse than one with none.
   */
  it("leaves a time alone", () => {
    expect(linkPieces("See you at 9.30am").every((p) => !p.href)).toBe(true);
  });

  it("leaves an ordinary sentence alone", () => {
    expect(linkPieces("Muraho neza").every((p) => !p.href)).toBe(true);
  });

  // The full stop belongs to the sentence, not to the address.
  it("stops before the punctuation that ends the sentence", () => {
    expect(linkPieces("Read https://markova.edu/x.")[1].href).toBe(
      "https://markova.edu/x",
    );
  });

  it("keeps the text either side, in order", () => {
    const pieces = linkPieces("go to https://markova.edu now");
    expect(pieces.map((p) => p.text).join("")).toBe(
      "go to https://markova.edu now",
    );
  });

  // A message that is nothing but a link has no text either side of it.
  it("copes with a message that is only a link", () => {
    const pieces = linkPieces("https://markova.edu");
    expect(pieces).toHaveLength(1);
    expect(pieces[0].href).toBe("https://markova.edu");
  });

  it("finds several links in one message", () => {
    const pieces = linkPieces("https://a.rw and https://b.rw");
    expect(pieces.filter((p) => p.href)).toHaveLength(2);
  });
});

describe("a message with a link in it", () => {
  it("renders the link as a link", () => {
    render(<MessageText text="See https://markova.edu/papers" />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://markova.edu/papers",
    );
  });

  // A page somebody in the school was sent must not be able to reach back
  // into the tab that opened it.
  it("opens it safely in a new tab", () => {
    render(<MessageText text="https://markova.edu" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("renders plain words as plain words", () => {
    render(<MessageText text="Muraho neza" />);
    expect(screen.getByText("Muraho neza")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  // Colour alone is not a difference anybody can rely on, and on the brand
  // ground it is barely a difference at all.
  it("underlines a link rather than only colouring it", () => {
    render(<MessageText text="https://markova.edu" mine />);
    expect(screen.getByRole("link").className).toContain("underline");
  });
});

/**
 * A message that names somebody.
 *
 * The stored form carries the person's id so a mention survives a rename; a
 * reader must never see it. And a mention of *you* has to be told apart from
 * a mention of somebody else in the same sentence - otherwise a busy group is
 * a wall of highlights that says nothing about whether any of them wants you.
 */
describe("a message that mentions people", () => {
  const ME = "11111111-1111-1111-1111-111111111111";
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const at = (id: string, name: string) => `@[${name}](${id})`;

  it("shows the name and never the id", () => {
    render(<MessageText text={`${at(ME, "Aline Uwase")} hello`} meId={ME} />);
    expect(screen.getByText("@Aline Uwase")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(ME);
  });

  it("keeps the words around it", () => {
    render(
      <MessageText text={`hi ${at(OTHER, "Jean")} please check`} meId={ME} />,
    );
    expect(document.body.textContent).toBe("hi @Jean please check");
  });

  /* Being named is a thing to answer, so it carries a ground of its own
     rather than only a colour: on the brand bubble a colour change alone is
     not enough of a difference to read, and colour alone never is for anyone
     who cannot see it. */
  it("marks a mention of the reader more strongly than one of somebody else", () => {
    render(
      <MessageText
        text={`${at(ME, "Aline")} and ${at(OTHER, "Jean")}`}
        meId={ME}
      />,
    );
    const mine = screen.getByText("@Aline").className;
    const theirs = screen.getByText("@Jean").className;
    expect(mine).toContain("bg-");
    expect(theirs).not.toContain("bg-");
    expect(mine).not.toBe(theirs);
  });

  it("does the same inside one of your own bubbles", () => {
    render(
      <MessageText
        text={`${at(ME, "Aline")} and ${at(OTHER, "Jean")}`}
        meId={ME}
        mine
      />,
    );
    expect(screen.getByText("@Aline").className).toContain("bg-white/25");
    expect(screen.getByText("@Jean").className).not.toContain("bg-");
  });

  /* A reader the component was told nothing about is not being mentioned by
     anybody, and highlighting every mention as theirs would be worse than
     highlighting none. */
  it("marks nothing as the reader's when it does not know who they are", () => {
    render(<MessageText text={at(ME, "Aline")} />);
    expect(screen.getByText("@Aline").className).not.toContain("bg-");
  });

  // A link beside a mention is still a link.
  it("still makes a link clickable beside a mention", () => {
    render(
      <MessageText
        text={`${at(ME, "Aline")} see https://markova.edu/papers`}
        meId={ME}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://markova.edu/papers",
    );
  });

  it("leaves an ordinary message alone", () => {
    render(<MessageText text="bring your books" meId={ME} />);
    expect(document.body.textContent).toBe("bring your books");
  });
});
