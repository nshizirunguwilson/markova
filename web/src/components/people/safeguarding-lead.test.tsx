import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const put = vi.fn();
vi.mock("@/lib/api", () => ({ default: { put: (...a: unknown[]) => put(...a) } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { SafeguardingLead } from "./safeguarding-lead";

const show = (props: Partial<Parameters<typeof SafeguardingLead>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SafeguardingLead
        userId="u1"
        role="MATRON"
        isActive
        lead={false}
        {...props}
      />
    </QueryClientProvider>,
  );

describe("SafeguardingLead", () => {
  beforeEach(() => {
    put.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("names a member of staff", async () => {
    put.mockResolvedValue({ data: {} });
    show();
    expect(screen.getByTestId("safeguarding-status")).toHaveTextContent(
      "Not a safeguarding lead.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Make safeguarding lead" }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/users/u1/safeguarding-lead", { lead: true }),
    );
    expect(toast.success).toHaveBeenCalledWith("Named a safeguarding lead");
  });

  it("stands a lead down", async () => {
    put.mockResolvedValue({ data: {} });
    show({ lead: true });
    expect(screen.getByTestId("safeguarding-status")).toHaveTextContent(
      /Watches over every chat/,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Stand down as safeguarding lead" }),
    );
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/users/u1/safeguarding-lead", { lead: false }),
    );
  });

  it("says what went wrong", async () => {
    put.mockRejectedValue({ response: { data: { message: "No" } } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Make safeguarding lead" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it.each(["STUDENT", "PARENT"])("is not offered for a %s", (role) => {
    const { container } = show({ role });
    expect(container).toBeEmptyDOMElement();
  });

  it("is not offered for somebody who has left, unless they are a lead", () => {
    expect(show({ isActive: false }).container).toBeEmptyDOMElement();
  });

  it("still lets somebody who has left be stood down", () => {
    show({ isActive: false, lead: true });
    expect(
      screen.getByRole("button", { name: "Stand down as safeguarding lead" }),
    ).toBeInTheDocument();
  });
});
