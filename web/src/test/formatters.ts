/**
 * Poking every chart callback a page handed to ECharts.
 *
 * These run only when a pointer touches a chart, so no render-based test
 * reaches them, and a formatter that throws takes its whole chart down. Six of
 * them were throwing on an ordinary hover when this was first written.
 */
export type ChartOption = Record<string, unknown>;

/** Every `formatter` function anywhere in the recorded chart options. */
export function collectFormatters(options: ChartOption[]) {
  const found: Array<(p: unknown) => unknown> = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "formatter" && typeof value === "function") {
        found.push(value as (p: unknown) => unknown);
      } else if (typeof value === "object") {
        walk(value);
      }
    }
  };

  options.forEach(walk);
  return found;
}

/**
 * The shapes ECharts actually passes: a single point, an array for a shared
 * axis, a point with no data, and an axis label's bare value.
 */
export const HOVER_SHAPES: unknown[] = [
  { name: "Senior 1 A", value: 73.1, data: [0, 0, 42], seriesName: "Average", dataIndex: 0 },
  [{ name: "Senior 1 A", value: 73.1, data: [0, 0, 42], seriesName: "Average", dataIndex: 0 }],
  { name: "Nowhere", value: 0, data: [9, 9, 0], seriesName: "Average", dataIndex: 99 },
  { name: "", value: undefined, dataIndex: 0 },
  {},
  [],
  "2026-08-21",
  0,
];

/** Runs every formatter against every shape, returning what broke. */
export function findThrowingFormatters(options: ChartOption[]) {
  const failures: string[] = [];
  collectFormatters(options).forEach((format, index) => {
    for (const shape of HOVER_SHAPES) {
      try {
        format(shape);
      } catch (error) {
        failures.push(`formatter #${index}: ${(error as Error).message}`);
      }
    }
  });
  return failures;
}
