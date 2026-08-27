import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Wallet } from "lucide-react";

import { Doorway, Figure, RepeatVisitors } from "./welfare-parts";

describe("a single figure", () => {
  it("states the label, the number and the hint", () => {
    render(
      <Figure icon={Wallet} label="Money held" value="RWF 3,640,100" hint="Across 806 students" />,
    );
    expect(screen.getByText("Money held")).toBeInTheDocument();
    expect(screen.getByText("RWF 3,640,100")).toBeInTheDocument();
    expect(screen.getByText("Across 806 students")).toBeInTheDocument();
  });

  // Money and counts sit in columns, so the digits have to line up.
  it("lines the digits up", () => {
    render(<Figure icon={Wallet} label="Frozen" value={4} />);
    expect(screen.getByText("4").className).toContain("tabular-nums");
  });

  it("says nothing extra when there is no hint", () => {
    render(<Figure icon={Wallet} label="Frozen" value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

/**
 * Three visits in a month is rarely three unrelated illnesses. It is the one
 * thing in the clinic's records that a single visit cannot tell you, which is
 * why it is on the dashboard rather than in a report.
 */
describe("students seen more than once", () => {
  const student = (over = {}) => ({
    id: "s-1",
    studentIdNumber: "STD-2026-001",
    visits: 3,
    user: { firstName: "Elton", lastName: "Ishimwe" },
    classSection: { name: "A" },
    ...over,
  });

  it("names them with their class and how often", () => {
    render(<RepeatVisitors students={[student()]} days={30} />);
    expect(screen.getByText("Elton Ishimwe")).toBeInTheDocument();
    expect(screen.getByText("A · STD-2026-001")).toBeInTheDocument();
    expect(screen.getByText("3 visits")).toBeInTheDocument();
  });

  it("says over what period", () => {
    render(<RepeatVisitors students={[student()]} days={30} />);
    expect(screen.getByText("In the last 30 days")).toBeInTheDocument();
  });

  it("reassures rather than showing an empty box", () => {
    render(<RepeatVisitors students={[]} days={30} />);
    expect(
      screen.getByText(/Nobody has been to the clinic twice/),
    ).toBeInTheDocument();
  });

  it("holds the shape when a student has lost their name", () => {
    render(<RepeatVisitors students={[student({ user: null })]} days={30} />);
    expect(screen.getByText("A student")).toBeInTheDocument();
  });

  it("shows placeholders while it is still counting", () => {
    const { container } = render(
      <RepeatVisitors students={undefined} days={30} isLoading />,
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Nobody has been/)).toBeNull();
  });
});

/**
 * A doorway rather than a button: a button says where it goes, a doorway says
 * why you would walk through it.
 */
describe("a doorway", () => {
  it("links to the page and says what is behind it", () => {
    render(
      <Doorway
        href="/admin/pocket-money"
        label="Pocket money"
        description="Hand out cash, top up, freeze an account"
        icon={Wallet}
      />,
    );
    const link = screen.getByRole("link", { name: /pocket money/i });
    expect(link).toHaveAttribute("href", "/admin/pocket-money");
    expect(screen.getByText(/Hand out cash/)).toBeInTheDocument();
  });
});
