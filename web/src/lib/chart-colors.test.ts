import { describe, it, expect } from "vitest";
import { CHART_SERIES, CHART_CATEGORICAL, CHART_COLOR } from "./chart-colors";

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#FFFFFF";

describe("chart palettes", () => {
  it("uses well-formed six-digit hex throughout", () => {
    for (const c of [...CHART_SERIES, ...CHART_CATEGORICAL, ...Object.values(CHART_COLOR)]) {
      expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("keeps categorical fills legible under white labels", () => {
    // These colour timetable subject blocks, which carry white text on top.
    for (const c of CHART_CATEGORICAL) {
      expect(contrast(WHITE, c), `${c} vs white`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps categorical hues distinguishable from each other", () => {
    expect(new Set(CHART_CATEGORICAL).size).toBe(CHART_CATEGORICAL.length);
  });

  it("orders the brand ramp light-to-dark without repeats", () => {
    const lums = CHART_SERIES.map(luminance);
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i]).toBeGreaterThan(lums[i - 1]);
    }
  });

  it("keeps semantic chart colours readable as text on white", () => {
    for (const key of ["success", "warning", "danger", "brand"] as const) {
      expect(contrast(CHART_COLOR[key], WHITE), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("matches the semantic tokens in design/tokens.json", () => {
    // Drift here means a chart says "pass" in a different green from the badge
    // next to it.
    expect(CHART_COLOR.brand).toBe("#1B4F72");
    expect(CHART_COLOR.success).toBe("#0E7C4A");
    expect(CHART_COLOR.warning).toBe("#B45309");
    expect(CHART_COLOR.danger).toBe("#C0392B");
  });
});
