import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VideoPlayer } from "./video-player";

/** The clip, whatever else is on the page. */
const clip = () => document.querySelector("video")!;

/** jsdom implements no playback, so `paused` is stated and events are fired. */
function stub(video: HTMLVideoElement, { paused = true } = {}) {
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  Object.defineProperty(video, "play", { value: play, configurable: true });
  Object.defineProperty(video, "pause", { value: pause, configurable: true });
  Object.defineProperty(video, "paused", { value: paused, configurable: true });
  return { play, pause };
}

describe("a video with controls of our own", () => {
  it("does not use the browser's", () => {
    render(<VideoPlayer src="/uploads/a.mp4" />);
    expect(clip()).not.toHaveAttribute("controls");
  });

  // Enough to draw the first frame and know the length, without pulling
  // fifty megabytes down a mobile line for a clip nobody plays.
  it("does not download the whole clip before it is played", () => {
    render(<VideoPlayer src="/uploads/a.mp4" />);
    expect(clip()).toHaveAttribute("preload", "metadata");
  });

  it("plays from the button", async () => {
    render(<VideoPlayer src="/uploads/a.mp4" />);
    const { play } = stub(clip());
    await userEvent.setup().click(screen.getByRole("button", { name: /play video/i }));
    expect(play).toHaveBeenCalled();
  });

  it("pauses once it is running", async () => {
    render(<VideoPlayer src="/uploads/a.mp4" />);
    const video = clip();
    const { pause } = stub(video, { paused: false });
    act(() => {
      video.dispatchEvent(new Event("play"));
    });
    await userEvent.setup().click(await screen.findByRole("button", { name: /pause video/i }));
    expect(pause).toHaveBeenCalled();
  });

  // Tapping a small control on a phone is a worse first move than tapping the
  // clip, so there is a large target until it has been started.
  it("offers the whole frame as a target until it starts", () => {
    const { container } = render(<VideoPlayer src="/uploads/a.mp4" />);
    const overlay = container.querySelector('[aria-hidden="true"].absolute.inset-0');
    expect(overlay).toBeInTheDocument();

    act(() => {
      clip().dispatchEvent(new Event("play"));
    });
    expect(container.querySelector('[aria-hidden="true"].absolute.inset-0')).toBeNull();
  });

  /*
    That big target does the same thing as the play button in the bar, so it
    is kept out of the accessibility tree — two identical controls with no way
    to tell them apart is worse than one.
  */
  it("announces only one play control", () => {
    render(<VideoPlayer src="/uploads/a.mp4" />);
    expect(screen.getAllByRole("button", { name: /play video/i })).toHaveLength(1);
  });

  it("counts the clip out as it plays", () => {
    render(<VideoPlayer src="/uploads/a.mp4" />);
    const video = clip();
    Object.defineProperty(video, "duration", { value: 90, configurable: true });
    act(() => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });
    Object.defineProperty(video, "currentTime", { value: 30, configurable: true, writable: true });
    act(() => {
      video.dispatchEvent(new Event("timeupdate"));
    });

    expect(screen.getByText("0:30 / 1:30")).toBeInTheDocument();
  });

  it("jumps to the point on the bar that was clicked", () => {
    const { container } = render(<VideoPlayer src="/uploads/a.mp4" />);
    const video = clip();
    Object.defineProperty(video, "duration", { value: 60, configurable: true });
    act(() => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });

    const bar = container.querySelector('[role="presentation"]')!;
    bar.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    fireEvent.click(bar, { clientX: 25 });

    expect(video.currentTime).toBe(15);
  });

  // The length is not known until the metadata loads, and dividing by it
  // before then would set a nonsense time.
  it("does nothing on the bar while the length is unknown", () => {
    const { container } = render(<VideoPlayer src="/uploads/a.mp4" />);
    const bar = container.querySelector('[role="presentation"]')!;
    bar.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    fireEvent.click(bar, { clientX: 50 });
    expect(clip().currentTime).toBe(0);
  });

  it("mutes and unmutes", async () => {
    render(<VideoPlayer src="/uploads/a.mp4" />);
    await userEvent.setup().click(screen.getByRole("button", { name: /mute video/i }));
    expect(clip().muted).toBe(true);
    expect(await screen.findByRole("button", { name: /unmute video/i })).toBeInTheDocument();
  });

  it("offers a way to open it larger, when there is one", async () => {
    const onExpand = vi.fn();
    render(<VideoPlayer src="/uploads/a.mp4" onExpand={onExpand} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /open video larger/i }));
    expect(onExpand).toHaveBeenCalled();
  });

  it("offers none when there is nowhere larger to go", () => {
    render(<VideoPlayer src="/uploads/a.mp4" />);
    expect(screen.queryByRole("button", { name: /open video larger/i })).toBeNull();
  });
});
