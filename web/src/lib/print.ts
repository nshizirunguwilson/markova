/**
 * Printing a document from the page it is already on.
 *
 * `window.open` + `document.write` was the old route, and it cost a popup:
 * a second tab appeared, printed, and was left behind for the user to close —
 * or was blocked outright by the browser, which reads as a Print button that
 * does nothing. A hidden same-origin iframe prints from the current page and
 * cleans itself up.
 *
 * Same-origin matters: `srcdoc` inherits this document's origin, so
 * `contentWindow.print()` is reachable. A cross-origin frame would not be.
 */

/** How long to leave the frame in the document after print() returns. */
const CLEANUP_DELAY_MS = 1000;

export interface PrintOptions {
  /** Injected so tests do not have to own a real document. */
  doc?: Document;
  /** Called instead of the real cleanup timer in tests. */
  schedule?: (fn: () => void, ms: number) => void;
}

/**
 * Prints an HTML document without leaving the page.
 *
 * Returns true when the print dialog was reached. A frame whose window is
 * unreachable (a browser that refused it) returns false so the caller can say
 * so rather than leaving the user waiting for a dialog that is not coming.
 */
export function printHtml(html: string, options: PrintOptions = {}): boolean {
  // `??` would fall through to the real document when a caller passes null
  // deliberately, which is exactly the case a test is checking.
  const doc =
    options.doc !== undefined
      ? options.doc
      : typeof document !== "undefined"
        ? document
        : null;
  if (!doc || !html) return false;

  const schedule =
    options.schedule ??
    ((fn: () => void, ms: number) => setTimeout(fn, ms));

  const frame = doc.createElement("iframe");
  // Off-screen rather than display:none: a frame that is not laid out has no
  // rendered content for the print engine to take, and prints blank.
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";

  const remove = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  let printed = false;
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      remove();
      return;
    }
    try {
      win.focus();
      win.print();
      printed = true;
    } finally {
      // Removing the frame the instant print() returns cancels the job in
      // some browsers, which print asynchronously. A short delay is the
      // difference between a printed page and a silent no-op.
      schedule(remove, CLEANUP_DELAY_MS);
    }
  };

  frame.srcdoc = html;
  doc.body.appendChild(frame);

  // onload has usually not fired yet, so this reports that the frame was
  // successfully attached — the failure this guards against is a document
  // that would not take it at all.
  return printed || !!frame.parentNode;
}
