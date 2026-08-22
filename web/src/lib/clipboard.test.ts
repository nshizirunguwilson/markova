import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

/**
 * A school running this over plain http on its own LAN has no clipboard API at
 * all: `navigator.clipboard` only exists in a secure context. The one screen
 * that used it shows a generated password exactly once, so silently failing
 * there would lose an account's only credential.
 */

function withClipboard(impl: ((text: string) => Promise<void>) | null) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: impl ? { writeText: vi.fn(impl) } : undefined,
  });
}

beforeEach(() => {
  document.execCommand = vi.fn(() => true) as unknown as typeof document.execCommand;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("when a clipboard is available", () => {
  it("uses it", async () => {
    const writes: string[] = [];
    withClipboard(async (t) => {
      writes.push(t);
    });
    await expect(copyText("Temp123!")).resolves.toBe(true);
    expect(writes).toEqual(["Temp123!"]);
  });
});

describe("when there is no clipboard", () => {
  // Plain http, which is how this gets deployed on a school network.
  it("falls back to a selection copy rather than throwing", async () => {
    withClipboard(null);
    await expect(copyText("Temp123!")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("leaves no stray element behind", async () => {
    withClipboard(null);
    const before = document.body.children.length;
    await copyText("Temp123!");
    expect(document.body.children.length).toBe(before);
  });
});

describe("when copying is refused", () => {
  it("falls back when the clipboard rejects", async () => {
    withClipboard(async () => {
      throw new Error("Permission denied");
    });
    await expect(copyText("Temp123!")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalled();
  });

  // Reporting a copy that did not happen is how a password gets lost.
  it("says so when nothing worked", async () => {
    withClipboard(null);
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;
    await expect(copyText("Temp123!")).resolves.toBe(false);
  });

  it("says so when the fallback itself throws", async () => {
    withClipboard(null);
    document.execCommand = vi.fn(() => {
      throw new Error("not allowed");
    }) as unknown as typeof document.execCommand;
    await expect(copyText("Temp123!")).resolves.toBe(false);
  });
});

describe("nothing to copy", () => {
  it("reports failure for an empty string rather than claiming success", async () => {
    withClipboard(async () => {});
    await expect(copyText("")).resolves.toBe(false);
  });
});
