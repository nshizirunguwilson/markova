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
  usePathname: () => "/admissions",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/harness";
import { publicStatus } from "@/test/admissions-fixtures";

import AdmissionsStatusPage from "./page";

/**
 * Where a family checks on their own application.
 *
 * They have no account, so what these tests hold is what the page is allowed
 * to show: where it stands, what is still wanted, and their own offer. Nothing
 * about anybody else, and nothing the office wrote to itself.
 */

const serve = (data: unknown = publicStatus) => {
  h.api.post.mockResolvedValue({ data });
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve();
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

/* Trimmed: a button with an icon in it has whitespace around its label. */
const button = (name: RegExp) =>
  screen
    .queryAllByRole("button")
    .find((b) => name.test((b.textContent ?? "").trim()));

async function look() {
  renderWithProviders(<AdmissionsStatusPage />);
  await type(/Application reference/i, "APP-2026-0417");
  await type(/date of birth/i, "2013-04-02");
  await click(button(/^Check$/));
  await waitFor(() =>
    expect(screen.getByText(/Aline Uwase/)).toBeInTheDocument(),
  );
}

/**
 * Proved by something only the family knows, and by a pair rather than a
 * single number that anybody holding a reference could guess past.
 */
describe("finding your own application", () => {
  it("will not look without both the reference and the date of birth", () => {
    renderWithProviders(<AdmissionsStatusPage />);
    expect(button(/^Check$/)).toBeDisabled();
  });

  it("asks the API for exactly that pair", async () => {
    await look();
    expect(h.api.post).toHaveBeenCalledWith("/admissions/public/status", {
      reference: "APP-2026-0417",
      dateOfBirth: "2013-04-02",
    });
  });

  it("says who it is and where it stands", async () => {
    await look();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Aline Uwase/);
    expect(text).toMatch(/APP-2026-0417/);
    expect(text).toMatch(/Offered a place/);
  });

  it("says only that nothing matched when it does not", async () => {
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "No application matches that reference and date of birth." },
      },
    });
    renderWithProviders(<AdmissionsStatusPage />);
    await type(/Application reference/i, "APP-2026-9999");
    await type(/date of birth/i, "2013-04-02");
    await click(button(/^Check$/));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/No application matches/),
      ),
    );
  });

  // A reference typed into a box is followed by Enter, not by reaching for
  // the mouse.
  it("looks it up when Enter is pressed in the reference box", async () => {
    renderWithProviders(<AdmissionsStatusPage />);
    await type(/Application reference/i, "APP-2026-0417");
    await type(/date of birth/i, "2013-04-02");
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/Application reference/i), {
        key: "Enter",
      });
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/public/status",
        expect.objectContaining({ reference: "APP-2026-0417" }),
      ),
    );
  });

  it("does nothing on Enter before both fields are filled", async () => {
    renderWithProviders(<AdmissionsStatusPage />);
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/Application reference/i), {
        key: "Enter",
      });
    });
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("says who can see this, at the foot of the page", () => {
    renderWithProviders(<AdmissionsStatusPage />);
    expect(document.body.textContent).toMatch(
      /Only somebody with the reference/i,
    );
  });
});

/**
 * The one thing a family can act on, named item by item. "Your application is
 * incomplete" sends nobody to the right drawer.
 */
describe("what is still wanted", () => {
  it("names each thing rather than saying the application is incomplete", async () => {
    await look();
    expect(document.body.textContent).toMatch(/still waiting for one thing/i);
    expect(document.body.textContent).toMatch(/Passport photograph/);
  });

  it("counts them when there is more than one", async () => {
    serve({ ...publicStatus, stillNeeded: ["Passport photograph", "Birth certificate"] });
    await look();
    expect(document.body.textContent).toMatch(/waiting for 2 things/i);
  });

  it("says nothing at all when nothing is outstanding", async () => {
    serve({ ...publicStatus, stillNeeded: [] });
    await look();
    expect(document.body.textContent).not.toMatch(/still waiting for/i);
  });
});

describe("answering an offer", () => {
  it("says what was offered and how long it is held", async () => {
    await look();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Senior 1 A/);
    expect(text).toMatch(/Boarding/);
    expect(text).toMatch(/held for you and expires/i);
  });

  it("accepts the place", async () => {
    await look();
    await click(button(/Accept the place/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/public/offer/answer",
        expect.objectContaining({ accept: true }),
      ),
    );
  });

  it("turns it down, with a reason if the family gives one", async () => {
    await look();
    await act(async () => {
      fireEvent.change(
        screen.getByLabelText(/Why you are turning the place down/i),
        { target: { value: "We took a place elsewhere" } },
      );
    });
    await click(button(/Turn it down/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/public/offer/answer",
        expect.objectContaining({
          accept: false,
          reason: "We took a place elsewhere",
        }),
      ),
    );
  });

  // Once answered there is nothing left to press, and the page says what the
  // family already told the school.
  it("offers no buttons once the place has been accepted", async () => {
    serve({
      ...publicStatus,
      offer: { ...publicStatus.offer, acceptedAt: "2026-06-15T00:00:00.000Z" },
    });
    await look();
    expect(document.body.textContent).toMatch(/You accepted this place/);
    expect(button(/Accept the place/)).toBeUndefined();
  });

  it("says so when the family turned it down", async () => {
    serve({
      ...publicStatus,
      offer: { ...publicStatus.offer, declinedAt: "2026-06-15T00:00:00.000Z" },
    });
    await look();
    expect(document.body.textContent).toMatch(/would not be taking this place/i);
  });

  it("carries the reason a family gives for turning it down", async () => {
    await look();
    await type(/Why you are turning the place down/i, "We took another school");
    await click(button(/Turn it down/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/public/offer/answer",
        expect.objectContaining({
          accept: false,
          reason: "We took another school",
        }),
      ),
    );
  });

  // A family who says nothing has still turned the place down.
  it("turns it down without a reason", async () => {
    await look();
    await click(button(/Turn it down/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/public/offer/answer",
        expect.objectContaining({ accept: false, reason: undefined }),
      ),
    );
  });

  it("names the trade and says so when the place is a day place", async () => {
    serve({
      ...publicStatus,
      offer: {
        ...publicStatus.offer,
        isBoarder: false,
        classSection: {
          name: "A",
          classLevel: { name: "Senior 3" },
          trade: { code: "SWD", name: "Software Development" },
        },
      },
    });
    await look();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/SWD/);
    expect(text).toMatch(/Day/);
  });

  it("leaves the page usable when the answer is refused", async () => {
    await look();
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "That offer has expired." } },
    });
    await click(button(/Accept the place/));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("That offer has expired."),
    );
  });

  it("shows no offer section when there is no offer", async () => {
    serve({ ...publicStatus, status: "UNDER_REVIEW", offer: null });
    await look();
    expect(document.body.textContent).not.toMatch(/The place offered/);
  });
});

/**
 * The reason is carried through rather than hidden. It is what a family is
 * owed when they are turned away, and withholding it just moves the phone call.
 */
describe("what has happened", () => {
  it("shows each step with the reason the school gave", async () => {
    await look();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Received from the admissions site/);
    expect(text).toMatch(/Place offered in A/);
  });
});
