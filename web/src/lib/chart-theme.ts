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

export const axisLabel = { color: viz.muted, fontSize: 11 };

export const splitLine = { lineStyle: { color: viz.grid } };

export const tooltipStyle = {
  backgroundColor: "#ffffff",
  borderColor: "#e2e8f0",
  borderWidth: 1,
  padding: [8, 12] as [number, number],
  textStyle: { color: viz.ink, fontSize: 12 },
  extraCssText: "box-shadow: 0 6px 16px -4px rgb(16 24 40 / 0.12); border-radius: 8px;",
};

export const legendStyle = {
  icon: "circle",
  itemWidth: 9,
  itemHeight: 9,
  itemGap: 18,
  textStyle: { color: viz.muted, fontSize: 12 },
};
