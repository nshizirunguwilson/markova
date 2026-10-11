import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const out = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sign-out", () => out);

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignOutEverywhere } from "./sign-out-everywhere";

describe("signing out everywhere", () => {
  it("ends every session, then goes to sign in", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SignOutEverywhere />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login"));
    expect(out.signOut).toHaveBeenCalledWith(expect.anything(), { everywhere: true });
  });
});
