import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});
vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { renderWithProviders } from "@/test/harness";

import { SheetField, type Sheet } from "./sheet-field";

/**
 * The file a piece of work is set on. It uploads the moment it is picked,
 * so a refused file is heard about before the form is saved.
 */

function Host({ start = null }: { start?: Sheet | null }) {
  const [sheet, setSheet] = useState<Sheet | null>(start);
  return <SheetField value={sheet} onChange={setSheet} />;
}

const pdf = new File(["%PDF-1.4"], "Past paper 2025.pdf", { type: "application/pdf" });

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

describe("the sheet on a piece of work", () => {
  it("uploads the picked file and shows its name", async () => {
    h.api.post.mockResolvedValue({
      data: { fileUrl: "/uploads/schools/s/attachments/x.pdf", fileName: "Past paper 2025.pdf" },
    });
    renderWithProviders(<Host />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("File (optional)"), {
        target: { files: [pdf] },
      });
    });

    await screen.findByText("Past paper 2025.pdf");
    expect(String(h.api.post.mock.calls[0][0])).toBe("/homework/upload");
    expect(h.api.post.mock.calls[0][1]).toBeInstanceOf(FormData);
  });

  it("can take the file off again", async () => {
    renderWithProviders(
      <Host start={{ fileUrl: "/uploads/x.pdf", fileName: "Worksheet.pdf" }} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove the file" }));
    });
    expect(screen.queryByText("Worksheet.pdf")).toBeNull();
    expect(screen.getByLabelText("File (optional)")).toBeInTheDocument();
  });

  // Opening the picker and cancelling it fires a change with no file in it.
  it("does nothing when the picker is cancelled", async () => {
    renderWithProviders(<Host />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("File (optional)"), {
        target: { files: [] },
      });
    });
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("shows the upload under way and holds the field meanwhile", async () => {
    h.api.post.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<Host />);
    const input = screen.getByLabelText("File (optional)") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [pdf] } });
    });
    await waitFor(() => expect(input).toBeDisabled());
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  // A refused file must not leave the field stuck: the input is cleared so
  // the same file can be picked again once it is fixed.
  it("says so when the file is refused, and keeps the field usable", async () => {
    h.api.post.mockRejectedValue({
      response: { data: { message: "That kind of file cannot be set as homework" } },
    });
    renderWithProviders(<Host />);

    const input = screen.getByLabelText("File (optional)") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [pdf] } });
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(input.value).toBe("");
    expect(screen.queryByText("Past paper 2025.pdf")).toBeNull();
  });
});
