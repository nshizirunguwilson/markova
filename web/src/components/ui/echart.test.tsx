import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const chart = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  return { chart, init: vi.fn(() => chart), observers: [] as Array<() => void> };
});

// echarts draws to a canvas, which jsdom does not provide. The host component
// owns lifecycle, not drawing, so the library is replaced by a recorder.
vi.mock("echarts", () => ({
  init: h.init,
}));

import { render } from "@testing-library/react";
import { EChart } from "./echart";

/** Captures the ResizeObserver callback so a resize can be simulated. */
class RecordingResizeObserver {
  constructor(private cb: () => void) {
    h.observers.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    h.observers = h.observers.filter((c) => c !== this.cb);
  }
}

beforeEach(() => {
  h.init.mockClear();
  h.chart.setOption.mockClear();
  h.chart.resize.mockClear();
  h.chart.dispose.mockClear();
  h.observers = [];
  vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
});

const option = { series: [{ type: "bar" as const, data: [1, 2, 3] }] };

describe("hosting a chart", () => {
  it("creates one chart for the container", () => {
    render(<EChart option={option} />);
    expect(h.init).toHaveBeenCalledTimes(1);
  });

  it("passes the option straight through", () => {
    render(<EChart option={option} />);
    expect(h.chart.setOption).toHaveBeenCalled();
    const [given] = h.chart.setOption.mock.calls[0];
    expect(given).toMatchObject(option);
  });

  // next/font hashes the family name, so the real one has to be read off the
  // DOM. Hardcoding it would render every chart in a fallback face while the
  // rest of the page used Poppins.
  it("stamps the font it finds on the container", () => {
    const { container } = render(<EChart option={option} />);
    const el = container.firstChild as HTMLElement;
    const [given] = h.chart.setOption.mock.calls[0] as [
      { textStyle?: { fontFamily?: string } },
    ];
    // Whatever the container computes is what the chart is told to use. jsdom
    // computes an empty family, which is fine: the point is that it is read off
    // the DOM rather than hardcoded, because next/font hashes the real name.
    expect(given.textStyle?.fontFamily).toBe(getComputedStyle(el).fontFamily);
    expect(given).toHaveProperty("textStyle");
  });

  it("replaces the option rather than merging into the last one", () => {
    render(<EChart option={option} />);
    const [, settings] = h.chart.setOption.mock.calls[0];
    expect(settings).toMatchObject({ notMerge: true });
  });

  it("redraws when the option changes", () => {
    const { rerender } = render(<EChart option={option} />);
    h.chart.setOption.mockClear();
    rerender(<EChart option={{ series: [{ type: "line", data: [4, 5] }] }} />);
    expect(h.chart.setOption).toHaveBeenCalled();
  });

  it("does not create a second chart on a rerender", () => {
    const { rerender } = render(<EChart option={option} />);
    rerender(<EChart option={{ series: [{ type: "line", data: [9] }] }} />);
    expect(h.init).toHaveBeenCalledTimes(1);
  });
});

describe("sizing", () => {
  it("takes the height it is given", () => {
    const { container } = render(<EChart option={option} height={480} />);
    expect((container.firstChild as HTMLElement).style.height).toBe("480px");
  });

  it("accepts a css height", () => {
    const { container } = render(<EChart option={option} height="60vh" />);
    expect((container.firstChild as HTMLElement).style.height).toBe("60vh");
  });

  it("fills the width it is given", () => {
    const { container } = render(<EChart option={option} />);
    expect((container.firstChild as HTMLElement).style.width).toBe("100%");
  });

  // A chart inside a collapsing sidebar keeps its old width until told.
  it("resizes the chart when its container changes size", () => {
    render(<EChart option={option} />);
    expect(h.observers).toHaveLength(1);
    h.observers[0]();
    expect(h.chart.resize).toHaveBeenCalled();
  });
});

describe("cleaning up", () => {
  // A chart left behind holds its canvas and its observer, and a dashboard that
  // navigates between tabs would accumulate one per visit.
  it("disposes the chart and stops observing on unmount", () => {
    const { unmount } = render(<EChart option={option} />);
    unmount();
    expect(h.chart.dispose).toHaveBeenCalled();
    expect(h.observers).toHaveLength(0);
  });
});
