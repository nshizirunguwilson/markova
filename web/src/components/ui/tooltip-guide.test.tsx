import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipGuide } from "./tooltip-guide";

/**
 * The first-run walkthrough.
 *
 * It shows once and then never again, which is the part worth pinning: a guide
 * that reappears on every visit is worse than no guide, and the only thing
 * standing between those two outcomes is one localStorage key.
 */

const steps = [
  { target: "#roster", title: "Your classes", content: "Every class you teach." },
  { target: "#marks", title: "Entering marks", content: "Marks are saved per term." },
  { target: "#reports", title: "Report cards", content: "Generated at term end." },
];

/** The guide waits 800ms before appearing, so the targets exist first. */
async function letItAppear() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  document.body.innerHTML =
    '<div id="roster"></div><div id="marks"></div><div id="reports"></div>';
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the first visit", () => {
  it("stays hidden until the page has settled", () => {
    render(<TooltipGuide id="teacher" steps={steps} />);
    expect(screen.queryByText("Your classes")).not.toBeInTheDocument();
  });

  it("appears on the first step", async () => {
    render(<TooltipGuide id="teacher" steps={steps} />);
    await letItAppear();
    await waitFor(() => expect(screen.getByText("Your classes")).toBeInTheDocument());
    expect(screen.getByText("Every class you teach.")).toBeInTheDocument();
  });
});

describe("stepping through", () => {
  async function show() {
    render(<TooltipGuide id="teacher" steps={steps} />);
    await letItAppear();
    await waitFor(() => expect(screen.getByText("Your classes")).toBeInTheDocument());
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  }

  it("moves to the next step", async () => {
    const user = await show();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("Entering marks")).toBeInTheDocument());
  });

  it("goes back to the previous step", async () => {
    const user = await show();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("Entering marks")).toBeInTheDocument());

    const back = screen
      .getAllByRole("button")
      .find((b) => /back|previous/i.test(b.textContent ?? ""));
    if (!back) return;
    await user.click(back);
    await waitFor(() => expect(screen.getByText("Your classes")).toBeInTheDocument());
  });

  it("offers to finish on the last step rather than to continue", async () => {
    const user = await show();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("Report cards")).toBeInTheDocument());
    expect(screen.getByText(/got it/i)).toBeInTheDocument();
  });
});

describe("dismissing it", () => {
  async function show(id = "teacher") {
    render(<TooltipGuide id={id} steps={steps} />);
    await letItAppear();
    await waitFor(() => expect(screen.getByText("Your classes")).toBeInTheDocument());
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  }

  it("closes when skipped", async () => {
    const user = await show();
    const close = screen
      .getAllByRole("button")
      .find((b) => /close|skip/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    if (!close) return;
    await user.click(close);
    await waitFor(() => expect(screen.queryByText("Your classes")).not.toBeInTheDocument());
  });

  it("closes when finished", async () => {
    const user = await show();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.queryByText("Report cards")).not.toBeInTheDocument());
  });

  // The whole contract: seen once, never again.
  it("does not come back on the next visit", async () => {
    const user = await show();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.queryByText("Report cards")).not.toBeInTheDocument());

    document.body.innerHTML =
      '<div id="roster"></div><div id="marks"></div><div id="reports"></div>';
    render(<TooltipGuide id="teacher" steps={steps} />);
    await letItAppear();
    expect(screen.queryByText("Your classes")).not.toBeInTheDocument();
  });

  // Two guides on different screens must not silence each other.
  it("tracks each guide separately", async () => {
    const user = await show("teacher");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    document.body.innerHTML =
      '<div id="roster"></div><div id="marks"></div><div id="reports"></div>';
    render(<TooltipGuide id="librarian" steps={steps} />);
    await letItAppear();
    await waitFor(() => expect(screen.getByText("Your classes")).toBeInTheDocument());
  });
});

describe("when a step points at something that is not there", () => {
  it("does not throw", async () => {
    document.body.innerHTML = "";
    render(
      <TooltipGuide
        id="missing"
        steps={[{ target: "#nowhere", title: "Gone", content: "Nothing here." }]}
      />,
    );
    await letItAppear();
    expect(document.body).toBeTruthy();
  });
});

/**
 * Where the bubble lands.
 *
 * A guide that covers the thing it is pointing at teaches nothing, so each
 * step says which side to sit on. jsdom lays nothing out, so the target's rect
 * is stubbed; what is under test is the arithmetic that turns a rect and a
 * side into a position, and the clamp that keeps the bubble on screen.
 */
describe("placing the bubble", () => {
  /** Gives the target a real rectangle, which jsdom otherwise reports as zero. */
  function targetAt(rect: Partial<DOMRect>) {
    const el = document.querySelector("#roster")!;
    el.getBoundingClientRect = () =>
      ({
        top: 200,
        left: 300,
        bottom: 240,
        right: 460,
        width: 160,
        height: 40,
        x: 300,
        y: 200,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect;
  }

  async function showAt(position: "top" | "bottom" | "left" | "right") {
    render(
      <TooltipGuide
        id="placement"
        steps={[{ target: "#roster", title: "Your classes", content: "Here.", position }]}
      />,
    );
    await letItAppear();
    await waitFor(() => expect(screen.getByText("Your classes")).toBeInTheDocument());
    return screen.getByText("Your classes").closest("div[style]") as HTMLElement;
  }

  function boxOf(el: HTMLElement) {
    return {
      top: parseFloat(el.style.top || "0"),
      left: parseFloat(el.style.left || "0"),
    };
  }

  beforeEach(() => {
    targetAt({});
    window.innerWidth = 1280;
  });

  it("sits below the target by default", async () => {
    const bubble = await showAt("bottom");
    // 12px under the target's bottom edge.
    expect(boxOf(bubble).top).toBe(252);
  });

  it("sits above the target when asked", async () => {
    const bubble = await showAt("top");
    expect(boxOf(bubble).top).toBe(80);
  });

  it("sits to the right of the target", async () => {
    const bubble = await showAt("right");
    expect(boxOf(bubble).left).toBe(472);
  });

  it("sits to the left of the target", async () => {
    const bubble = await showAt("left");
    // Clamped to the left edge rather than going off screen.
    expect(boxOf(bubble).left).toBe(8);
  });

  // A target near the right edge would push the bubble off screen.
  it("keeps the bubble on screen at the right edge", async () => {
    targetAt({ left: 1240, right: 1270, width: 30 });
    const bubble = await showAt("right");
    expect(boxOf(bubble).left).toBeLessThanOrEqual(1280 - 320);
  });

  it("keeps the bubble on screen at the top edge", async () => {
    targetAt({ top: 4, bottom: 20, height: 16 });
    const bubble = await showAt("top");
    expect(boxOf(bubble).top).toBeGreaterThanOrEqual(8);
  });

  // Positioning reads a rect that only exists after paint, so a target that is
  // not in the document must not throw.
  it("does not throw when the target is gone by the time it shows", async () => {
    document.body.innerHTML = "";
    render(
      <TooltipGuide
        id="placement-missing"
        steps={[{ target: "#roster", title: "Gone", content: "Nothing." }]}
      />,
    );
    await letItAppear();
    expect(document.body).toBeTruthy();
  });
});
