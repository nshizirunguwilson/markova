import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

  /*
    In the bubble a clip is a still with a play button on it — it does not
    play here at all. It used to, and expanding it then started a second copy
    from the beginning while the small one carried on playing behind the
    overlay: two soundtracks at once.
  */
  it("shows a video as a still, with no controls of its own", () => {
    const { container } = render(
      <MessageAttachment fileUrl="/uploads/attachments/a1b2.mp4" fileName="demo.mp4" />,
    );
    const video = container.querySelector("video")!;
    expect(video).not.toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("autoplay");
    // The still cannot be clicked into playing; the button over it opens it.
    expect(video.className).toContain("pointer-events-none");
    expect(screen.getByRole("button", { name: /play demo\.mp4/i })).toBeInTheDocument();
  });

  it("names the clip on the control that opens it", () => {
    render(
      <MessageAttachment fileUrl="/uploads/attachments/a1b2.mp4" fileName="demo.mp4" />,
    );
    expect(screen.getByRole("button", { name: "Play demo.mp4" })).toBeInTheDocument();
  });

  // The filename row under a clip is gone: the bubble shows the picture, and
  // a name under it is a caption nobody asked for.
  it("does not print the filename under a clip", () => {
    render(
      <MessageAttachment fileUrl="/uploads/attachments/a1b2.mp4" fileName="demo.mp4" />,
    );
    expect(screen.queryByText("demo.mp4")).toBeNull();
  });

  // Same corner as a photograph's, because in a conversation they are the
  // same kind of thing.
  it("puts a clip's download where a photograph's is", () => {
    const { container } = render(
      <MessageAttachment fileUrl="/uploads/attachments/a1b2.mp4" fileName="demo.mp4" />,
    );
    const corner = container.querySelector(".absolute.right-1\\.5.top-1\\.5");
    expect(corner).toBeInTheDocument();
    expect(corner!.querySelector("a[download]")).toBeInTheDocument();
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

/**
 * A photograph in a conversation is something you glance at and come back
 * from, so it opens large in place rather than in a new tab.
 */
describe("opening media large from a bubble", () => {
  it("opens a photograph", async () => {
    render(
      <MessageAttachment
        fileUrl="/uploads/attachments/a1.jpg"
        fileName="sports day.jpg"
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /open sports day/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("closes it again", async () => {
    render(<MessageAttachment fileUrl="/uploads/attachments/a1.jpg" fileName="a.jpg" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /open a\.jpg/i }));
    await user.click(await screen.findByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // One clip, one place: pressing play opens it large and plays it there.
  it("opens a clip large rather than playing it in the bubble", async () => {
    render(<MessageAttachment fileUrl="/uploads/attachments/a1.mp4" fileName="demo.mp4" />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /play demo\.mp4/i }));

    const dialog = await screen.findByRole("dialog");
    // The copy that plays is the one in the dialog, and it starts itself.
    expect(dialog.querySelector("video")).toHaveAttribute("autoplay");
  });
});
