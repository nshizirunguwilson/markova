import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admissions/apply",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/harness";
import { admissionsRoutes } from "@/test/admissions-fixtures";

import ApplyPage from "./page";

/**
 * The school's application form.
 *
 * It asks for the enrolment record rather than a name and a phone number,
 * because anything it does not collect becomes a data-entry job on the day a
 * student is accepted. What these tests hold is the shape of that bargain: it
 * asks for a lot, so it must be clear about what is required and it must hand
 * back the one thing a family needs afterwards.
 */

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.api.get.mockResolvedValue({ data: admissionsRoutes["/admissions/public/intakes"] });
  h.api.post.mockResolvedValue({ data: { reference: "APP-2026-0417", id: "app-1" } });
});

const type = async (label: RegExp, value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
};

const button = (name: RegExp) =>
  screen
    .queryAllByRole("button")
    .find((b) => name.test((b.textContent ?? "").trim()));

async function mount() {
  renderWithProviders(<ApplyPage />);
  await waitFor(() =>
    expect(screen.getByLabelText(/^Intake$/i)).toBeInTheDocument(),
  );
}

/** The least a family can give and still be considered. */
async function fillTheMinimum() {
  await type(/^Intake$/i, "intake-1");
  await type(/First name/i, "Aline");
  await type(/Family name/i, "Uwase");
  await type(/Date of birth/i, "2013-04-02");
  await type(/^Full name$/i, "Marie Claire Uwase");
  await type(/^Phone$/i, "+250788100000");
}

describe("the form", () => {
  it("lists the rounds a family may apply to", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Senior 1 intake, 2026/);
  });

  it("says when the round closes", async () => {
    await mount();
    await type(/^Intake$/i, "intake-1");
    expect(document.body.textContent).toMatch(/Closes/);
  });

  // A school with nothing open cannot take an application, and saying so beats
  // an empty dropdown.
  it("says so when the school is not taking applications", async () => {
    h.api.get.mockResolvedValue({ data: [] });
    renderWithProviders(<ApplyPage />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/not taking applications/i),
    );
  });

  it("will not send until it has the least it can be considered on", async () => {
    await mount();
    expect(button(/Send the application/)).toBeDisabled();
    await fillTheMinimum();
    expect(button(/Send the application/)).not.toBeDisabled();
  });

  /*
    A boarder is asked for two more documents. Saying so here stops it arriving
    as a surprise a fortnight later.
  */
  it("warns a boarder about the two extra documents", async () => {
    await mount();
    expect(document.body.textContent).not.toMatch(/medical form/i);
    await click(screen.getByLabelText(/boarding place/i));
    expect(document.body.textContent).toMatch(/medical form/i);
  });

  // Only asked when it applies, and it explains that a letter will follow.
  it("asks which bursary only when somebody else is paying", async () => {
    await mount();
    expect(screen.queryByLabelText(/Which bursary/i)).not.toBeInTheDocument();
    await type(/Who is paying the fees/i, "DISTRICT_BURSARY");
    expect(screen.getByLabelText(/Which bursary/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/letter confirming it/i);
  });

  it("says what the school will ask for afterwards", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/birth certificate/i);
    expect(document.body.textContent).toMatch(/results slip/i);
  });
});

describe("sending it", () => {
  it("sends what was filled in, trimmed", async () => {
    await mount();
    await fillTheMinimum();
    await type(/First name/i, "  Aline  ");
    await click(button(/Send the application/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/public/applications",
        expect.objectContaining({
          intakeId: "intake-1",
          firstName: "Aline",
          lastName: "Uwase",
          guardianPhone: "+250788100000",
        }),
      ),
    );
  });

  it("sends the mark out of a hundred when one is given", async () => {
    await mount();
    await fillTheMinimum();
    await type(/National exam mark/i, "68");
    await click(button(/Send the application/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/public/applications",
        expect.objectContaining({ examMark: 68, examTotal: 100 }),
      ),
    );
  });

  // A transfer leaves it blank, and sending a zero would be a lie.
  it("sends no mark at all when the field is empty", async () => {
    await mount();
    await fillTheMinimum();
    await click(button(/Send the application/));
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(h.api.post.mock.calls[0][1].examMark).toBeUndefined();
  });

  /**
   * The reference is the only thing a family gets, and it is how they reach
   * their application for months. So it is large, selectable, and the page
   * says plainly to keep it.
   */
  it("hands back the reference, and says to keep it", async () => {
    await mount();
    await fillTheMinimum();
    await click(button(/Send the application/));
    await waitFor(() =>
      expect(screen.getByText("APP-2026-0417")).toBeInTheDocument(),
    );
    expect(document.body.textContent).toMatch(/Keep this reference/i);
  });

  it("points at the page where they can check on it", async () => {
    await mount();
    await fillTheMinimum();
    await click(button(/Send the application/));
    await waitFor(() =>
      expect(screen.getByText(/Check on this application/).closest("a")).toHaveAttribute(
        "href",
        "/admissions",
      ),
    );
  });

  it("says so when the API refuses it", async () => {
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "That intake is closed." } },
    });
    await mount();
    await fillTheMinimum();
    await click(button(/Send the application/));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("That intake is closed."),
    );
  });
});
