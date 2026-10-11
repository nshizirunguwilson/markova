import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeptPrivateNotice } from "./kept-private-notice";

describe("the notice for something kept private", () => {
  it("says the choice, and that fees stay shared", () => {
    render(<KeptPrivateNotice message="Keza has chosen to keep their results private." />);
    const notice = screen.getByTestId("kept-private");
    expect(notice).toHaveTextContent("Keza has chosen to keep their results private.");
    expect(notice).toHaveTextContent(/Fees are always shared/);
  });
});
