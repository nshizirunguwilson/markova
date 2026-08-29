import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WithheldNotice } from "./withheld-notice";

/**
 * Why the results are not here.
 *
 * A school withholding a report card over unpaid fees is ordinary in Rwanda,
 * so the panel has to read as a term explained rather than as an error. The
 * three things a family needs are that it is the fees, how much, and where to
 * go next - a padlock alone has them phoning the school to find out which.
 */
describe("a held term", () => {
  const withheld = { balance: 74000, message: "held" };

  it("says it is the fees, not a fault", () => {
    render(<WithheldNotice withheld={withheld} feesHref="/student/fees" />);
    expect(document.body.textContent).toMatch(
      /held until the school fees are settled/i,
    );
  });

  it("names the amount, which is the part they can act on", () => {
    render(<WithheldNotice withheld={withheld} feesHref="/student/fees" />);
    expect(document.body.textContent).toMatch(/74,000 RWF/);
  });

  // "Nothing has been lost" is the sentence that stops the phone call.
  it("says the results come back and nothing was lost", () => {
    render(<WithheldNotice withheld={withheld} feesHref="/student/fees" />);
    expect(document.body.textContent).toMatch(/nothing has been lost/i);
  });

  it("points at the account", () => {
    render(<WithheldNotice withheld={withheld} feesHref="/parent/fees" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/parent/fees");
  });

  it("names what is being withheld in the words of the page it replaces", () => {
    render(
      <WithheldNotice withheld={withheld} feesHref="/student/fees" what="marks" />,
    );
    expect(document.body.textContent).toMatch(/These marks are held/);
  });

  it("says where a missing payment can be chased", () => {
    render(<WithheldNotice withheld={withheld} feesHref="/student/fees" />);
    expect(document.body.textContent).toMatch(/deposit slip or transaction number/i);
  });
});
