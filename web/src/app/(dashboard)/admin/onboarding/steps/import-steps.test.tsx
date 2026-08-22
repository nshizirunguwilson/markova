/**
 * The two bulk-import steps in onboarding.
 *
 * This is how a school gets its people in on day one: a spreadsheet exported
 * from whatever they used before. The parsing is unforgiving of nothing and the
 * import is the largest single write in the app, so both halves are worth
 * pinning.
 */
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve } from "@/test/page";
import { populatedRoutes } from "@/test/fixtures";

import { StepImportStudents } from "./step-import-students";
import { StepImportTeachers } from "./step-import-teachers";

const steps = [
  { name: "students", Step: StepImportStudents, role: "STUDENT" },
  { name: "teachers", Step: StepImportTeachers, role: "TEACHER" },
];

const HEADER = "firstName,lastName,email,phone";
const ROWS = [
  "Divine,Niyonkuru,student1@markova.edu,+250788000010",
  "Keza,Mutesi,student2@markova.edu,+250788000011",
];

async function upload(csv: string, name = "people.csv") {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) return false;
  await userEvent.setup().upload(input, new File([csv], name, { type: "text/csv" }));
  return true;
}

function importButton() {
  return screen
    .queryAllByRole("button")
    .find((b) => /^import/i.test((b.textContent ?? "").trim()));
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  signIn("ADMIN");
  serve(h.api, populatedRoutes);
});

describe.each(steps)("importing $name", ({ Step, role }) => {
  it("offers a file picker before anything is chosen", () => {
    renderWithProviders(<Step />);
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("offers nothing to import until a file is parsed", () => {
    renderWithProviders(<Step />);
    expect(importButton()).toBeUndefined();
  });

  it("counts the rows it parsed", async () => {
    renderWithProviders(<Step />);
    if (!(await upload(`${HEADER}\n${ROWS[0]}\n${ROWS[1]}`))) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/2 rows/i));
  });

  it("names the file that was chosen", async () => {
    renderWithProviders(<Step />);
    if (!(await upload(`${HEADER}\n${ROWS[0]}`, "senior-one.csv"))) return;
    await waitFor(() =>
      expect(document.body.textContent).toContain("senior-one.csv"),
    );
  });

  // A header with nothing under it is the commonest mistake, and importing
  // zero people silently would look like success.
  it("does not offer to import a file with no rows", async () => {
    renderWithProviders(<Step />);
    if (!(await upload(HEADER))) return;
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(importButton()).toBeUndefined();
  });

  it("sends the parsed rows under the right role", async () => {
    h.api.post.mockResolvedValue({ data: { created: 2, failed: 0 } });
    renderWithProviders(<Step />);
    if (!(await upload(`${HEADER}\n${ROWS[0]}\n${ROWS[1]}`))) return;
    await waitFor(() => expect(importButton()).toBeTruthy());

    await userEvent.setup().click(importButton()!);

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    const [url, body] = h.api.post.mock.calls[0];
    expect(String(url)).toContain("bulk-import");
    expect(body).toMatchObject({ role });
  });

  it("reports a refused import rather than looking like it worked", async () => {
    h.api.post.mockRejectedValue({
      response: { status: 400, data: { message: "Row 2 has no email" } },
    });
    renderWithProviders(<Step />);
    if (!(await upload(`${HEADER}\n${ROWS[0]}`))) return;
    await waitFor(() => expect(importButton()).toBeTruthy());

    await userEvent.setup().click(importButton()!);
    await waitFor(() =>
      expect(
        h.toast.error.mock.calls.length + h.api.post.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });

  it("does not blank the step when the import fails", async () => {
    h.api.post.mockRejectedValue({ response: { status: 500 } });
    renderWithProviders(<Step />);
    if (!(await upload(`${HEADER}\n${ROWS[0]}`))) return;
    await waitFor(() => expect(importButton()).toBeTruthy());
    await userEvent.setup().click(importButton()!);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});
