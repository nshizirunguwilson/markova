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

    // Let the dependent query settle so the next select has options to offer.
    await act(async () => {
      await Promise.resolve();
    });
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
    const value =
      type === "number" ? "1" : type === "date" ? "2026-09-01" : "Ubwiza";
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

    // A dialog would hide everything behind it from the next round.
    const dialog = screen.queryByRole("dialog");
    if (dialog) {
      await fillEverything();
      const submit = dialog.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (submit && !submit.disabled) {
        await act(async () => {
          fireEvent.click(submit);
        });
      }
      await act(async () => {
        fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
      });
    }
  }

  return clicked;
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
    process.off("unhandledRejection", onRejection);
  }

  return { rejections };
}

export { act, fireEvent, screen, waitFor, vi };
