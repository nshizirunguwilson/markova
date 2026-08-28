import { describe, expect, it } from "vitest";

import {
  ACCEPTED_ATTACHMENTS,
  humanSize,
  kindOfMime,
  kindOfUrl,
  shortFilename,
  whyNotSendable,
  MAX_ATTACHMENT_BYTES,
} from "./attachments";

const MB = 1024 * 1024;
const file = (name: string, type: string, size: number) => ({
  name,
  type,
  size,
});

describe("what kind of attachment this is", () => {
  it("sorts a type into one of the four", () => {
    expect(kindOfMime("image/png")).toBe("image");
    expect(kindOfMime("video/quicktime")).toBe("video");
    expect(kindOfMime("audio/webm")).toBe("audio");
    expect(kindOfMime("application/pdf")).toBe("document");
    expect(kindOfMime("")).toBeNull();
  });

  /**
   * A message carries a URL, not a mime type. The extension on it was chosen
   * by the API from the verified type rather than by whoever uploaded it, so
   * it is trustworthy in a way a filename normally is not.
   */
  it("reads the kind off a stored file's name", () => {
    expect(kindOfUrl("/uploads/attachments/a1b2.jpg")).toBe("image");
    expect(kindOfUrl("/uploads/attachments/a1b2.mp4")).toBe("video");
    expect(kindOfUrl("/uploads/attachments/a1b2.mov")).toBe("video");
    expect(kindOfUrl("/uploads/attachments/a1b2.weba")).toBe("audio");
    expect(kindOfUrl("/uploads/attachments/a1b2.pdf")).toBe("document");
  });

  it("ignores a query string on the way", () => {
    expect(kindOfUrl("/uploads/a.png?v=2")).toBe("image");
  });

  // Anything unrecognised gets the treatment that always works: a named row
  // with a download.
  it("treats anything it does not know as a document", () => {
    expect(kindOfUrl("/uploads/a1b2")).toBe("document");
    expect(kindOfUrl(null)).toBe("document");
  });
});

describe("a size in words", () => {
  it("writes bytes, kilobytes and megabytes", () => {
    expect(humanSize(512)).toBe("512 B");
    expect(humanSize(2048)).toBe("2 KB");
    expect(humanSize(10 * MB)).toBe("10 MB");
  });

  it("keeps a decimal only where it says something", () => {
    expect(humanSize(1.5 * MB)).toBe("1.5 MB");
    expect(humanSize(3 * MB)).toBe("3 MB");
  });
});

/**
 * Checked before the upload starts, so somebody on a mobile line is not asked
 * to push fifty megabytes up before being told it was never going to fit.
 */
describe("whether a file can be sent", () => {
  it("passes a photograph within its cap", () => {
    expect(whyNotSendable(file("photo.jpg", "image/jpeg", 2 * MB))).toBeNull();
  });

  it("passes a video, which gets more room than a photograph", () => {
    expect(whyNotSendable(file("clip.mp4", "video/mp4", 30 * MB))).toBeNull();
    expect(MAX_ATTACHMENT_BYTES.video).toBeGreaterThan(
      MAX_ATTACHMENT_BYTES.image,
    );
  });

  it("refuses a photograph over the photograph cap", () => {
    const said = whyNotSendable(file("photo.jpg", "image/jpeg", 12 * MB));
    expect(said).toContain("10 MB");
    expect(said).toContain("photo.jpg");
  });

  it("refuses a video over the video cap", () => {
    expect(whyNotSendable(file("clip.mp4", "video/mp4", 80 * MB))).toContain(
      "50 MB",
    );
  });

  // SVG runs script when opened and HTML is HTML; neither is on the list.
  it("refuses anything that runs when it is opened", () => {
    expect(whyNotSendable(file("x.svg", "image/svg+xml", 1000))).toContain(
      "not a kind of file",
    );
    expect(whyNotSendable(file("x.html", "text/html", 1000))).toContain(
      "not a kind of file",
    );
  });

  it("refuses an empty file", () => {
    expect(whyNotSendable(file("empty.pdf", "application/pdf", 0))).toContain(
      "empty",
    );
  });

  // What the picker offers has to be what the checker allows, or a person
  // picks a file the picker suggested and is then told they cannot send it.
  it("offers exactly what it accepts", () => {
    for (const type of ACCEPTED_ATTACHMENTS.split(",")) {
      expect(whyNotSendable(file("f", type, 1000))).toBeNull();
    }
  });

  it("never offers a type the API would refuse", () => {
    expect(ACCEPTED_ATTACHMENTS).not.toContain("svg");
    expect(ACCEPTED_ATTACHMENTS).not.toContain("text/html");
  });
});

/**
 * Cut in the middle, because the extension says what the file is:
 * "Term 1 report…ol.pdf" beats "Term 1 repor…".
 */
describe("a filename short enough for a bubble", () => {
  it("leaves a short name alone", () => {
    expect(shortFilename("marks.pdf")).toBe("marks.pdf");
  });

  it("keeps the extension when it has to cut", () => {
    const short = shortFilename("Term 1 report for the whole school.pdf", 20);
    expect(short.endsWith(".pdf")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(20);
    expect(short).toContain("…");
  });

  it("copes with a name that has no extension", () => {
    expect(shortFilename("a".repeat(40), 10)).toContain("…");
  });
});
