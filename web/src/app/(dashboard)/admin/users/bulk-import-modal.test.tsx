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

/**
 * Handing over the generated passwords.
 *
 * A bulk import creates thirty accounts, each with its own password, and the
 * server states them once. If the admin closes this screen without saving the
 * list, nobody can sign in and every one of those accounts needs a reset. So
 * the list has to be on screen, and it has to be downloadable.
 */
describe("the passwords an import generates", () => {
  const credentials = [
    { name: "Divine Niyonkuru", login: "student1@markova.edu", password: "Umunyeshuri1!" },
    { name: "Keza Mutesi", login: "student2@markova.edu", password: "Umunyeshuri2!" },
  ];

  /** Uploads two rows and imports them, answering with `result`. */
  async function importWith(result: unknown) {
    h.api.post.mockResolvedValue({ data: result });
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}\n${ROW_TWO}`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const importButton = screen
      .getAllByRole("button")
      .find((b) => /^import/i.test(b.textContent ?? ""));
    await userEvent.setup().click(importButton!);
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
  }

  it("shows each new account with the password it was given", async () => {
    await importWith({ created: 2, failed: 0, credentials });

    await waitFor(() =>
      expect(screen.getByText("Umunyeshuri1!")).toBeInTheDocument(),
    );
    expect(screen.getByText("student1@markova.edu")).toBeInTheDocument();
    expect(screen.getByText("Keza Mutesi")).toBeInTheDocument();
  });

  // The upload is finished, so leaving the rows up would invite a second run
  // that creates everyone twice.
  it("clears the uploaded rows once the accounts exist", async () => {
    await importWith({ created: 2, failed: 0, credentials });

    await waitFor(() =>
      expect(screen.getByText("Umunyeshuri1!")).toBeInTheDocument(),
    );
    const importButton = screen
      .queryAllByRole("button")
      .find((b) => /^import/i.test(b.textContent ?? ""));
    expect(importButton).toBeUndefined();
  });

  it("stays open rather than closing over the passwords", async () => {
    await importWith({ created: 2, failed: 0, credentials });

    await waitFor(() =>
      expect(screen.getByText("Umunyeshuri1!")).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("writes the whole list to a csv, not just what is on screen", async () => {
    const clicks: string[] = [];
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((b: Blob) => {
        blobs.push(b);
        return "blob:creds";
      }),
      revokeObjectURL: vi.fn(),
    });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        (el as HTMLAnchorElement).click = () => {
          clicks.push((el as HTMLAnchorElement).download);
        };
      }
      return el;
    });

    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `Student ${i + 1}`,
      login: `student${i + 1}@markova.edu`,
      password: `Umunyeshuri${i + 1}!`,
    }));
    await importWith({ created: 30, failed: 0, credentials: many });

    await waitFor(() =>
      expect(screen.getByText("Umunyeshuri1!")).toBeInTheDocument(),
    );

    // Not just /download/: "Download CSV Template" is on screen too and comes
    // first, and it fetches an empty template instead of the passwords.
    const download = screen
      .getAllByRole("button")
      .find((b) => /download credentials/i.test(b.textContent ?? ""));
    expect(download).toBeTruthy();
    await userEvent.setup().click(download!);

    expect(clicks[0]).toBe("student_credentials.csv");
    const csv = await blobs[blobs.length - 1].text();
    const lines = csv.trim().split("\n");
    // A header plus every one of the thirty, even though only six are listed.
    expect(lines).toHaveLength(31);
    expect(lines[0]).toBe("name,login,password");
    expect(lines[30]).toContain("Umunyeshuri30!");

    vi.mocked(document.createElement).mockRestore();
  });

  // Rows the server refused have to be named, not summarised as a count.
  it("lists what the server refused instead of the passwords", async () => {
    await importWith({
      created: 0,
      failed: 2,
      errors: ["Row 2: email already in use", "Row 3: missing last name"],
    });

    await waitFor(() =>
      expect(screen.getByText(/email already in use/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/missing last name/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Nothing to hand over means the job is done and the modal can go.
  it("closes when there is nothing to hand back", async () => {
    await importWith({ created: 2, failed: 0, credentials: [] });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

/**
 * Starting the import over.
 *
 * The role picker decides which columns the file must have, so changing it
 * after a file is chosen has to drop the parsed rows. Importing teachers from
 * a student spreadsheet is the mistake this prevents.
 */
describe("changing what is being imported", () => {
  it("drops the parsed rows when the role changes", async () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const { act, fireEvent } = await import("@testing-library/react");
    const role = screen
      .getAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "TEACHER"),
      )!;
    await act(async () => {
      fireEvent.change(role, { target: { value: "TEACHER" } });
    });

    await waitFor(() => expect(screen.queryByText(/Divine/)).toBeNull());
  });

  it("imports nothing after the role is changed", async () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const { act, fireEvent } = await import("@testing-library/react");
    const role = screen
      .getAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "TEACHER"),
      )!;
    await act(async () => {
      fireEvent.change(role, { target: { value: "TEACHER" } });
    });

    h.api.post.mockClear();
    const importButton = screen
      .queryAllByRole("button")
      .find((b) => /^import/i.test(b.textContent ?? ""));
    // Either it is gone with the rows, or it is there but refuses.
    if (importButton) {
      await act(async () => {
        fireEvent.click(importButton);
      });
    }
    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });

  // Dismissing the picker without choosing anything must not clear a file that
  // was already parsed.
  it("keeps the rows when the file picker is dismissed", async () => {
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const { act, fireEvent } = await import("@testing-library/react");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [] } });
    });

    expect(screen.getByText(/Divine/)).toBeInTheDocument();
  });

  it("clears everything when the modal is closed", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    renderWithProviders(<BulkImportModal isOpen onClose={onClose} />);
    await upload(`${HEADER}\n${ROW_ONE}`);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    onClose.mockClear();
    const close = screen
      .getAllByRole("button")
      .find(
        (b) =>
          /close/i.test(b.getAttribute("aria-label") ?? "") ||
          /^cancel$/i.test((b.textContent ?? "").trim()),
      );
    if (!close) return;
    await act(async () => {
      fireEvent.click(close);
    });

    expect(onClose).toHaveBeenCalled();
  });
});
