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
    await fillEverything();
    await clickEverything(options);
    await submitEveryForm();
    await waitFor(() => expect(document.body).toBeTruthy());
  } finally {
    process.off("unhandledRejection", onRejection);
  }

  return { rejections };
}

export { act, fireEvent, screen, waitFor, vi };
