import { describe, expect, it } from "vitest";
import { keptPrivate } from "./kept-private";

describe("reading 'kept private' out of a refusal", () => {
  it("gives the sentence the API sent", () => {
    const error = {
      response: {
        data: { reason: "KEPT_PRIVATE", message: "Keza has chosen to keep their health visits private." },
      },
    };
    expect(keptPrivate(error)).toBe("Keza has chosen to keep their health visits private.");
  });

  it("says something sensible when the sentence is missing", () => {
    expect(keptPrivate({ response: { data: { reason: "KEPT_PRIVATE" } } })).toMatch(/chosen to keep/);
  });

  it("is nothing for any other refusal", () => {
    expect(keptPrivate({ response: { data: { reason: "FEES_OUTSTANDING" } } })).toBeNull();
    expect(keptPrivate({ response: { status: 403 } })).toBeNull();
    expect(keptPrivate(null)).toBeNull();
  });
});
