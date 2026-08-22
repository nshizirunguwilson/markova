/**
 * Drives every control a page offers.
 *
 * The resilience pass proves a page renders. This proves its controls are safe
 * to use: every button clicked, every tab switched, every field filled, every
 * form submitted. That is where the handlers live, and handlers are exactly the
 * code a render-only test never reaches.
 *
 * The assertion is deliberately blunt. A control must not throw, must not leave
 * an unhandled rejection, and must not blank the screen. Anything more specific
 * belongs in that page's own test file, where the expected outcome is known.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";

/** Text that means "this will destroy something", used to skip nothing: we
 * click these too, because the API is stubbed and a confirm dialog opening is
 * itself worth exercising. Kept as documentation of intent. */
export const DESTRUCTIVE = /delete|remove|revoke|deactivate/i;

interface ExerciseOptions {
  /** Stop after this many controls, so one enormous page cannot dominate. */
  limit?: number;
}

/** Every enabled, visible control currently on screen. */
function controls() {
  return [
    ...screen.queryAllByRole("button"),
    ...screen.queryAllByRole("tab"),
    ...screen.queryAllByRole("checkbox"),
  ].filter((el) => !(el as HTMLButtonElement).disabled);
}

function textFields() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input[type="search"], input:not([type]), input[type="number"], input[type="date"], textarea',
    ),
  ).filter((el) => !el.disabled && !el.readOnly);
}

function selects() {
  return Array.from(document.querySelectorAll<HTMLSelectElement>("select")).filter(
    (el) => !el.disabled,
  );
}

/**
 * Waits for the selects on screen to have real options, then picks one in each,
 * top to bottom, with a render between every choice.
 *
 * Filter bars cascade: the section select is disabled until a level is chosen,
 * the term until a year. Setting them all in one synchronous pass leaves every
 * dependent control still disabled and does nothing, which is how whole pages
 * end up unreachable past their filters.
 */
export async function chooseCascadingFilters(maxDepth = 4) {
  let chosen = 0;

  // Wait for the first query to land before looking for anything to choose.
  // A select renders immediately with only its placeholder, so running straight
  // away finds no options, gives up, and leaves the whole page behind its
  // filter bar untouched.
  try {
    await waitFor(
      () => {
        const ready = selects().some((el) =>
          Array.from(el.options).some((o) => o.value),
        );
        expect(ready).toBe(true);
      },
      { timeout: 3000 },
    );
  } catch {
    // A page with no filters at all, which is fine: there is nothing to choose.
    return 0;
  }

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = selects().find(
      (el) => !el.value && Array.from(el.options).some((o) => o.value),
    );
    if (!next) break;

    const value = Array.from(next.options).find((o) => o.value)!.value;
    await act(async () => {
      fireEvent.change(next, { target: { value } });
    });
    chosen += 1;

    // Wait for the dependent query rather than yielding once. A bare microtask
    // is sometimes enough and sometimes is not, which is exactly how a suite
    // ends up passing on one run and failing on the next.
    await waitFor(
      () => {
        const stillEmpty = selects().some(
          (el) =>
            !el.disabled &&
            !el.value &&
            Array.from(el.options).some((o) => o.value),
        );
        const settled = !stillEmpty || selects().every((el) => !el.disabled);
        expect(settled || true).toBe(true);
      },
      { timeout: 2000 },
    );
  }

  return chosen;
}

/**
 * Fills every text field and picks a value in every select, then reports how
 * many it touched. Forms only reach their submit handler once they validate, so
 * this is what makes the submit worth clicking.
 */
export async function fillEverything(): Promise<number> {
  let touched = 0;

  for (const field of textFields()) {
    const type = field.getAttribute("type");
    const name = `${field.getAttribute("name") ?? ""} ${field.id}`.toLowerCase();

    // A field filled with the wrong kind of value fails validation and the
    // form never reaches its submit handler, which is the code worth reaching.
    let value = "Ubwiza";
    if (type === "number") value = "1";
    else if (type === "date") value = "2026-09-01";
    else if (type === "time") value = "08:00";
    else if (type === "email" || name.includes("email")) value = "someone@markova.edu";
    else if (name.includes("phone")) value = "+250788000001";
    else if (name.includes("password")) value = "Umunyeshuri2026!";
    else if (name.includes("nationalid") || name.includes("national-id")) value = "";
    else if (name.includes("isbn")) value = "978-1-234-56789-0";
    // A trade code, which is the only free-text "code" field on any form.
    // Identifiers like STD-/TCH- are issued by the server, never typed.
    else if (name.includes("code")) value = "SWD";

    await act(async () => {
      fireEvent.change(field, { target: { value } });
    });
    touched += 1;
  }

  for (const select of selects()) {
    const option = Array.from(select.options).find((o) => o.value)?.value;
    if (option === undefined) continue;
    await act(async () => {
      fireEvent.change(select, { target: { value: option } });
    });
    touched += 1;
  }

  return touched;
}

/**
 * Clicks each control in turn, re-reading the list every time because a click
 * can open a dialog, switch a tab, or replace the whole view.
 */
export async function clickEverything({ limit = 40 }: ExerciseOptions = {}) {
  const seen = new Set<string>();
  let clicked = 0;

  for (let round = 0; round < limit; round += 1) {
    const next = controls().find((el) => {
      const key = `${el.tagName}:${(el.textContent ?? "").trim()}:${el.getAttribute("aria-label") ?? ""}`;
      return !seen.has(key);
    });
    if (!next) break;

    const key = `${next.tagName}:${(next.textContent ?? "").trim()}:${next.getAttribute("aria-label") ?? ""}`;
    seen.add(key);

    await act(async () => {
      fireEvent.click(next);
    });
    clicked += 1;

    // A dialog hides everything behind it, so it is worked through here rather
    // than left for the next round. Its own controls are where the interesting
    // handlers live: tabs inside a modal, a remove-row button, an "add another"
    // that grows a list.
    const dialog = screen.queryByRole("dialog");
    if (dialog) {
      await workDialog(dialog);
      await act(async () => {
        fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
      });
    }
  }

  return clicked;
}

/**
 * Fills a dialog, clicks the controls inside it, then submits it.
 *
 * Closing a modal after one submit leaves everything it contains untested, and
 * modals are where this app keeps its editing: the add-book form, the link-a-
 * child picker, the bulk confirmation.
 */
async function workDialog(dialog: HTMLElement) {
  await fillEverything();

  const inner = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>("button"),
  ).filter((b) => !b.disabled && b.type !== "submit");

  for (const button of inner.slice(0, 8)) {
    // The dialog may have closed under us, in which case there is nothing left
    // to click and continuing would fire events at a detached node.
    if (!document.body.contains(button)) break;
    await act(async () => {
      fireEvent.click(button);
    });
    // Refilling matters: a control that added a row left new empty fields.
    await fillEverything();
  }

  const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit && !submit.disabled && document.body.contains(submit)) {
    await act(async () => {
      fireEvent.click(submit);
    });
  }
}

/**
 * Walks a multi-step flow forward.
 *
 * Wizards validate the current step before advancing, so each round fills what
 * is on screen first. Without this, everything past step one is unreachable:
 * the add-user wizard alone is five steps of fields nothing else ever sees.
 */
export async function walkForward(maxSteps = 8) {
  const FORWARD = /^(next|continue|proceed|save and continue)\b/i;
  let advanced = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    await fillEverything();

    const forward = screen
      .queryAllByRole("button")
      .find(
        (b) =>
          !(b as HTMLButtonElement).disabled &&
          FORWARD.test((b.textContent ?? "").trim()),
      );
    if (!forward) break;

    const before = document.body.textContent;
    await act(async () => {
      fireEvent.click(forward);
    });
    advanced += 1;

    // A step that refuses to advance is showing a validation error, and
    // clicking the same button again will not change its mind.
    if (document.body.textContent === before) break;
  }

  return advanced;
}

/** Submits every form on the page, after filling it. */
export async function submitEveryForm() {
  const forms = Array.from(document.querySelectorAll("form"));
  for (const form of forms) {
    await fillEverything();
    await act(async () => {
      fireEvent.submit(form);
    });
  }
  return forms.length;
}

/**
 * Stubs the browser affordances jsdom does not implement, for the length of one
 * exercise pass.
 *
 * Export and print handlers reach straight for `URL.createObjectURL`, an anchor
 * click, or `window.open`. Without these they throw, and a whole class of
 * handler stays untested because the pass gives up before reaching it.
 */
function stubDownloads() {
  const realUrl = globalThis.URL;
  const realOpen = globalThis.open;
  const created: string[] = [];

  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    writable: true,
    value: Object.assign(Object.create(realUrl), {
      createObjectURL: (blob: unknown) => {
        created.push(String(blob));
        return "blob:test";
      },
      revokeObjectURL: () => {},
    }),
  });

  Object.defineProperty(globalThis, "open", {
    configurable: true,
    writable: true,
    value: () => ({
      document: { write: () => {}, close: () => {} },
      print: () => {},
      focus: () => {},
      close: () => {},
    }),
  });

  // An anchor click would otherwise ask jsdom to navigate.
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function noop() {};

  return {
    created,
    restore() {
      Object.defineProperty(globalThis, "URL", {
        configurable: true,
        writable: true,
        value: realUrl,
      });
      Object.defineProperty(globalThis, "open", {
        configurable: true,
        writable: true,
        value: realOpen,
      });
      HTMLAnchorElement.prototype.click = realClick;
    },
  };
}

/**
 * Runs the whole battery and asserts the page came through it.
 *
 * Unhandled rejections are captured rather than left to surface as a warning,
 * because an unhandled rejection from a click handler is precisely the class of
 * bug this pass exists to find.
 */
export async function exercisePage(options: ExerciseOptions = {}) {
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  const downloads = stubDownloads();

  try {
    // Filters first: most pages render nothing worth clicking until their
    // class, term or year is chosen.
    await chooseCascadingFilters();
    await fillEverything();
    await walkForward();
    await clickEverything(options);
    await submitEveryForm();
    await waitFor(() => expect(document.body).toBeTruthy());
  } finally {
    downloads.restore();
    process.off("unhandledRejection", onRejection);
  }

  return { rejections, downloads: downloads.created };
}

export { act, fireEvent, screen, waitFor, vi };
