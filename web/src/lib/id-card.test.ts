import { describe, expect, it } from "vitest";
import { initialsOf, renderIdCard } from "./id-card";

/**
 * Filling the ID card artwork in.
 *
 * The point of this module is that the design can be redrawn by someone who
 * has never seen the code. So the tests are about the contract: named ids get
 * filled, ids the artwork leaves out are skipped rather than crashing, and
 * nothing is printed as an empty frame.
 */

const TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 856 540">
  <text id="school-name">School name</text>
  <image id="school-logo" href="" />
  <g id="student-photo-fallback"><rect /><text>--</text></g>
  <image id="student-photo" href="" />
  <text id="student-name">Student name</text>
  <text id="student-level">Level</text>
  <text id="student-id">STD-0000-000000-000</text>
  <text id="card-validity">Valid to</text>
  <g id="qr-code"><rect x="628" y="176" width="180" height="180" /></g>
</svg>`;

const student = {
  name: "Wilson Nshizirungu",
  studentIdNumber: "STD-2025-231419-167",
  level: "Senior 1",
  photoUrl: "/uploads/avatars/a.png",
  validUntil: "30 Jun 2026",
  schoolName: "Markova Academy",
  schoolLogoUrl: "/uploads/branding/logo.png",
  qrDataUri: "data:image/png;base64,AAAA",
};

function parse(svg: string) {
  return new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
}

describe("filling in a card", () => {
  it("writes the student's name", () => {
    const out = parse(renderIdCard(TEMPLATE, student));
    expect(out.querySelector("#student-name")?.textContent).toBe("Wilson Nshizirungu");
  });

  it("writes the student number", () => {
    const out = parse(renderIdCard(TEMPLATE, student));
    expect(out.querySelector("#student-id")?.textContent).toBe("STD-2025-231419-167");
  });

  it("writes the level and the validity", () => {
    const out = parse(renderIdCard(TEMPLATE, student));
    expect(out.querySelector("#student-level")?.textContent).toBe("Senior 1");
    expect(out.querySelector("#card-validity")?.textContent).toBe("Valid to 30 Jun 2026");
  });

  it("writes the school's own name and logo", () => {
    const out = parse(renderIdCard(TEMPLATE, student));
    expect(out.querySelector("#school-name")?.textContent).toBe("Markova Academy");
    expect(out.querySelector("#school-logo")?.getAttribute("href")).toBe(
      "/uploads/branding/logo.png",
    );
  });

  // The artwork is not the code's to own; anything outside the contract stays
  // exactly as it was drawn.
  it("leaves the rest of the artwork untouched", () => {
    const out = renderIdCard(TEMPLATE, student);
    expect(out).toContain('viewBox="0 0 856 540"');
  });
});

describe("the photograph", () => {
  it("uses the student's photo and drops the fallback", () => {
    const out = parse(renderIdCard(TEMPLATE, student));
    expect(out.querySelector("#student-photo")?.getAttribute("href")).toBe(
      "/uploads/avatars/a.png",
    );
    expect(out.querySelector("#student-photo-fallback")).toBeNull();
  });

  // A card printed with an empty photo frame looks broken. Initials at least
  // look deliberate.
  it("falls back to initials when there is no photo", () => {
    const out = parse(renderIdCard(TEMPLATE, { ...student, photoUrl: null }));
    expect(out.querySelector("#student-photo")).toBeNull();
    expect(out.querySelector("#student-photo-fallback text")?.textContent).toBe("WN");
  });

  it("never shows both the photo and the fallback", () => {
    for (const photoUrl of ["/uploads/a.png", null]) {
      const out = parse(renderIdCard(TEMPLATE, { ...student, photoUrl }));
      const both =
        out.querySelector("#student-photo") && out.querySelector("#student-photo-fallback");
      expect(both).toBeFalsy();
    }
  });
});

describe("the QR", () => {
  it("replaces the placeholder box with the generated code", () => {
    const out = parse(renderIdCard(TEMPLATE, student));
    expect(out.querySelector("#qr-code")).toBeNull();
    const img = Array.from(out.querySelectorAll("image")).find(
      (el) => el.getAttribute("href") === student.qrDataUri,
    );
    expect(img).toBeTruthy();
  });

  // It keeps the designer's placement, rather than imposing its own.
  it("keeps the box where the designer put it", () => {
    const out = parse(renderIdCard(TEMPLATE, student));
    const img = Array.from(out.querySelectorAll("image")).find(
      (el) => el.getAttribute("href") === student.qrDataUri,
    )!;
    expect(img.getAttribute("x")).toBe("628");
    expect(img.getAttribute("y")).toBe("176");
    expect(img.getAttribute("width")).toBe("180");
  });

  // A student with no card issued has nothing to scan; an empty box would
  // read as a QR that failed to print.
  it("removes the box when no card has been issued", () => {
    const out = parse(renderIdCard(TEMPLATE, { ...student, qrDataUri: null }));
    expect(out.querySelector("#qr-code")).toBeNull();
    expect(out.querySelectorAll("image")).toHaveLength(2);
  });
});

describe("artwork that leaves things out", () => {
  // A school that would rather not reprint every year deletes the level from
  // the artwork. That must not break the render.
  it("skips an id the artwork does not contain", () => {
    const minimal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 856 540">
      <text id="student-name">x</text>
    </svg>`;
    const out = parse(renderIdCard(minimal, student));
    expect(out.querySelector("#student-name")?.textContent).toBe("Wilson Nshizirungu");
  });

  // A field with nothing in it leaves no stray label behind.
  it("removes a field that has no value", () => {
    const out = parse(renderIdCard(TEMPLATE, { ...student, level: null }));
    expect(out.querySelector("#student-level")).toBeNull();
  });

  it("removes the validity line when the card has no end date", () => {
    const out = parse(renderIdCard(TEMPLATE, { ...student, validUntil: null }));
    expect(out.querySelector("#card-validity")).toBeNull();
  });

  it("refuses artwork that is not valid SVG", () => {
    expect(() => renderIdCard("<svg><unclosed>", student)).toThrow(/not valid SVG/i);
  });
});

describe("initials", () => {
  it("takes the first two names", () => {
    expect(initialsOf("Wilson Nshizirungu")).toBe("WN");
  });

  it("stops at two however many names there are", () => {
    expect(initialsOf("Aaron Prince Mahoro Irakoze")).toBe("AP");
  });

  it("copes with a single name", () => {
    expect(initialsOf("Kagabo")).toBe("K");
  });

  it("copes with stray spacing", () => {
    expect(initialsOf("  Wilson   Nshizirungu ")).toBe("WN");
  });
});

/**
 * Artwork drawn differently, and details a school never filled in.
 *
 * The whole promise of this module is that a designer can move things around
 * without touching code. So the tests below hand it artwork that leaves the
 * placeholder box out, omits the fallback's text node, or carries no school
 * branding at all.
 */
describe("artwork drawn differently", () => {
  it("falls back to the designer's default QR position", () => {
    // A slot with no rect in it: the code has to land somewhere sensible
    // rather than at nought by nought at zero size.
    const noBox = TEMPLATE.replace(
      '<g id="qr-code"><rect x="628" y="176" width="180" height="180" /></g>',
      '<g id="qr-code"></g>',
    );
    const out = parse(renderIdCard(noBox, student));

    // The slot is replaced by the image, so it is the last <image> in the
    // card rather than a child of anything.
    const qr = Array.from(out.querySelectorAll("image")).at(-1)!;
    expect(qr.getAttribute("x")).toBe("0");
    expect(qr.getAttribute("y")).toBe("0");
    expect(qr.getAttribute("width")).toBe("180");
    expect(qr.getAttribute("height")).toBe("180");
  });

  it("copes with a fallback group that has no text in it", () => {
    const noLabel = TEMPLATE.replace(
      '<g id="student-photo-fallback"><rect /><text>--</text></g>',
      '<g id="student-photo-fallback"><rect /></g>',
    );
    const out = parse(renderIdCard(noLabel, { ...student, photoUrl: null }));

    // The frame survives; there is simply nowhere to write initials.
    expect(out.querySelector("#student-photo-fallback")).not.toBeNull();
    expect(out.querySelector("#student-photo")).toBeNull();
  });

  it("removes the logo when the school has not uploaded one", () => {
    const out = parse(renderIdCard(TEMPLATE, { ...student, schoolLogoUrl: null }));
    expect(out.querySelector("#school-logo")).toBeNull();
  });

  it("removes the school name when there is none on file", () => {
    const out = parse(renderIdCard(TEMPLATE, { ...student, schoolName: null }));
    expect(out.querySelector("#school-name")).toBeNull();
  });

  it("removes a field left as an empty string, not just a null", () => {
    const out = parse(renderIdCard(TEMPLATE, { ...student, level: "" }));
    expect(out.querySelector("#student-level")).toBeNull();
  });

  it("writes initials for a name with a stray blank part", () => {
    // "Uwase  " off the end of a CSV import: no crash, and no stray space in
    // the initials either.
    expect(initialsOf("Uwase ")).toBe("U");
    expect(initialsOf("")).toBe("");
  });
});
