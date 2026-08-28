import { beforeEach, describe, expect, it } from "vitest";

import { clearGeneratedAvatars, generatedAvatar } from "./avatar";

beforeEach(() => {
  clearGeneratedAvatars();
});

describe("a drawn face for somebody with no photograph", () => {
  it("draws an SVG", () => {
    const face = generatedAvatar("u-1");
    expect(face).toMatch(/^data:image\/svg\+xml/);
  });

  // Seeded by id, so a child's face does not change when they are renamed,
  // and a face is recognisably theirs across every screen it appears on.
  it("draws the same face for the same person every time", () => {
    expect(generatedAvatar("u-1")).toBe(generatedAvatar("u-1"));
  });

  it("draws different faces for different people", () => {
    expect(generatedAvatar("u-1")).not.toBe(generatedAvatar("u-2"));
  });

  // Callers pass whatever id they hold, which for a half-loaded row is
  // nothing. Those fall back to initials rather than to a face for "".
  it("draws nothing without a person to draw", () => {
    expect(generatedAvatar(null)).toBeNull();
    expect(generatedAvatar(undefined)).toBeNull();
    expect(generatedAvatar("")).toBeNull();
  });

  /**
   * Drawing costs milliseconds and a searched list re-renders on every
   * keystroke, so a face already drawn is reused rather than redrawn.
   */
  it("keeps a face it has already drawn", () => {
    const first = generatedAvatar("u-1");
    expect(generatedAvatar("u-1")).toBe(first);
    clearGeneratedAvatars();
    // Cleared and redrawn: still the same picture, since the seed decides it.
    expect(generatedAvatar("u-1")).toBe(first);
  });

  // A teacher paging through fourteen hundred students would otherwise hold
  // every face they had scrolled past.
  it("forgets the oldest rather than growing without end", () => {
    for (let i = 0; i < 520; i += 1) generatedAvatar(`u-${i}`);
    // Still correct after eviction, which is the part that matters.
    expect(generatedAvatar("u-0")).toBe(generatedAvatar("u-0"));
    expect(generatedAvatar("u-519")).toMatch(/^data:image\/svg\+xml/);
  });
});
