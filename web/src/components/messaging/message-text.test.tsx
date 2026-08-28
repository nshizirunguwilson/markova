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
