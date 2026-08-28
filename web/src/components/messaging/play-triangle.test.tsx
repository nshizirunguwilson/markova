import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { PlayTriangle } from "./play-triangle";

/**
 * A triangle's weight is toward its base, so one centred by its bounding box
 * looks left of centre. Icon sets work around it with a margin nudge, and
 * every nudge is a guess — ours was 4px on a 24px icon, which overshot.
 */
describe("a play triangle that centres itself", () => {
  /** The centroid of a triangle is the mean of its three corners. */
  function centroidOf(path: string) {
    const points = [...path.matchAll(/([\d.]+)\s+([\d.]+)/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
    return {
      x: points.reduce((a, p) => a + p.x, 0) / points.length,
      y: points.reduce((a, p) => a + p.y, 0) / points.length,
      corners: points.length,
    };
  }

  it("balances on the middle of its box", () => {
    const { container } = render(<PlayTriangle />);
    const d = container.querySelector("path")!.getAttribute("d")!;
    const c = centroidOf(d);

    expect(c.corners).toBe(3);
    // The box is 24 units, so its middle is 12 on both axes.
    expect(c.x).toBeCloseTo(12, 5);
    expect(c.y).toBeCloseTo(12, 5);
  });

  // The whole point: no margin to tune, and none to get wrong.
  it("carries no nudge of its own", () => {
    const { container } = render(<PlayTriangle />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class") ?? "").not.toMatch(/\bm[lrtb]?-/);
  });

  it("points to the right", () => {
    const { container } = render(<PlayTriangle />);
    const d = container.querySelector("path")!.getAttribute("d")!;
    const xs = [...d.matchAll(/([\d.]+)\s+[\d.]+/g)].map((m) => Number(m[1]));
    // Two corners share the base on the left, one tip sits to the right.
    expect(Math.max(...xs)).toBeGreaterThan(Math.min(...xs));
    expect(xs.filter((x) => x === Math.min(...xs))).toHaveLength(2);
  });

  it("takes its colour from whatever contains it", () => {
    const { container } = render(<PlayTriangle />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "stroke",
      "currentColor",
    );
  });

  it("takes a size from the caller", () => {
    const { container } = render(<PlayTriangle className="h-6 w-6" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("h-6");
  });

  // It is decoration beside a real label, never the label itself.
  it("is hidden from a screen reader", () => {
    const { container } = render(<PlayTriangle />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
