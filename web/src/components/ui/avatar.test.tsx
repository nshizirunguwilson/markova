import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Avatar } from "./avatar";
import { clearGeneratedAvatars } from "@/lib/avatar";

beforeEach(() => {
  clearGeneratedAvatars();
});

describe("what an avatar shows", () => {
  it("shows the photograph when there is one", () => {
    render(<Avatar src="/uploads/photos/aline.jpg" alt="Aline Uwase" />);
    expect(screen.getByAltText("Aline Uwase")).toHaveAttribute(
      "src",
      expect.stringContaining("aline.jpg"),
    );
  });

  /**
   * No photograph but we know who this is: a drawn face rather than initials.
   * A register of fourteen hundred rows of "AU" and "AM" is a wall nobody can
   * read down.
   */
  it("draws a face when there is no photograph", () => {
    const { container } = render(<Avatar seed="u-1" alt="Aline Uwase" fallback="AU" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.queryByText("AU")).toBeNull();
  });

  it("prefers a real photograph over a drawn one", () => {
    render(<Avatar src="/uploads/photos/aline.jpg" seed="u-1" alt="Aline Uwase" />);
    expect(screen.getByAltText("Aline Uwase")).toHaveAttribute(
      "src",
      expect.stringContaining("aline.jpg"),
    );
  });

  // Rows that are not a person — a group thread, a placeholder — keep the
  // lettering they have always had.
  it("falls back to initials with nobody to draw", () => {
    render(<Avatar fallback="Aline" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to a plain icon with no initials either", () => {
    const { container } = render(<Avatar />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps the size and the caller's classes on a drawn face", () => {
    const { container } = render(<Avatar seed="u-1" size="lg" className="ring" />);
    expect(container.querySelector("img")?.className).toContain("ring");
  });
});
