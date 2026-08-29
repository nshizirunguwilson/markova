import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VoiceRecorder } from "./voice-recorder";

/**
 * jsdom has neither a microphone nor a MediaRecorder, so both are stood up
 * here. What is being tested is the component's own behaviour around them:
 * what it asks for, what it does when it is refused, and whether it lets go
 * of the microphone afterwards.
 */

const stopped: string[] = [];

class FakeRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: unknown,
    public options: { mimeType: string },
  ) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

function fakeStream() {
  return {
    getTracks: () => [{ stop: () => stopped.push("track") }],
  } as unknown as MediaStream;
}

let allowMicrophone = true;

beforeEach(() => {
  stopped.length = 0;
  allowMicrophone = true;
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        if (!allowMicrophone) throw new Error("denied");
        return fakeStream();
      }),
    },
  });
  // No meter in jsdom; the component treats that as "record anyway".
  vi.stubGlobal("AudioContext", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recording a voice note", () => {
  it("offers a way to start", () => {
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /record a voice note/i }),
    ).toBeInTheDocument();
  });

  it("asks for the microphone and nothing else", async () => {
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));

    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
      }),
    );
  });

  // The composer hides its field while recording, so it must not do that for
  // a recording that never began.
  it("says when recording has actually begun", async () => {
    const onStart = vi.fn();
    render(
      <VoiceRecorder onRecorded={vi.fn()} onStart={onStart} onCancel={vi.fn()} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));

    await waitFor(() => expect(onStart).toHaveBeenCalled());
  });

  it("does not say so when the microphone was refused", async () => {
    allowMicrophone = false;
    const onStart = vi.fn();
    render(
      <VoiceRecorder onRecorded={vi.fn()} onStart={onStart} onCancel={vi.fn()} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));

    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled(),
    );
    expect(onStart).not.toHaveBeenCalled();
    // And the button is still there to try again with.
    expect(
      screen.getByRole("button", { name: /record a voice note/i }),
    ).toBeInTheDocument();
  });

  it("shows a way to send it and a way to throw it away", async () => {
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));

    expect(
      await screen.findByRole("button", { name: /send voice note/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /discard recording/i }),
    ).toBeInTheDocument();
  });

  it("hands back a file when it is sent", async () => {
    const onRecorded = vi.fn();
    render(<VoiceRecorder onRecorded={onRecorded} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record a voice note/i }));
    await user.click(
      await screen.findByRole("button", { name: /send voice note/i }),
    );

    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    const [file] = onRecorded.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    // Named after what is actually inside it, because the API stores files
    // under an extension taken from their type.
    expect(file.name).toMatch(/^voice-note-.*\.weba$/);
  });

  // A recording thrown away must never be sent.
  it("sends nothing when it is thrown away", async () => {
    const onRecorded = vi.fn();
    const onCancel = vi.fn();
    render(<VoiceRecorder onRecorded={onRecorded} onCancel={onCancel} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record a voice note/i }));
    await user.click(
      await screen.findByRole("button", { name: /discard recording/i }),
    );

    expect(onRecorded).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  /**
   * The browser shows a recording indicator for as long as a track is live.
   * A microphone left open is the one bug in this component that matters.
   */
  it("lets go of the microphone when it stops", async () => {
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record a voice note/i }));
    await user.click(
      await screen.findByRole("button", { name: /send voice note/i }),
    );

    await waitFor(() => expect(stopped).toContain("track"));
  });

  it("lets go of it when thrown away too", async () => {
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record a voice note/i }));
    await user.click(
      await screen.findByRole("button", { name: /discard recording/i }),
    );

    await waitFor(() => expect(stopped).toContain("track"));
  });

  /*
    The stop button and the discard button both act on a recorder that may
    already have stopped itself - at five minutes, or because the browser
    took the microphone away. Neither must throw.
  */
  it("copes with a recorder that has already stopped itself", async () => {
    class SelfStopping extends FakeRecorder {
      start() {
        // Reports itself inactive the moment it starts, the way a recorder
        // whose stream was taken away does.
        this.state = "inactive";
      }
    }
    vi.stubGlobal("MediaRecorder", SelfStopping);
    const onCancel = vi.fn();
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={onCancel} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record a voice note/i }));

    await user.click(
      await screen.findByRole("button", { name: /send voice note/i }),
    );
    // Nothing was recorded, so nothing is sent and the recorder stays open.
    expect(
      screen.getByRole("button", { name: /discard recording/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /discard recording/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(stopped).toContain("track");
  });

  it("lets go of it when the page moves on mid-recording", async () => {
    const { unmount } = render(
      <VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));
    await screen.findByRole("button", { name: /send voice note/i });

    unmount();

    expect(stopped).toContain("track");
  });

  // A machine with no microphone at all, where the browser does not offer
  // the API rather than refusing the request.
  it("says so when there is no microphone to ask for", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    const onStart = vi.fn();
    render(
      <VoiceRecorder onRecorded={vi.fn()} onStart={onStart} onCancel={vi.fn()} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
  });

  // An old browser, or a page not served over HTTPS, where MediaRecorder is
  // simply absent.
  it("says so rather than doing nothing when it cannot record", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const onStart = vi.fn();
    render(
      <VoiceRecorder onRecorded={vi.fn()} onStart={onStart} onCancel={vi.fn()} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot record/i);
    expect(onStart).not.toHaveBeenCalled();
  });
});

/**
 * The live meter: an analyser on the same stream, read once a frame. The
 * recording itself is untouched by it, so a browser that cannot do it still
 * records perfectly well.
 */
describe("the meter while recording", () => {
  function stubAnalyser(level: number) {
    const connect = vi.fn();
    vi.stubGlobal(
      "AudioContext",
      class {
        close = vi.fn(async () => {});
        createAnalyser = () => ({
          fftSize: 0,
          frequencyBinCount: 4,
          getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(level),
        });
        createMediaStreamSource = () => ({ connect });
      },
    );
    // One frame, then stop, so the loop does not run forever under a test.
    let frames = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      if (frames++ < 2) setTimeout(() => cb(0), 0);
      return frames;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    return connect;
  }

  it("listens to the same stream it is recording", async () => {
    const connect = stubAnalyser(200);
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));

    await waitFor(() => expect(connect).toHaveBeenCalled());
  });

  it("draws what it hears", async () => {
    stubAnalyser(220);
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /record a voice note/i }));

    await waitFor(() => {
      const heights = [
        ...document.querySelectorAll('[aria-hidden="true"] > span'),
      ].map((b) => parseInt((b as HTMLElement).style.height, 10));
      expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights));
    });
  });

  // The recording is what matters; a browser with no analyser still records.
  it("records anyway when there is no meter to be had", async () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("no audio context here");
        }
      },
    );
    const onRecorded = vi.fn();
    render(<VoiceRecorder onRecorded={onRecorded} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record a voice note/i }));
    await user.click(
      await screen.findByRole("button", { name: /send voice note/i }),
    );

    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
  });
});

/** It counts, and it stops itself. */
describe("how long it has been recording", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts the seconds", async () => {
    render(<VoiceRecorder onRecorded={vi.fn()} onCancel={vi.fn()} />);
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: /record a voice note/i }));
    await screen.findByRole("button", { name: /send voice note/i });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("0:03")).toBeInTheDocument();
  });

  /*
    Five minutes is a phone call, and a recorder left running by accident
    should not become a fifty megabyte upload. Kept rather than thrown away:
    the person was mid-sentence, not mid-mistake.
  */
  it("stops itself at five minutes and keeps what it has", async () => {
    const onRecorded = vi.fn();
    render(<VoiceRecorder onRecorded={onRecorded} onCancel={vi.fn()} />);
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole("button", { name: /record a voice note/i }));
    await screen.findByRole("button", { name: /send voice note/i });

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(onRecorded).toHaveBeenCalled();
    expect(onRecorded.mock.calls[0][1]).toBeGreaterThanOrEqual(300);
  });
});
