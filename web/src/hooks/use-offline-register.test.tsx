import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: { post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  db: {
    getPendingRegisters: vi.fn(),
    deletePendingRegister: vi.fn(),
    savePendingRegister: vi.fn(),
  },
}));
vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/offline-db", async (importActual) => ({
  ...(await importActual<object>()),
  ...h.db,
}));

import { SharedComputerError } from "@/lib/offline-db";
import { neverArrived, useOfflineRegister } from "./use-offline-register";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);
const register = (id: number) => ({
  id,
  savedAt: 1,
  owner: "t-1",
  classSectionId: "section-1",
  records: [],
});

/** Registers kept on the device while the connection was down. */
describe("sending kept registers when the connection returns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.db.getPendingRegisters.mockResolvedValue([]);
    h.db.deletePendingRegister.mockResolvedValue(undefined);
    h.api.post.mockResolvedValue({ data: {} });
  });

  it("says how many were saved when there were several", async () => {
    h.db.getPendingRegisters.mockResolvedValue([register(1), register(2)]);
    renderHook(() => useOfflineRegister("t-1"), { wrapper });
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        "2 registers taken offline have been saved",
      ),
    );
    // What was sent carries no bookkeeping fields.
    expect(h.api.post.mock.calls[0][1]).toEqual({
      classSectionId: "section-1",
      records: [],
    });
    expect(h.db.deletePendingRegister).toHaveBeenCalledTimes(2);
  });

  it("speaks of one register in the singular", async () => {
    h.db.getPendingRegisters.mockResolvedValue([register(1)]);
    renderHook(() => useOfflineRegister("t-1"), { wrapper });
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        "The register taken offline has been saved",
      ),
    );
  });

  it("keeps what could not be sent and says it will try again", async () => {
    h.db.getPendingRegisters.mockResolvedValue([register(1), register(2)]);
    h.api.post
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new Error("down again"));
    renderHook(() => useOfflineRegister("t-1"), { wrapper });
    await waitFor(() =>
      expect(h.toast.warning).toHaveBeenCalledWith(
        "Saved 1 of 2 registers. The rest will be tried again.",
      ),
    );
    expect(h.db.deletePendingRegister).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the device's storage cannot be read", async () => {
    h.db.getPendingRegisters.mockRejectedValue(new Error("no storage"));
    renderHook(() => useOfflineRegister("t-1"), { wrapper });
    await act(async () => {});
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.toast.warning).not.toHaveBeenCalled();
  });
});

describe("keeping a register on the device", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.db.getPendingRegisters.mockResolvedValue([]);
    h.db.savePendingRegister.mockResolvedValue(undefined);
  });

  it("keeps it and says so", async () => {
    const { result } = renderHook(() => useOfflineRegister("t-1"), { wrapper });
    let kept = false;
    await act(async () => {
      kept = await result.current.keep({ classSectionId: "section-1" });
    });
    expect(kept).toBe(true);
    expect(h.toast.info).toHaveBeenCalled();
  });

  it("explains a shared computer in the error's own words", async () => {
    h.db.savePendingRegister.mockRejectedValue(
      new SharedComputerError("Registers"),
    );
    const { result } = renderHook(() => useOfflineRegister("t-1"), { wrapper });
    let kept = true;
    await act(async () => {
      kept = await result.current.keep({});
    });
    expect(kept).toBe(false);
    expect(String(h.toast.error.mock.calls[0][0])).toMatch(/shared computer/);
  });

  it("says plainly when the device would not keep it", async () => {
    h.db.savePendingRegister.mockRejectedValue(new Error("quota"));
    const { result } = renderHook(() => useOfflineRegister("t-1"), { wrapper });
    await act(async () => {
      await result.current.keep({});
    });
    expect(h.toast.error).toHaveBeenCalledWith(
      "Could not keep the register on this device",
    );
  });
});

describe("telling a dropped connection from a refusal", () => {
  it("is a drop only when nothing answered", () => {
    expect(
      neverArrived(Object.assign(new Error("x"), { isAxiosError: true })),
    ).toBe(true);
    expect(
      neverArrived(
        Object.assign(new Error("x"), {
          isAxiosError: true,
          response: { status: 400 },
        }),
      ),
    ).toBe(false);
    expect(neverArrived(new Error("x"))).toBe(false);
  });
});
