import { afterEach, describe, expect, it, vi } from "vitest";

import { printHtml } from "./print";

/**
 * The Print button used to open a second tab, print from it, and leave it
 * behind - or be swallowed by a popup blocker, which reads as a button that
 * does nothing at all. Everything here is about printing from the page the
 * user is already looking at.
 */
describe("printHtml", () => {
  const html = "<html><body><h1>Transfer Letter</h1></body></html>";

  // Frames outlive the call on purpose, so each test starts from a clean page.
  afterEach(() => {
    document.querySelectorAll("iframe").forEach((f) => f.remove());
    vi.unstubAllGlobals();
  });

  const fireLoad = (frame: HTMLIFrameElement, win: unknown) => {
    Object.defineProperty(frame, "contentWindow", {
      value: win,
      configurable: true,
    });
    frame.onload?.(new Event("load"));
  };

  it("puts the document in a frame on the current page", () => {
    printHtml(html);
    const frame = document.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.srcdoc).toContain("Transfer Letter");
    frame?.remove();
  });

  it("never opens a window", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    printHtml(html);
    expect(open).not.toHaveBeenCalled();
    document.querySelector("iframe")?.remove();
    vi.unstubAllGlobals();
  });

  it("prints from the frame once it has loaded", () => {
    printHtml(html);
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    const print = vi.fn();
    fireLoad(frame, { focus: vi.fn(), print });
    expect(print).toHaveBeenCalled();
    frame.remove();
  });

  /**
   * Some browsers print asynchronously, so tearing the frame down the instant
   * print() returns cancels the job. It has to outlive the call.
   */
  it("leaves the frame in place until the job has had time to start", () => {
    const schedule = vi.fn();
    printHtml(html, { schedule });
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    fireLoad(frame, { focus: vi.fn(), print: vi.fn() });
    expect(frame.parentNode).not.toBeNull();
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 1000);

    schedule.mock.calls[0][0]();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("cleans up a frame the browser gave no window for", () => {
    printHtml(html);
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    fireLoad(frame, null);
    expect(document.querySelector("iframe")).toBeNull();
  });

  // A frame with no layout has nothing for the print engine to take and
  // prints a blank page, so it is moved off-screen rather than hidden.
  it("keeps the frame laid out rather than display:none", () => {
    printHtml(html);
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.style.display).not.toBe("none");
    expect(frame.style.visibility).toBe("hidden");
    frame.remove();
  });

  it("does nothing when there is no document to print into", () => {
    expect(printHtml(html, { doc: null as unknown as Document })).toBe(false);
  });

  it("does nothing with an empty document", () => {
    expect(printHtml("")).toBe(false);
    expect(document.querySelector("iframe")).toBeNull();
  });
});
