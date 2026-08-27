import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { fillEverything, invalidFields } from "./exercise";

/**
 * The helper that fills a form before a test clicks submit.
 *
 * The values it types are literals, but which literal a field gets comes from
 * the field's own type and name, and is then trimmed to the limits the form
 * declares. A helper that hands 100 to a field capped at 20 leaves the form
 * refusing to submit, and that reads from the outside exactly like a broken
 * submit handler.
 */
describe("filling a form from what its fields declare", () => {
  it("keeps a number inside the range the field asks for", async () => {
    render(
      <form>
        <input aria-label="mark" name="mark" type="number" min="5" max="20" defaultValue="" />
      </form>,
    );
    await fillEverything();
    expect((screen.getByLabelText("mark") as HTMLInputElement).value).toBe("5");
  });

  it("raises a number to a minimum above the default", async () => {
    render(
      <form>
        <input aria-label="seats" name="seats" type="number" min="30" defaultValue="" />
      </form>,
    );
    await fillEverything();
    expect((screen.getByLabelText("seats") as HTMLInputElement).value).toBe("30");
  });

  it("moves a date into the window the field allows", async () => {
    render(
      <form>
        <input aria-label="when" name="when" type="date" max="2020-01-31" defaultValue="" />
      </form>,
    );
    await fillEverything();
    expect((screen.getByLabelText("when") as HTMLInputElement).value).toBe(
      "2020-01-31",
    );
  });

  it("cuts a value down to the length the field accepts", async () => {
    render(
      <form>
        <input aria-label="initials" name="initials" type="text" maxLength={3} defaultValue="" />
      </form>,
    );
    await fillEverything();
    expect((screen.getByLabelText("initials") as HTMLInputElement).value).toBe(
      "Ubw",
    );
  });

  it("pads a value out to the length the field demands", async () => {
    render(
      <form>
        <input aria-label="token" name="token" type="text" minLength={10} defaultValue="" />
      </form>,
    );
    const value = (await fillEverything(), screen.getByLabelText("token")) as HTMLInputElement;
    expect(value.value.length).toBeGreaterThanOrEqual(10);
    expect(value.value.startsWith("Ubwiza")).toBe(true);
  });

  it("still picks a value by what the field is called", async () => {
    render(
      <form>
        <input aria-label="email" name="email" type="text" defaultValue="" />
        <input aria-label="phone" name="phone" type="text" defaultValue="" />
      </form>,
    );
    await fillEverything();
    expect((screen.getByLabelText("email") as HTMLInputElement).value).toContain(
      "@markova.edu",
    );
    expect((screen.getByLabelText("phone") as HTMLInputElement).value).toContain(
      "+250",
    );
  });

  /**
   * A field named something the helper does not recognise gets the generic
   * string, and a form that refuses it looks like a broken submit handler
   * until somebody asks the browser which field it is unhappy about.
   */
  it("names the fields it could not satisfy", async () => {
    render(
      <form>
        <input aria-label="ok" name="title" type="text" defaultValue="" />
        <input aria-label="odd" name="tel" type="text" pattern="\+[0-9]+" defaultValue="" />
      </form>,
    );
    await fillEverything();
    expect(invalidFields()).toEqual(["tel"]);
  });

  it("finds nothing wrong with a form it could fill", async () => {
    render(
      <form>
        <input aria-label="title" name="title" type="text" defaultValue="" />
      </form>,
    );
    await fillEverything();
    expect(invalidFields()).toEqual([]);
  });
});
