import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParentsSee } from "./parents-see";

describe("what a student's parents can see, for the school", () => {
  it("lists an adult's choices", () => {
    render(
      <ParentsSee
        firstName="Keza"
        student={{
          dateOfBirth: "2000-01-01T00:00:00.000Z",
          sharesResults: true,
          sharesConduct: false,
          sharesHealth: true,
        }}
      />,
    );
    const card = screen.getByTestId("parents-see");
    expect(card).toHaveTextContent("Keza is 18 or over and decides");
    expect(card).toHaveTextContent(/Attendance and disciplinePrivate/);
    expect(card).toHaveTextContent(/ResultsShared/);
  });

  it("says everything for a student under 18", () => {
    render(<ParentsSee firstName="Aline" student={{ dateOfBirth: new Date().toISOString() }} />);
    expect(screen.getByTestId("parents-see")).toHaveTextContent("Everything: Aline is under 18.");
  });

  it("says why, when there is no date of birth", () => {
    render(<ParentsSee firstName="Eric" student={{ dateOfBirth: null }} />);
    expect(screen.getByTestId("parents-see")).toHaveTextContent(/no date of birth for Eric/);
  });
});
