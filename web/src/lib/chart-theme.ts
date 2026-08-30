// Chart color system, validated with the dataviz palette checker against the
// white card surface (CVD separation, normal-vision floor, contrast).

export const viz = {
  // Categorical slots, fixed order - assigned by entity, never cycled.
  series: [
    "#2a78d6",
    "#008300",
    "#e87ba4",
    "#eda100",
    "#1baf7a",
    "#eb6834",
    "#4a3aa7",
    "#e34948",
  ],
  // Sequential blue ramp (magnitude): light = near zero, dark = high.
  blueRamp: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  navy: "#1c5cab",
  band: "#cde2fb",
  // Attendance states (blue/amber/red passes every check incl. contrast).
  attendance: { present: "#2a78d6", late: "#c98500", absent: "#d03b3b" },
  // Enrollment pair - magenta is sub-3:1 on white, so bars carry direct labels.
  gender: { male: "#2a78d6", female: "#e87ba4" },
  ink: "#1a1a2e",
  muted: "#6b7280",
  grid: "#edf1f6",
} as const;

/**
 * The chart furniture, which is the part of a chart that has to change theme.
 *
 * A chart is two things: the data, drawn in the validated palette above, and
 * the chrome around it - axis labels, grid lines, the tooltip card. The data
 * colours are chosen for separation from each other and carry direct labels,
 * so they hold on either ground. The chrome is text and hairlines on the
 * card, and near-black labels with near-white grid lines on a dark card is
 * simply an unreadable chart.
 *
 * ECharts wants concrete colours rather than CSS variables, so these are
 * resolved values rather than `var(--tone-muted)`, and they are functions of
 * the theme rather than constants. They mirror the token file: any change
 * there has to be made here too, which a test holds them to.
 */
export type ChartTheme = "light" | "dark";

const CHROME = {
  light: {
    ink: "#1E293B",
    muted: "#5F6E85",
    grid: "#edf1f6",
    surface: "#ffffff",
    border: "#e2e8f0",
    shadow: "rgb(16 24 40 / 0.12)",
  },
  dark: {
    ink: "#E8EEF6",
    muted: "#93A3B8",
    grid: "#233248",
    surface: "#151E2E",
    border: "#35455C",
    shadow: "rgb(0 0 0 / 0.5)",
  },
} as const;

export const chartChrome = (theme: ChartTheme = "light") => {
  const c = CHROME[theme];
  return {
    axisLabel: { color: c.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: c.grid } },
    tooltipStyle: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      padding: [8, 12] as [number, number],
      textStyle: { color: c.ink, fontSize: 12 },
      extraCssText: `box-shadow: 0 6px 16px -4px ${c.shadow}; border-radius: 8px;`,
    },
    legendStyle: {
      icon: "circle",
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 18,
      textStyle: { color: c.muted, fontSize: 12 },
    },
  };
};

/*
  The light chrome, still exported under its old names so that a chart which
  has not been converted yet renders exactly as it did rather than breaking.
*/
export const { axisLabel, splitLine, tooltipStyle, legendStyle } =
  chartChrome("light");
