import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QuotedMessage, quotedSummary } from "./quoted-message";

/**
 * Shaped like the `replyTo` the API sends with each message: the line of
 * text, what kind of thing it was, and who said it - enough to draw the bar
 * without loading the original again.
 */
const quoted = (over = {}) => ({
  id: "m-1",
  content: "Muraho neza",
  contentType: "TEXT",
  senderUserId: "u-3",
  sender: { firstName: "Aline", lastName: "Uwase" },
  ...over,
});

describe("what a quote says", () => {
  it("repeats the line for a message of words", () => {
    expect(quotedSummary(quoted())).toBe("Muraho neza");
  });

  // A quote of a file has to say something; the filename is what there is.
  it("names an attachment rather than quoting nothing", () => {
    expect(
      quotedSummary(quoted({ contentType: "FILE", content: "results.pdf" })),
    ).toBe("results.pdf");
  });

  it("falls back to the word Attachment when even the name is gone", () => {
    expect(quotedSummary(quoted({ contentType: "FILE", content: "" }))).toBe(
      "Attachment",
    );
  });

  it("says nothing for nothing", () => {
    expect(quotedSummary(null)).toBe("");
    expect(quotedSummary(undefined)).toBe("");
    expect(quotedSummary(quoted({ content: null }))).toBe("");
  });
});

describe("the quote above a reply", () => {
  it("names who said it and repeats a line of it", () => {
    render(<QuotedMessage message={quoted()} />);
    expect(screen.getByText("Aline Uwase")).toBeInTheDocument();
    expect(screen.getByText("Muraho neza")).toBeInTheDocument();
  });

  it("draws nothing when there is nothing to quote", () => {
    const { container } = render(<QuotedMessage message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says Message when the original has no words left", () => {
    render(<QuotedMessage message={quoted({ content: "" })} />);
    expect(screen.getByText("Message")).toBeInTheDocument();
  });

  it("names somebody whose account has gone", () => {
    render(<QuotedMessage message={quoted({ sender: null })} />);
    expect(screen.getByText("Someone")).toBeInTheDocument();
  });

  /**
   * Inside one of your own bubbles the ground is the brand colour, so the
   * quote takes its contrast from that rather than from the page.
   */
  it("changes its colours inside your own bubble", () => {
    const { container, rerender } = render(<QuotedMessage message={quoted()} />);
    const theirs = container.firstElementChild!.className;
    rerender(<QuotedMessage message={quoted()} mine />);
    const mine = container.firstElementChild!.className;
    expect(mine).not.toBe(theirs);
    expect(mine).toContain("on-primary");
  });

  // Tapping a quote goes to what it answers, which is the reason it is worth
  // having once the conversation has moved on.
  it("is a button when there is somewhere to jump to", async () => {
    const onJump = vi.fn();
    render(<QuotedMessage message={quoted()} onJump={onJump} />);

    await userEvent.setup().click(screen.getByRole("button"));

    expect(onJump).toHaveBeenCalled();
  });

  it("is not a button when there is not", () => {
    render(<QuotedMessage message={quoted()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("takes an extra class from the caller", () => {
    const { container } = render(
      <QuotedMessage message={quoted()} className="mb-1" />,
    );
    expect(container.firstElementChild!.className).toContain("mb-1");
  });
});
