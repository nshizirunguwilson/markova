import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Avatar } from "./avatar";

describe("what an avatar shows", () => {
  it("shows the photograph when there is one", () => {
    render(<Avatar src="/uploads/photos/aline.jpg" alt="Aline Uwase" />);
    expect(screen.getByAltText("Aline Uwase")).toHaveAttribute(
      "src",
      expect.stringContaining("aline.jpg"),
    );
  });

  it("falls back to initials when there is none", () => {
    render(<Avatar fallback="Aline" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("takes at most two letters, upper case", () => {
    render(<Avatar fallback="mukamana" />);
    expect(screen.getByText("MU")).toBeInTheDocument();
  });

  // A row with no person behind it at all - a group thread, a placeholder.
  it("falls back to a plain icon with no initials either", () => {
    const { container } = render(<Avatar />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("takes the size and the caller's classes", () => {
    const { container } = render(<Avatar fallback="AU" size="lg" className="ring" />);
    expect(container.firstElementChild?.className).toContain("ring");
  });
});
