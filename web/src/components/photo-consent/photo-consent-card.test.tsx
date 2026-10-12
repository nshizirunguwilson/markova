import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { MyPhotoConsent, PhotoConsentCard } from "./photo-consent-card";

const consent = (over: Record<string, unknown> = {}) => ({
  forId: "YES",
  inApp: "NO",
  publicity: "NOT_ASKED",
  answeredBy: "FAMILY",
  mayAnswer: true,
  history: [
    {
      id: "r1",
      forId: "YES",
      inApp: "NO",
      publicity: "NOT_ASKED",
      how: "PAPER_FORM",
      answeredBy: "Jean Habimana (father)",
      createdAt: "2026-09-01T08:00:00.000Z",
    },
  ],
  ...over,
});

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const show = (answer: unknown, props: Record<string, unknown> = {}) => {
  api.get.mockResolvedValue({ data: answer });
  return wrap(<PhotoConsentCard studentId="s1" name="Keza Habimana" {...props} />);
};

const pick = (question: string, answer: "Yes" | "No") =>
  fireEvent.click(within(screen.getByRole("group", { name: question })).getByLabelText(answer));

/** A student's photo (B6): the three answers, and who may give them. */
describe("the photo answers card", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("shows the three answers, who gave them and how", async () => {
    show(consent());
    const card = await screen.findByTestId("photo-consent");
    expect(screen.getByText("Keza's photo")).toBeInTheDocument();
    expect(card).toHaveTextContent("On the ID card and report card");
    expect(card).toHaveTextContent("Not asked yet");
    expect(card).toHaveTextContent("Until somebody answers, the school counts publicity as No.");
    expect(card).toHaveTextContent("Answered by Jean Habimana (father) on a paper form, 1 September");
  });

  it("lets a parent answer, and sends the three answers", async () => {
    show(consent());
    api.put.mockResolvedValue({ data: consent({ publicity: "YES" }) });
    fireEvent.click(await screen.findByRole("button", { name: "Change the answers" }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    pick("In the school's publicity", "Yes");
    pick("In the app, for classmates and other parents", "Yes");
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/students/s1/photo-consent", {
        forId: "YES",
        inApp: "YES",
        publicity: "YES",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Answers saved");
    expect(await screen.findByText("Change the answers")).toBeInTheDocument();
  });

  it("says Answer when nobody has yet", async () => {
    show(consent({ history: [], forId: "NOT_ASKED", inApp: "NOT_ASKED" }));
    fireEvent.click(await screen.findByRole("button", { name: "Answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Answer" })).toBeInTheDocument();
  });

  it("makes the office name who signed the paper form", async () => {
    show(consent({ publicity: "NO" }), { office: true });
    expect(await screen.findByText("Photo")).toBeInTheDocument();
    api.put.mockResolvedValue({ data: consent() });
    fireEvent.click(screen.getByRole("button", { name: "Copy in a signed form" }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Who signed the form"), {
      target: { value: "Marie Mukamana (mother)" },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/students/s1/photo-consent", {
        forId: "YES",
        inApp: "NO",
        publicity: "NO",
        answeredBy: "Marie Mukamana (mother)",
      }),
    );
  });

  it("says why it was not saved", async () => {
    show(consent({ publicity: "NO" }));
    api.put.mockRejectedValue({ response: { data: { message: "Keza is 18 or over" } } });
    fireEvent.click(await screen.findByRole("button", { name: "Change the answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("tells a parent of a student of 18 that the student decides", async () => {
    show(consent({ answeredBy: "STUDENT", mayAnswer: false }));
    expect(await screen.findByTestId("photo-consent-who")).toHaveTextContent(
      "Keza is 18 or over, so Keza decides this now.",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tells a student under 18 that their parents answer", async () => {
    show(consent({ mayAnswer: false }));
    expect(await screen.findByTestId("photo-consent-who")).toHaveTextContent(
      "Your parents answer this until you are 18.",
    );
  });

  it("shows nothing it may not show", async () => {
    api.get.mockRejectedValue(new Error("Forbidden"));
    wrap(<PhotoConsentCard studentId="s1" name="Keza Habimana" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByTestId("photo-consent")).toBeNull();
  });
});

describe("one's own photo answers", () => {
  beforeEach(() => api.get.mockReset());

  it("gives a parent one card per child", async () => {
    api.get.mockResolvedValue({ data: consent() });
    wrap(
      <MyPhotoConsent
        role="PARENT"
        name="Jean Habimana"
        childList={[
          { id: "s1", name: "Keza Habimana" },
          { id: "s2", name: "Eric Habimana" },
        ]}
      />,
    );
    expect(await screen.findByText("Keza's photo")).toBeInTheDocument();
    expect(await screen.findByText("Eric's photo")).toBeInTheDocument();
  });

  it("gives a student their own", async () => {
    api.get.mockResolvedValue({ data: consent() });
    wrap(<MyPhotoConsent role="STUDENT" studentId="s1" name="Keza Habimana" />);
    expect(await screen.findByText("Keza's photo")).toBeInTheDocument();
  });

  it("gives the staff nothing", () => {
    const { container } = wrap(<MyPhotoConsent role="TEACHER" name="Aline Uwase" />);
    expect(container).toBeEmptyDOMElement();
    const none = wrap(<MyPhotoConsent role="PARENT" name="Jean" childList={[]} />);
    expect(none.container).toBeEmptyDOMElement();
  });
});
