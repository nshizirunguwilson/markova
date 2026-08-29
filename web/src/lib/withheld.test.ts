import { describe, expect, it } from "vitest";
import { FEE_REFUSAL_REASON, withheldFrom } from "./withheld";

/**
 * Telling one 403 from another.
 *
 * A report card is refused when it has not been issued and when the term's
 * fees are owed. Those need different pages, and reading them apart by the
 * wording of a message breaks the first time anybody rewords or translates it.
 */
const refusal = (data: Record<string, unknown>) => ({ response: { data } });

describe("reading a held term out of a failed request", () => {
  it("recognises a refusal made over the fees", () => {
    expect(
      withheldFrom(
        refusal({
          reason: FEE_REFUSAL_REASON,
          message: "75,000 RWF is still outstanding",
          detail: { balance: 75000 },
        }),
      ),
    ).toEqual({ balance: 75000, message: "75,000 RWF is still outstanding" });
  });

  // The ordinary refusal a report card gets before it is issued.
  it("ignores a refusal that is about something else", () => {
    expect(
      withheldFrom(
        refusal({
          statusCode: 403,
          message: "This report card has not been issued yet.",
        }),
      ),
    ).toBeNull();
  });

  it("ignores anything that is not a request failure at all", () => {
    expect(withheldFrom(new Error("network"))).toBeNull();
    expect(withheldFrom(null)).toBeNull();
    expect(withheldFrom(undefined)).toBeNull();
  });

  /*
    A refusal that names itself but arrives without a figure is still a held
    term. Showing the panel with nothing in it beats falling through to a page
    that offers a report card the API will not hand over.
  */
  it("still reports it held when the amount is missing", () => {
    expect(
      withheldFrom(refusal({ reason: FEE_REFUSAL_REASON, message: "held" })),
    ).toEqual({ balance: 0, message: "held" });
  });

  it("copes with a refusal that carries no message", () => {
    expect(withheldFrom(refusal({ reason: FEE_REFUSAL_REASON }))).toEqual({
      balance: 0,
      message: "",
    });
  });

  it("ignores a balance that is not a number", () => {
    expect(
      withheldFrom(
        refusal({
          reason: FEE_REFUSAL_REASON,
          message: "held",
          detail: { balance: "lots" },
        }),
      ),
    ).toEqual({ balance: 0, message: "held" });
  });
});
