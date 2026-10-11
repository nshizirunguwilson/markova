import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const out = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sign-out", () => out);

import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beginSession } from "@/lib/session";
import { idleState, useIdleSignOut } from "./use-idle-sign-out";
import { IdleWarning } from "@/components/layout/idle-warning";

const MIN = 60 * 1000;

describe("where a sign in stands", () => {
  it("is in use, then asks, then is over", () => {
    expect(idleState(8.9 * MIN, 0, 10 * MIN)).toEqual({ kind: "active" });
    expect(idleState(9.5 * MIN, 0, 10 * MIN)).toEqual({ kind: "warning", secondsLeft: 30 });
    expect(idleState(10 * MIN, 0, 10 * MIN)).toEqual({ kind: "out" });
  });
});

/** A computer nobody is using signs itself out (B5). */
describe("signing out a computer nobody is using", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    out.signOut.mockClear();
    router.replace.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("asks a minute before, then signs a shared computer out after ten minutes", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    const { result } = renderHook(() => useIdleSignOut(true), { wrapper });

    await act(async () => vi.advanceTimersByTime(9 * MIN + 1000));
    expect(result.current.state.kind).toBe("warning");
    expect(out.signOut).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(MIN));
    expect(out.signOut).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/login?signedOut=idle");
  });

  it("gives somebody's own computer an hour", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: false });
    const { result } = renderHook(() => useIdleSignOut(true), { wrapper });
    await act(async () => vi.advanceTimersByTime(30 * MIN));
    expect(result.current.state.kind).toBe("active");
    await act(async () => vi.advanceTimersByTime(30 * MIN));
    expect(out.signOut).toHaveBeenCalled();
  });

  it("starts again whenever the computer is used", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    const { result } = renderHook(() => useIdleSignOut(true), { wrapper });
    await act(async () => vi.advanceTimersByTime(8 * MIN));
    await act(async () => {
      fireEvent.keyDown(window, { key: "a" });
      vi.advanceTimersByTime(8 * MIN);
    });
    expect(result.current.state.kind).toBe("active");
    expect(out.signOut).not.toHaveBeenCalled();
  });

  it("stays signed in when the person says they are still there", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    const { result } = renderHook(() => useIdleSignOut(true), { wrapper });
    await act(async () => vi.advanceTimersByTime(9.5 * MIN));
    expect(result.current.state.kind).toBe("warning");
    await act(async () => result.current.stillHere());
    expect(result.current.state.kind).toBe("active");
    await act(async () => vi.advanceTimersByTime(2 * MIN));
    expect(out.signOut).not.toHaveBeenCalled();
  });

  it("counts moving the mouse as use", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    renderHook(() => useIdleSignOut(true), { wrapper });
    await act(async () => vi.advanceTimersByTime(8 * MIN));
    sessionStorage.setItem("markova_last_activity", String(Date.now() - 8 * MIN));
    await act(async () => {
      for (let i = 0; i < 20; i++) fireEvent.mouseMove(window);
    });
    expect(Number(sessionStorage.getItem("markova_last_activity"))).toBe(Date.now());
    // A burst inside a few seconds is one use, not twenty writes.
    sessionStorage.setItem("markova_last_activity", "1");
    await act(async () => fireEvent.mouseMove(window));
    expect(sessionStorage.getItem("markova_last_activity")).toBe("1");
  });

  it("starts counting from now when no use was ever recorded", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    const { result } = renderHook(() => useIdleSignOut(true), { wrapper });
    sessionStorage.removeItem("markova_last_activity");
    await act(async () => vi.advanceTimersByTime(1000));
    expect(result.current.state.kind).toBe("active");
  });

  it("keeps counting in a browser that refuses storage", async () => {
    beginSession({ accessToken: "a", refreshToken: "r", sharedDevice: true });
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useIdleSignOut(true), { wrapper });
    await act(async () => vi.advanceTimersByTime(2000));
    expect(result.current.state.kind).toBe("active");
    spy.mockRestore();
  });

  it("does nothing before anybody signs in", async () => {
    renderHook(() => useIdleSignOut(false), { wrapper });
    await act(async () => vi.advanceTimersByTime(120 * MIN));
    expect(out.signOut).not.toHaveBeenCalled();
  });
});

describe("the warning", () => {
  it("counts down and offers to stay", () => {
    const onStay = vi.fn();
    render(<IdleWarning state={{ kind: "warning", secondsLeft: 42 }} onStay={onStay} />);
    expect(screen.getByRole("timer")).toHaveTextContent("signed out in 42 seconds");
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(onStay).toHaveBeenCalled();
  });

  it("says one second, not one seconds", () => {
    render(<IdleWarning state={{ kind: "warning", secondsLeft: 1 }} onStay={() => {}} />);
    expect(screen.getByRole("timer")).toHaveTextContent("in 1 second,");
  });

  it("shows nothing while the computer is in use", () => {
    const { container } = render(<IdleWarning state={{ kind: "active" }} onStay={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
