/**
 * Chart palettes and semantic chart colours, mirrored from design/tokens.json.
 *
 * Recharts takes colours as props rather than classes, so these cannot come
 * from Tailwind utilities. Keep them in step with `--color-chart-*` and
 * `--color-category-*` in tokens.css; `scripts/check-contrast.mjs` asserts the
 * categorical values stay legible under white labels.
 */

/** Sequential brand ramp for one measure split into parts. Fills, not text. */
export const CHART_SERIES = [
  "#1B4F72",
  "#2E86C1",
  "#5DADE2",
  "#85C1E9",
  "#AED6F1",
] as const;

/** Distinct hues for unordered categories; each clears 4.5:1 against white. */
export const CHART_CATEGORICAL = [
  "#1B4F72",
  "#117A65",
  "#9A6208",
  "#7D3C98",
  "#943126",
  "#1A5276",
  "#0E6655",
  "#6C3483",
  "#A04000",
  "#21618C",
] as const;

/** Semantic colours for series that mean something specific. */
export const CHART_COLOR = {
  brand: "#1B4F72",
  brandLight: "#2E86C1",
  success: "#0E7C4A",
  warning: "#B45309",
  danger: "#C0392B",
  grid: "#E2E8F0",
  axis: "#5F6E85",
} as const;

/** Default brand colour offered in the branding colour picker. */
export const DEFAULT_BRAND_COLOR = "#1B4F72";
