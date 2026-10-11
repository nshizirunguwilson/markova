import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useAuthStore } from "@/stores/auth-store";
import { StudentJourney } from "./student-journey";

const onRoll = {
  status: "ACTIVE",
  label: "On the roll",
  pause: null,
  upcoming: null,
  entries: [],
};
const suspended = {
  ...onRoll,
  pause: {
    kind: "SUSPENDED",
    startsOn: "2026-10-11T00:00:00.000Z",
    endsOn: "2026-10-15T00:00:00.000Z",
    reason: "Fighting in the dormitory",
  },
  entries: [
    {
      id: "e1",
      step: "SUSPENDED",
      happenedOn: "2026-10-11T00:00:00.000Z",
      until: "2026-10-15T00:00:00.000Z",
      reason: "Fighting in the dormitory",
      recordedBy: { firstName: "Wilson", lastName: "Nshizirungu" },
    },
  ],
};
const withdrawn = {
  ...onRoll,
  status: "WITHDRAWN",
  entries: [
    {
      id: "e2",
      step: "READMITTED",
      happenedOn: "2026-01-12T00:00:00.000Z",
      reason: "Back to repeat the year",
      classSection: { name: "A", classLevel: { name: "Senior 2" } },
    },
  ],
};

const show = (journey: unknown, role = "ADMIN") => {
  useAuthStore.setState({ user: { id: "me", role } as never, isAuthenticated: true });
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.includes("/journey")
        ? journey
        : [{ id: "sec-1", name: "A", classLevel: { name: "Senior 1" } }],
    }),
  );
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <StudentJourney studentId="s1" userId="u1" name="Keza Habimana" />
    </QueryClientProvider>,
  );
};

describe("a student's journey", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset().mockResolvedValue({ data: {} });
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("shows where the student stands, and says when nothing has changed", async () => {
    show(onRoll);
    expect(await screen.findByTestId("journey-standing")).toHaveTextContent("On the roll");
    expect(screen.getByText(/Nothing has changed since Keza Habimana joined/)).toBeInTheDocument();
  });

  it("shows a suspension, until when and why, and its place in the history", async () => {
    show(suspended);
    expect(await screen.findByText("Suspended until 15 October")).toBeInTheDocument();
    const history = screen.getByRole("list", { name: "Journey so far" });
    expect(within(history).getByText("Suspended")).toBeInTheDocument();
    expect(within(history).getByText("11 October to 15 October")).toBeInTheDocument();
    expect(within(history).getByText("By Wilson Nshizirungu")).toBeInTheDocument();
  });

  it("offers the principal every step for a student on the roll", async () => {
    show(onRoll);
    await screen.findByTestId("journey-standing");
    for (const name of ["Suspend", "Time away", "Leaves the school", "Passed away"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Readmit" })).toBeNull();
  });

  it("lets the Director of Studies pause, and nothing more", async () => {
    show(onRoll, "HEAD_TEACHER");
    await screen.findByTestId("journey-standing");
    expect(screen.getByRole("button", { name: "Suspend" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leaves the school" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Passed away" })).toBeNull();
  });

  it("offers a teacher nothing to change", async () => {
    show(onRoll, "TEACHER");
    await screen.findByTestId("journey-standing");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers bringing a paused student back, not a second pause", async () => {
    show(suspended);
    await screen.findByText("Suspended until 15 October");
    expect(screen.getByRole("button", { name: "Back at school" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
  });

  it("suspends, with both days and a reason, and says what will happen first", async () => {
    show(onRoll);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/never marked absent/);
    const save = within(dialog).getByRole("button", { name: "Suspend" });
    expect(save).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("First day out"), {
      target: { value: "2026-10-13" },
    });
    fireEvent.change(within(dialog).getByLabelText("Last day out"), {
      target: { value: "2026-10-17" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Fighting in the dormitory" },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/students/s1/journey/suspend", {
        startsOn: "2026-10-13",
        endsOn: "2026-10-17",
        reason: "Fighting in the dormitory",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Suspended");
  });

  it("takes a student off the roll in the way chosen", async () => {
    show(onRoll);
    fireEvent.click(await screen.findByRole("button", { name: "Leaves the school" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("How they leave"), {
      target: { value: "TRANSFERRED" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Moved to Rubavu" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Leaves the school" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/students/s1/journey/leave",
        expect.objectContaining({ status: "TRANSFERRED", reason: "Moved to Rubavu" }),
      ),
    );
  });

  it("records a passing with only the day, and says nothing more will be sent", async () => {
    show(onRoll);
    fireEvent.click(await screen.findByRole("button", { name: "Passed away" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/Nothing more is ever sent about this student/);
    expect(within(dialog).queryByLabelText("Reason")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Passed away" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/students/s1/journey/passed-away",
        expect.objectContaining({ on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      ),
    );
  });

  it("readmits a student who left, into a class that has to be chosen", async () => {
    show(withdrawn);
    expect(await screen.findByText("Into Senior 2 A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Readmit" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Back after an illness" },
    });
    const save = within(dialog).getByRole("button", { name: "Readmit" });
    expect(save).toBeDisabled();
    await within(dialog).findByRole("option", { name: "Senior 1 A" });
    fireEvent.change(within(dialog).getByLabelText("Into which class"), {
      target: { value: "sec-1" },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/students/s1/journey/readmit",
        expect.objectContaining({ classSectionId: "sec-1" }),
      ),
    );
  });

  it("brings a student back", async () => {
    show(suspended);
    fireEvent.click(await screen.findByRole("button", { name: "Back at school" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Back at school" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/students/s1/journey/back",
        expect.objectContaining({ on: expect.any(String) }),
      ),
    );
  });

  it("says what went wrong, and keeps the form open", async () => {
    api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Already suspended" } },
    });
    show(onRoll);
    fireEvent.click(await screen.findByRole("button", { name: "Time away" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Recovering" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Time away from school" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already suspended"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers nothing once a passing is recorded", async () => {
    show({ ...onRoll, status: "PASSED_AWAY" });
    expect(await screen.findByTestId("journey-standing")).toHaveTextContent("Passed away");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("a journey step, changed or abandoned", () => {
  beforeEach(() => {
    api.post.mockReset().mockResolvedValue({ data: {} });
  });

  it("takes the day and a note as typed", async () => {
    show(suspended);
    fireEvent.click(await screen.findByRole("button", { name: "Back at school" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("First day back"), {
      target: { value: "2026-10-14" },
    });
    fireEvent.change(within(dialog).getByLabelText("Note (optional)"), {
      target: { value: "Came in with her mother" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Back at school" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/students/s1/journey/back", {
        on: "2026-10-14",
        note: "Came in with her mother",
      }),
    );
  });

  it("changes nothing when cancelled", async () => {
    show(onRoll);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.post).not.toHaveBeenCalled();
  });

  it("closes from the keyboard too", async () => {
    show(onRoll);
    fireEvent.click(await screen.findByRole("button", { name: "Time away" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows a pause booked for later, from when", async () => {
    show({
      ...onRoll,
      upcoming: {
        kind: "AWAY",
        startsOn: "2026-11-02T00:00:00.000Z",
        endsOn: null,
        reason: "An operation at CHUK",
      },
    });
    expect(await screen.findByText("Away from 2 November")).toBeInTheDocument();
    expect(screen.getByText("An operation at CHUK")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back at school" })).toBeInTheDocument();
  });
});
