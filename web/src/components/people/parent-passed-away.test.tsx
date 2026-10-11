import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useAuthStore } from "@/stores/auth-store";
import { ParentPassedAway } from "./parent-passed-away";

const show = (passedAwayOn: string | null = null, role = "ADMIN") => {
  useAuthStore.setState({ user: { id: "me", role } as never, isAuthenticated: true });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ParentPassedAway userId="p1" name="Claudine Uwase" passedAwayOn={passedAwayOn} />
    </QueryClientProvider>,
  );
};

describe("recording that a parent passed away", () => {
  beforeEach(() => {
    api.post.mockReset();
    toast.success.mockReset();
  });

  it("records the day, and says a child left alone needs a guardian", async () => {
    api.post.mockResolvedValue({ data: { childrenWithoutGuardian: ["s1"] } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Passed away" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/class teachers is told privately/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/users/p1/passed-away", {
        on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/One child has no parent or guardian left/),
    );
  });

  it("says plainly when it was recorded", () => {
    show("2026-10-10T00:00:00.000Z");
    expect(screen.getByTestId("parent-passed-away")).toHaveTextContent(
      "Passed away on 10 October. Nothing is sent to Claudine Uwase any more.",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is the principal's to record", () => {
    const { container } = show(null, "HEAD_TEACHER");
    expect(container).toBeEmptyDOMElement();
  });
});

describe("recording a parent's passing, changed or abandoned", () => {
  beforeEach(() => {
    api.post.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
  });

  it("takes the day and a note as typed", async () => {
    api.post.mockResolvedValue({ data: { childrenWithoutGuardian: [] } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Passed away" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-10-09" },
    });
    fireEvent.change(within(dialog).getByLabelText("Note (optional)"), {
      target: { value: "Told by her sister" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/users/p1/passed-away", {
        on: "2026-10-09",
        note: "Told by her sister",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Recorded");
  });

  it("says two children are left alone, in words", async () => {
    api.post.mockResolvedValue({ data: { childrenWithoutGuardian: ["a", "b"] } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Passed away" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/^Recorded\. 2 children have no parent or guardian left/),
      ),
    );
  });

  it("says what went wrong", async () => {
    api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "This has already been recorded" } },
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Passed away" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Record" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("This has already been recorded"),
    );
  });

  it("changes nothing when cancelled", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Passed away" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.post).not.toHaveBeenCalled();
  });

  it("closes from the keyboard too", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Passed away" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
