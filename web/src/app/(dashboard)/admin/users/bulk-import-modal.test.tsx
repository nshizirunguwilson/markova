import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/harness";
import { BulkImportModal } from "./bulk-import-modal";

const onClose = vi.fn();

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  onClose.mockReset();
});

/** Hands the modal a CSV the way a file picker would. */
async function upload(csv: string, name = "students.csv") {
  const file = new File([csv], name, { type: "text/csv" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.setup().upload(input, file);
  return file;
}

const HEADER = "firstName,lastName,email,phone";
const ROW_ONE = "Divine,Niyonkuru,student1@markova.edu,+250788000010";
const ROW_TWO = "Keza,Mutesi,student2@markova.edu,+250788000011";

describe("BulkImportModal visibility", () => {
  it("renders nothing while closed", () => {
    const { container } = renderWithProviders(
      <BulkImportModal isOpen={false} onClose={onClose} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders the importer when open", () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });
});

describe("parsing an uploaded file", () => {
  it("reads a header row and one row per line", async () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}\n${ROW_TWO}`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    expect(screen.getByText(/Keza/)).toBeInTheDocument();
  });

  it("shows the chosen file name", async () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}`, "senior-one.csv");
    await waitFor(() => expect(screen.getByText(/senior-one\.csv/)).toBeInTheDocument());
  });

  // A header with no rows under it is the most common mistake, and silently
  // importing zero people would look like success.
  it("rejects a file with a header and nothing else", async () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(HEADER);
    await waitFor(() =>
      expect(screen.getByText(/at least one data row/i)).toBeInTheDocument(),
    );
  });

  it("rejects an empty file", async () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload("");
    await waitFor(() =>
      expect(screen.getByText(/at least one data row/i)).toBeInTheDocument(),
    );
  });

  // A short row used to leave later columns undefined, which the API rejects
  // with an unhelpful message. Missing cells become empty strings instead.
  it("fills missing cells rather than leaving them undefined", async () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\nDivine,Niyonkuru`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    expect(document.body.textContent).not.toContain("undefined");
  });
});

describe("running the import", () => {
  it("posts the parsed rows and reports the result", async () => {
    h.api.post.mockResolvedValue({
      data: { created: 2, failed: 0, credentials: [] },
    });
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}\n${ROW_TWO}`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const importButton = screen
      .getAllByRole("button")
      .find((b) => /^import/i.test(b.textContent ?? ""));
    await userEvent.setup().click(importButton!);

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    const [url, body] = h.api.post.mock.calls[0];
    expect(String(url)).toContain("bulk-import");
    expect(body).toMatchObject({ role: "STUDENT" });
  });

  it("surfaces a rejected import instead of closing quietly", async () => {
    h.api.post.mockRejectedValue({
      response: { status: 400, data: { message: "Row 2 has no email" } },
    });
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const importButton = screen
      .getAllByRole("button")
      .find((b) => /^import/i.test(b.textContent ?? ""));
    await userEvent.setup().click(importButton!);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    // The rows stay on screen so the admin can fix and retry, and the rejection
    // must not escape as an unhandled promise.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Divine/)).toBeInTheDocument();
  });
});

describe("the template download", () => {
  it("asks for a template for the selected role", async () => {
    h.api.get.mockResolvedValue({ data: new Blob(["firstName,lastName"]) });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);

    const button = screen
      .getAllByRole("button")
      .find((b) => /template/i.test(b.textContent ?? ""));
    await userEvent.setup().click(button!);

    await waitFor(() => expect(h.api.get).toHaveBeenCalled());
    expect(String(h.api.get.mock.calls[0][0])).toContain("STUDENT");
    vi.unstubAllGlobals();
  });

  // The template is a fixed set of column names, so a school with a flaky
  // connection still gets one rather than a dead button.
  it("falls back to a locally generated template when the API is down", async () => {
    h.api.get.mockRejectedValue({ response: { status: 500 } });
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);

    const button = screen
      .getAllByRole("button")
      .find((b) => /template/i.test(b.textContent ?? ""));
    await userEvent.setup().click(button!);

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(h.toast.error).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
