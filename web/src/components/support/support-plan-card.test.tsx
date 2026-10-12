import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { SupportPlanCard } from "./support-plan-card";
import { ExamHelp } from "./exam-help";

const whole = {
  needs: ["SEEING"],
  needWords: ["Seeing"],
  needNote: "Low vision in both eyes",
  arrangementCodes: ["EXTRA_TIME", "LARGE_PRINT"],
  extraTimePercent: 25,
  otherArrangement: null,
  arrangements: ["25% extra time", "Large print"],
  reviewOn: "2027-01-15T00:00:00.000Z",
  agreedWith: "The family",
  updatedAt: "2026-10-01T00:00:00.000Z",
  updatedBy: "Speciose Mukarugwiza",
};

const show = (answer: unknown, props: Record<string, unknown> = {}) => {
  api.get.mockResolvedValue({ data: answer });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SupportPlanCard studentId="s1" name="Keza Habimana" {...props} />
    </QueryClientProvider>,
  );
};

/** A student's support plan (B7), as each kind of reader sees it. */
describe("the support plan card", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("shows a keeper the whole plan, and lets them change it", async () => {
    show({ plan: whole, mayChange: true });
    const card = await screen.findByTestId("support-plan");
    expect(card).toHaveTextContent("Seeing");
    expect(card).toHaveTextContent("Low vision in both eyes");
    expect(within(card).getByRole("list", { name: "Arrangements" })).toHaveTextContent(
      "25% extra time",
    );
    expect(card).toHaveTextContent("Looked at again on 15 January");
    expect(screen.getByRole("button", { name: "Change the plan" })).toBeInTheDocument();
  });

  it("changes a plan: adds a reader and saves", async () => {
    show({ plan: whole, mayChange: true });
    api.put.mockResolvedValue({ data: { plan: whole, mayChange: true } });
    fireEvent.click(await screen.findByRole("button", { name: "Change the plan" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("A reader"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/students/s1/support-plan",
        expect.objectContaining({
          needs: ["SEEING"],
          arrangements: ["EXTRA_TIME", "LARGE_PRINT", "READER"],
          extraTimePercent: 25,
          reviewOn: "2027-01-15",
          agreedWith: "The family",
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Support plan saved");
  });

  it("will not save extra time without an amount", async () => {
    show({ plan: whole, mayChange: true });
    fireEvent.click(await screen.findByRole("button", { name: "Change the plan" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Extra time, as a percentage/), {
      target: { value: "" },
    });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("removes a plan", async () => {
    show({ plan: whole, mayChange: true });
    api.delete.mockResolvedValue({ data: { removed: true } });
    fireEvent.click(await screen.findByRole("button", { name: "Change the plan" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove the plan" }),
    );
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/students/s1/support-plan"));
    expect(toast.success).toHaveBeenCalledWith("Support plan removed");
  });

  it("makes a first plan, starting from what enrolment recorded", async () => {
    show({ plan: null, mayChange: true, recordedAtEnrolment: "Low vision" });
    expect(await screen.findByTestId("support-plan")).toHaveTextContent(
      "No support plan. Recorded at enrolment: Low vision.",
    );
    api.put.mockResolvedValue({ data: { plan: whole, mayChange: true } });
    fireEvent.click(screen.getByRole("button", { name: "Make a plan" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Seeing"));
    fireEvent.click(within(dialog).getByLabelText("Large print"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/students/s1/support-plan", {
        needs: ["SEEING"],
        arrangements: ["LARGE_PRINT"],
      }),
    );
  });

  it("says what went wrong when saving fails", async () => {
    show({ plan: null, mayChange: true });
    api.put.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Say how much extra time" } },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Make a plan" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Say how much extra time"));
  });

  it("closes without saving", async () => {
    show({ plan: whole, mayChange: true });
    fireEvent.click(await screen.findByRole("button", { name: "Change the plan" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.put).not.toHaveBeenCalled();
  });

  it("tells a teacher what to do, and that why is kept elsewhere", async () => {
    show({ plan: { arrangements: ["25% extra time"], reviewOn: null }, teacherView: true });
    const card = await screen.findByTestId("support-plan");
    expect(card).toHaveTextContent("25% extra time");
    expect(card).not.toHaveTextContent("Seeing");
    expect(card).toHaveTextContent(/You see what to do for Keza/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the family nothing at all when there is no plan", async () => {
    const { container } = show({ plan: null, mayChange: false }, { hideWhenEmpty: true });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing different when a plan has no arrangements", async () => {
    show({ plan: { ...whole, arrangements: [], arrangementCodes: [] }, mayChange: false });
    expect(await screen.findByText("Nothing different.")).toBeInTheDocument();
  });
});

describe("the exam help marker", () => {
  it("says what to do, out loud too", () => {
    render(<ExamHelp arrangements={["25% extra time", "Large print"]} />);
    const marker = screen.getByTestId("exam-help");
    expect(marker).toHaveTextContent("In tests and exams: 25% extra time, Large print");
    expect(marker).toHaveAttribute("title", "In tests and exams: 25% extra time, Large print");
  });

  it("is not there for a student with nothing", () => {
    const { container } = render(<ExamHelp arrangements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the support plan editor, field by field", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    toast.error.mockReset();
  });

  it("sends every field as typed, and drops a need unticked", async () => {
    show({ plan: whole, mayChange: true });
    api.put.mockResolvedValue({ data: { plan: whole, mayChange: true } });
    fireEvent.click(await screen.findByRole("button", { name: "Change the plan" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Seeing"));
    fireEvent.click(within(dialog).getByLabelText("Hearing"));
    fireEvent.change(within(dialog).getByLabelText(/Extra time, as a percentage/), {
      target: { value: "50" },
    });
    fireEvent.change(within(dialog).getByLabelText("Anything else (optional)"), {
      target: { value: "A ground-floor room" },
    });
    fireEvent.change(within(dialog).getByLabelText("About the need (optional)"), {
      target: { value: "Uses hearing aids" },
    });
    fireEvent.change(within(dialog).getByLabelText("Look at it again on"), {
      target: { value: "2027-06-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Agreed with"), {
      target: { value: "The district SNE officer" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/students/s1/support-plan", {
        needs: ["HEARING"],
        arrangements: ["EXTRA_TIME", "LARGE_PRINT"],
        extraTimePercent: 50,
        otherArrangement: "A ground-floor room",
        needNote: "Uses hearing aids",
        reviewOn: "2027-06-01",
        agreedWith: "The district SNE officer",
      }),
    );
  });

  it("says what went wrong when removing fails", async () => {
    show({ plan: whole, mayChange: true });
    api.delete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { message: "There is no plan to remove" } },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Change the plan" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove the plan" }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("There is no plan to remove"));
  });

  it("closes from the keyboard", async () => {
    show({ plan: whole, mayChange: true });
    fireEvent.click(await screen.findByRole("button", { name: "Change the plan" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("the support plan card, read only", () => {
  it("says there is no plan, and offers nothing to change", async () => {
    show({ plan: null, mayChange: false });
    expect(await screen.findByTestId("support-plan")).toHaveTextContent(/^No support plan\.$/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("leaves out what a plan does not say", async () => {
    show({ plan: { ...whole, needWords: [], needNote: null, reviewOn: null, agreedWith: null }, mayChange: false });
    const card = await screen.findByTestId("support-plan");
    expect(card).not.toHaveTextContent("Needs");
    expect(card).not.toHaveTextContent("Looked at again");
    expect(card).not.toHaveTextContent("Agreed with");
  });

  it("draws no marker without arrangements at all", () => {
    const { container } = render(<ExamHelp />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the support plan card for a family", () => {
  it("shows a plan that exists", async () => {
    show({ plan: whole, mayChange: false }, { hideWhenEmpty: true });
    expect(await screen.findByTestId("support-plan")).toHaveTextContent("25% extra time");
  });
});
