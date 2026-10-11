import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useAuthStore } from "@/stores/auth-store";
import { WhatParentsSee } from "./what-parents-see";

const sharing = (over: Record<string, unknown> = {}) => ({
  adult: true,
  knowsBirthday: true,
  results: true,
  conduct: true,
  health: true,
  changedAt: null,
  ...over,
});

const show = (role = "STUDENT") => {
  useAuthStore.setState({ user: { id: "u", role } as never, isAuthenticated: true });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <WhatParentsSee />
    </QueryClientProvider>,
  );
};

/** A student of 18 deciding what their parents see (A8). */
describe("what your parents can see", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("gives an adult three switches, all on", async () => {
    api.get.mockResolvedValue({ data: sharing() });
    show();
    for (const name of ["Results", "Attendance and discipline", "Health visits"]) {
      expect(await screen.findByRole("switch", { name: new RegExp(name) })).toBeChecked();
    }
  });

  it("turns one off, and only that one", async () => {
    api.get.mockResolvedValue({ data: sharing() });
    api.put.mockResolvedValue({ data: sharing({ health: false }) });
    show();
    fireEvent.click(await screen.findByRole("switch", { name: /Health visits/ }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/students/me/sharing", { health: false }),
    );
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /Health visits/ })).not.toBeChecked(),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("says what went wrong", async () => {
    api.get.mockResolvedValue({ data: sharing() });
    api.put.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Not yet" } },
    });
    show();
    fireEvent.click(await screen.findByRole("switch", { name: /Results/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not yet"));
  });

  it("tells a student under 18 when it becomes theirs", async () => {
    api.get.mockResolvedValue({ data: sharing({ adult: false }) });
    show();
    expect(await screen.findByTestId("sharing-not-yet")).toHaveTextContent(
      /From your 18th birthday/,
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("tells a student with no birthday on record to ask the office", async () => {
    api.get.mockResolvedValue({ data: sharing({ adult: false, knowsBirthday: false }) });
    show();
    expect(await screen.findByTestId("sharing-not-yet")).toHaveTextContent(/Ask the office/);
  });

  it("is not there for anybody but a student", () => {
    const { container } = show("PARENT");
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });
});
