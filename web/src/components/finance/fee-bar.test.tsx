import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FeeBar } from "./fee-bar";
import { standing } from "@/test/fee-fixtures";

/**
 * The bar answers "how close", which a column of numbers does not.
 *
 * Neither colour nor length works for everybody, so the answer is also in
 * words on the element itself - that is the part these tests hold.
 */
describe("the settled bar", () => {
  const bar = (node: HTMLElement) => node.querySelector("[role='img']")!;

  it("says in words how far through the bill a family is", () => {
    const { container } = render(
      <FeeBar standing={standing(100000, 40000)} status="PART_PAID" />,
    );
    expect(bar(container)).toHaveAttribute(
      "aria-label",
      "40% of the fees settled",
    );
  });

  it("fills to the share settled", () => {
    const { container } = render(
      <FeeBar standing={standing(100000, 40000)} status="PART_PAID" />,
    );
    expect((container.querySelector("[role='img'] > div") as HTMLElement).style.width).toBe("40%");
  });

  it("is full once the term is cleared", () => {
    const { container } = render(
      <FeeBar standing={standing(100000, 100000)} status="CLEARED" />,
    );
    expect((container.querySelector("[role='img'] > div") as HTMLElement).style.width).toBe("100%");
  });

  // Not billed is the school's own unfinished work, and calling it "0%
  // settled" would read as a family that has not paid.
  it("says a term is unbilled rather than reporting nothing paid", () => {
    const { container } = render(<FeeBar standing={null} status="NOT_INVOICED" />);
    expect(bar(container)).toHaveAttribute(
      "aria-label",
      "Not billed for this term",
    );
  });

  it("takes the colour of the status beside it", () => {
    const { container } = render(
      <FeeBar standing={standing(100000, 0)} status="UNPAID" />,
    );
    expect(container.querySelector(".bg-danger")).toBeTruthy();
  });
});
