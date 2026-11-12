import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { SendDocuments } from "./send-documents";

const status = (over: object = {}) =>
  ({
    reference: "APP-2026-0417",
    status: "INFO_REQUESTED",
    stillNeeded: ["Birth certificate"],
    stillNeededKinds: ["BIRTH_CERTIFICATE"],
    sent: [{ kind: "PASSPORT_PHOTO", label: "Passport photo", checked: true }],
    ...over,
  }) as any;

const show = (s = status(), onSent = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SendDocuments status={s} reference="APP-2026-0417" dateOfBirth="2013-04-02" onSent={onSent} />
    </QueryClientProvider>,
  );
  return onSent;
};

const pick = (file: File) =>
  fireEvent.change(screen.getByLabelText("Choose the file to send"), { target: { files: [file] } });

/* Families could not attach anything: every document came from the seed. */
describe("sending documents from the status page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: { label: "Birth certificate", fileName: "bc.pdf" } });
  });

  it("sends the file as the kind chosen, with the family's proof", async () => {
    const onSent = show();
    fireEvent.click(screen.getByRole("button", { name: "Send Birth certificate" }));
    pick(new File(["%PDF-1.7"], "bc.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/admissions/public/documents");
    expect((body as FormData).get("kind")).toBe("BIRTH_CERTIFICATE");
    expect((body as FormData).get("reference")).toBe("APP-2026-0417");
    expect((body as FormData).get("dateOfBirth")).toBe("2013-04-02");
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });

  it("refuses a file over 5 MB before sending anything", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Send Birth certificate" }));
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "scan.pdf", { type: "application/pdf" });
    pick(big);
    expect(screen.getByRole("alert").textContent).toMatch(/over 5 MB/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("lists what has been sent and whether it was checked", () => {
    show();
    expect(screen.getByText("Passport photo")).toBeTruthy();
    expect(screen.getByText("checked by the school")).toBeTruthy();
  });

  it("offers nothing once the application is closed", () => {
    show(status({ status: "ENROLLED" }));
    expect(screen.queryByText("Send documents")).toBeNull();
  });
});
