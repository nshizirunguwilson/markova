import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MessageAttachment } from "./message-attachment";

/**
 * Each kind gets the treatment that makes it useful in a conversation rather
 * than a row of identical paperclips.
 */
describe("a file inside a message", () => {
  it("shows a photograph rather than naming it", () => {
    const { container } = render(
      <MessageAttachment
        fileUrl="/uploads/attachments/a1b2.jpg"
        fileName="sports day.jpg"
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("a1b2.jpg"),
    );
  });

  it("gives a video the browser's own controls", () => {
    const { container } = render(
      <MessageAttachment fileUrl="/uploads/attachments/a1b2.mp4" fileName="demo.mp4" />,
    );
    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("controls");
  });

  // Enough to draw the first frame and know the length, without pulling
  // fifty megabytes down a mobile line for a clip nobody plays.
  it("does not download the whole video before it is played", () => {
    const { container } = render(
      <MessageAttachment fileUrl="/uploads/attachments/a1b2.mp4" fileName="demo.mp4" />,
    );
    expect(container.querySelector("video")).toHaveAttribute(
      "preload",
      "metadata",
    );
  });

  it("gives audio controls too", () => {
    const { container } = render(
      <MessageAttachment fileUrl="/uploads/attachments/a1b2.mp3" fileName="hymn.mp3" />,
    );
    expect(container.querySelector("audio")).toHaveAttribute("controls");
  });

  /**
   * A recipient offered "a1b2c3.pdf" does not know what they have been sent,
   * which is why the sender's own name is kept and shown.
   */
  it("names a document by the name the sender gave it", () => {
    render(
      <MessageAttachment
        fileUrl="/uploads/attachments/a1b2.pdf"
        fileName="Term 1 marks.pdf"
      />,
    );
    expect(screen.getByText(/Term 1 marks\.pdf/)).toBeInTheDocument();
  });

  it("saves a document under that name rather than the uuid", () => {
    render(
      <MessageAttachment
        fileUrl="/uploads/attachments/a1b2.pdf"
        fileName="Term 1 marks.pdf"
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "download",
      "Term 1 marks.pdf",
    );
  });

  // "I can see it but I cannot keep it" is the complaint every chat app that
  // skipped this gets.
  it("offers a download for every kind", () => {
    for (const url of ["a.jpg", "a.mp4", "a.mp3", "a.pdf"]) {
      const { container, unmount } = render(
        <MessageAttachment fileUrl={`/uploads/attachments/${url}`} fileName={url} />,
      );
      expect(
        container.querySelector("a[download]"),
      ).toBeInTheDocument();
      unmount();
    }
  });

  /*
    The download control under a video or an audio clip. The plain anchor
    inside the media element is the fallback for a browser that cannot play
    it; the styled one is the last.
  */
  function downloadControl(container: HTMLElement) {
    const all = [...container.querySelectorAll("a[download]")];
    return all[all.length - 1]!.className;
  }

  it("takes its colours from your own bubble for a video too", () => {
    const { container, rerender } = render(
      <MessageAttachment fileUrl="/uploads/a.mp4" fileName="a.mp4" />,
    );
    const theirs = downloadControl(container);
    rerender(<MessageAttachment fileUrl="/uploads/a.mp4" fileName="a.mp4" mine />);
    expect(downloadControl(container)).not.toBe(theirs);
  });

  it("and for audio", () => {
    const { container, rerender } = render(
      <MessageAttachment fileUrl="/uploads/a.mp3" fileName="a.mp3" />,
    );
    const theirs = downloadControl(container);
    rerender(<MessageAttachment fileUrl="/uploads/a.mp3" fileName="a.mp3" mine />);
    expect(downloadControl(container)).not.toBe(theirs);
  });

  it("still says something when the file has lost its name", () => {
    render(<MessageAttachment fileUrl="/uploads/attachments/a1b2.pdf" />);
    expect(screen.getByText("Attachment")).toBeInTheDocument();
  });

  it("shows nothing at all without a file", () => {
    const { container } = render(<MessageAttachment fileUrl="" />);
    expect(container).toBeEmptyDOMElement();
  });

  // Anything unrecognised gets the treatment that always works.
  it("treats an unknown kind as a document", () => {
    render(
      <MessageAttachment fileUrl="/uploads/attachments/a1b2.bin" fileName="data.bin" />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("download", "data.bin");
  });

  /**
   * A photograph whose file has gone falls back to the named row, so there is
   * still something to click rather than a broken-image icon.
   */
  it("falls back to a named row when the photograph will not load", () => {
    const { container } = render(
      <MessageAttachment
        fileUrl="/uploads/attachments/a1.jpg"
        fileName="sports day.jpg"
      />,
    );
    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByRole("link")).toHaveAttribute(
      "download",
      "sports day.jpg",
    );
  });

  it("takes its colours from your own bubble", () => {
    const { container, rerender } = render(
      <MessageAttachment fileUrl="/uploads/a.pdf" fileName="a.pdf" />,
    );
    const theirs = container.querySelector("a")!.className;
    rerender(<MessageAttachment fileUrl="/uploads/a.pdf" fileName="a.pdf" mine />);
    expect(container.querySelector("a")!.className).not.toBe(theirs);
  });
});
