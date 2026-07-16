"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/**
 * Thin ECharts host: owns init/dispose, tracks container size, and stamps the
 * app's real font (next/font hashes the family name, so it must be read off
 * the DOM, not hardcoded).
 */
export function EChart({
  option,
  height = 320,
}: {
  option: echarts.EChartsOption;
  height?: number | string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    const chart = chartRef.current;
    if (!el || !chart) return;
    const fontFamily = getComputedStyle(el).fontFamily;
    chart.setOption(
      { textStyle: { fontFamily }, ...option },
      { notMerge: true },
    );
  }, [option]);

  return <div ref={ref} style={{ height, width: "100%" }} />;
}
