// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { NationalIdInput } from "./national-id-input";

function Harness() {
  const [digits, setDigits] = useState("");
  return <NationalIdInput value={digits} onChange={setDigits} />;
}

describe("NationalIdInput (rendered)", () => {
  it("shows spaces between the card sections while typing", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("1 2008 8 0123456 0 12");
    fireEvent.change(input, { target: { value: "1201270123456012" } });
    expect((input as HTMLInputElement).value).toBe("1 2012 7 0123456 0 12");
  });

  it("ignores letters and symbols, keeps digits only", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("1 2008 8 0123456 0 12");
    fireEvent.change(input, { target: { value: "1a2-0 1!2 7...0123" } });
    expect((input as HTMLInputElement).value).toBe("1 2012 7 0123");
  });

  it("caps the number at 16 digits", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("1 2008 8 0123456 0 12");
    fireEvent.change(input, { target: { value: "12012701234560129999" } });
    expect((input as HTMLInputElement).value).toBe("1 2012 7 0123456 0 12");
  });

  it("renders the validation error in place of the hint", () => {
    const noop = vi.fn();
    render(
      <NationalIdInput value="12012" onChange={noop} error="National ID must have 16 digits" />,
    );
    expect(screen.getByText("National ID must have 16 digits")).toBeTruthy();
    expect(screen.queryByText(/spaces appear automatically/)).toBeNull();
  });
});
