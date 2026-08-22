import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import VerifyCardPage from "./page";

/**
 * Checking a student card from its QR.
 *
 * This page is what somebody at a gate looks at, and they may have no account
 * and no idea how the system works. Three outcomes have to be unmistakable and
 * distinct: the card is genuine, the card is not, or the school could not be
 * reached. Collapsing the third into the second would have a student turned
 * away over a network fault.
 */

const enrolled = {
  valid: true,
  reason: null,
  student: {
    name: "Wilson Nshizirungu",
    studentIdNumber: "STD-2025-231419-167",
    level: "Senior 1",
    photoUrl: "/uploads/avatars/a.png",
    status: "ACTIVE",
  },
  issuedAt: "2026-01-15T00:00:00.000Z",
};

/** Answers the verification endpoint, the way the API would. */
function serveCheck(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      json: async () => body,
    })),
  );
}

/** The page is an async server component; awaiting it yields its markup. */
async function renderPage(code = "TGSZ-D91T-KYF1") {
  const ui = await VerifyCardPage({ params: Promise.resolve({ code }) });
  render(ui);
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a genuine card", () => {
  it("says the card is valid", async () => {
    serveCheck(enrolled);
    await renderPage();
    expect(screen.getByText(/valid student card/i)).toBeInTheDocument();
  });

  it("names the student and their number", async () => {
    serveCheck(enrolled);
    await renderPage();
    expect(screen.getByText("Wilson Nshizirungu")).toBeInTheDocument();
    expect(screen.getByText("STD-2025-231419-167")).toBeInTheDocument();
  });

  it("shows their level", async () => {
    serveCheck(enrolled);
    await renderPage();
    expect(screen.getByText("Senior 1")).toBeInTheDocument();
  });

  // The photo is the entire defence against a copied card: the checker
  // compares the face on screen with the person in front of them.
  it("shows the photo the school holds", async () => {
    serveCheck(enrolled);
    await renderPage();
    const photo = screen.getByAltText(/photo of wilson/i) as HTMLImageElement;
    expect(photo.getAttribute("src")).toContain("/uploads/avatars/a.png");
  });

  it("tells the reader to compare the face, not just the code", async () => {
    serveCheck(enrolled);
    await renderPage();
    expect(document.body.textContent).toMatch(/does not match the person holding/i);
  });

  it("shows the code that was scanned", async () => {
    serveCheck(enrolled);
    await renderPage("ABCD-EFGH-JKLM");
    expect(screen.getByText("ABCD-EFGH-JKLM")).toBeInTheDocument();
  });

  // A student with no photograph on file still has to be identifiable.
  it("falls back to initials when there is no photo", async () => {
    serveCheck({ ...enrolled, student: { ...enrolled.student, photoUrl: null } });
    await renderPage();
    expect(screen.getByText("WN")).toBeInTheDocument();
  });

  it("copes with a student whose class has been removed", async () => {
    serveCheck({ ...enrolled, student: { ...enrolled.student, level: null } });
    await renderPage();
    expect(screen.getByText("Wilson Nshizirungu")).toBeInTheDocument();
  });
});

describe("a card that is not current", () => {
  const revoked = {
    valid: false,
    reason:
      "This card is not valid. It may have been reissued, or it was never issued by this school.",
  };

  it("says the card is not valid", async () => {
    serveCheck(revoked);
    await renderPage();
    expect(screen.getByText(/not a valid card/i)).toBeInTheDocument();
  });

  // Reissuing a lost card revokes the old one; the holder needs to know which
  // of the two things happened.
  it("passes on the reason the server gave", async () => {
    serveCheck(revoked);
    await renderPage();
    expect(document.body.textContent).toMatch(/reissued|never issued/i);
  });

  it("shows no student for a card that resolves to nobody", async () => {
    serveCheck(revoked);
    await renderPage();
    expect(screen.queryByText("Wilson Nshizirungu")).toBeNull();
  });

  // A former student's card is real but no longer current, and the gate still
  // needs to see who is holding it.
  it("names a former student while refusing the card", async () => {
    serveCheck({
      ...enrolled,
      valid: false,
      reason: "This student is no longer enrolled (graduated).",
      student: { ...enrolled.student, status: "GRADUATED" },
    });
    await renderPage();

    expect(screen.getByText(/card is not current/i)).toBeInTheDocument();
    expect(screen.getByText("Wilson Nshizirungu")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/no longer enrolled/i);
  });

  it("shows the status the school holds", async () => {
    serveCheck({
      ...enrolled,
      valid: false,
      reason: "This student is no longer enrolled (transferred).",
      student: { ...enrolled.student, status: "TRANSFERRED" },
    });
    await renderPage();
    expect(screen.getByText("TRANSFERRED")).toBeInTheDocument();
  });
});

/**
 * The case that matters most and is easiest to get wrong. A school connection
 * drops constantly; saying "not a valid card" when the truth is "I could not
 * ask" would have a real student turned away.
 */
describe("when the school cannot be reached", () => {
  it("says it could not check, not that the card is fake", async () => {
    serveCheck(null, false);
    await renderPage();

    expect(screen.getByText(/could not check this card/i)).toBeInTheDocument();
    expect(screen.queryByText(/not a valid card/i)).toBeNull();
  });

  it("says plainly that this does not mean the card is fake", async () => {
    serveCheck(null, false);
    await renderPage();
    expect(document.body.textContent).toMatch(/does not mean the card is fake/i);
  });

  it("treats a thrown request the same way", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await renderPage();
    expect(screen.getByText(/could not check this card/i)).toBeInTheDocument();
  });

  it("still shows the code so it can be checked another way", async () => {
    serveCheck(null, false);
    await renderPage("ABCD-EFGH-JKLM");
    expect(screen.getByText("ABCD-EFGH-JKLM")).toBeInTheDocument();
  });
});

describe("the request it makes", () => {
  it("asks the verification endpoint for that code", async () => {
    serveCheck(enrolled);
    await renderPage("TGSZ-D91T-KYF1");

    const [url] = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock
      .calls[0];
    expect(url).toContain("/verify/card/TGSZ-D91T-KYF1");
  });

  // A card scanned at a gate must reflect a revocation made a minute ago.
  it("never serves a cached answer", async () => {
    serveCheck(enrolled);
    await renderPage();

    const [, init] = (
      globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls[0];
    expect(init.cache).toBe("no-store");
  });

  it("escapes a code with characters that would break the url", async () => {
    serveCheck(enrolled);
    await renderPage("a b/c");

    const [url] = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock
      .calls[0];
    expect(url).toContain("a%20b%2Fc");
  });
});
