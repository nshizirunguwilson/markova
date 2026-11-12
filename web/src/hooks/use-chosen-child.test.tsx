import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useChosenChild } from "./use-children";
import { useChildStore } from "@/stores/child-store";

const keza = { id: "keza" };
const mugisha = { id: "mugisha" };

describe("the child a parent is looking at", () => {
  it("is the first child until the parent picks", () => {
    const { result } = renderHook(() => useChosenChild([keza, mugisha]));
    expect(result.current[0]).toBe("keza");
  });

  it("is nobody while the children are still loading", () => {
    expect(renderHook(() => useChosenChild(undefined)).result.current[0]).toBe("");
    expect(renderHook(() => useChosenChild([])).result.current[0]).toBe("");
  });

  // The finding: Marks and Attendance each kept their own choice.
  it("carries from one page to the next", () => {
    const marks = renderHook(() => useChosenChild([keza, mugisha]));
    act(() => marks.result.current[1]("mugisha"));
    marks.unmount();

    const attendance = renderHook(() => useChosenChild([keza, mugisha]));
    expect(attendance.result.current[0]).toBe("mugisha");
  });

  // Somebody else signed in on the same computer without a reload.
  it("ignores a choice that is not one of this parent's children", () => {
    useChildStore.getState().choose("somebody-else");
    const { result } = renderHook(() => useChosenChild([keza, mugisha]));
    expect(result.current[0]).toBe("keza");
  });

  it("is forgotten on demand", () => {
    useChildStore.getState().choose("mugisha");
    useChildStore.getState().forget();
    const { result } = renderHook(() => useChosenChild([keza, mugisha]));
    expect(result.current[0]).toBe("keza");
  });
});
