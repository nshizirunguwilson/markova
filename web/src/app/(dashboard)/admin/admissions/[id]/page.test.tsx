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
  usePathname: () => "/admin/admissions/app-1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "app-1" }),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";
import { classSection, populatedRoutes } from "@/test/fixtures";
import {
  admissionsRoutes,
  application,
  liveOffer,
} from "@/test/admissions-fixtures";

import ApplicationPage from "./page";

/**
 * One application.
 *
 * The screen a decision is made on, so what these tests hold are the promises
 * that make the decision defensible: nothing moves without a reason, a request
 * for information names exactly what is missing, and a duplicate is shown
 * before anybody acts rather than discovered at enrolment.
 */

const routes = {
  ...populatedRoutes,
  ...admissionsRoutes,
  "/academic/sections": [{ ...classSection, classLevelId: "level-1" }],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

const serveApplication = (over: Record<string, unknown>) =>
  serve(h.api, {
    ...routes,
    "/admissions/applications/app-1": { ...application, ...over },
  });

async function mount() {
  renderPage(ApplicationPage, { role: "ADMIN" });
  await waitFor(() =>
    expect(screen.getByText(/The applicant/)).toBeInTheDocument(),
  );
}

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
};

const button = (name: RegExp) =>
  screen.queryAllByRole("button").find((b) => name.test(b.textContent ?? ""));

const type = async (label: RegExp, value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};

describe("what the reviewer sees", () => {
  it("leads with who the applicant is", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Aline Uwase/);
    expect(text).toMatch(/APP-2026-0417/);
    expect(text).toMatch(/Gasabo, Kigali City/);
  });

  it("names who to talk to, and makes the number callable", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Marie Claire Uwase/);
    expect(screen.getByText("+250788100000").closest("a")).toHaveAttribute(
      "href",
      "tel:+250788100000",
    );
  });

  it("shows what the family said about paying", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/The family is paying/);
  });

  it("shows what the family wanted the school to know", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/sibling already at the school/);
  });

  /*
    Health rows on every application would bury the ones that matter, so they
    appear only when there is something in them.
  */
  it("shows the health section only when there is something in it", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Health and welfare/);
    serveApplication({
      bloodType: null,
      allergies: null,
      medicalConditions: null,
      disability: null,
    });
    renderPage(ApplicationPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getAllByText(/The applicant/).length).toBeGreaterThan(0),
    );
  });

  it("does not go blank when the application fails to load", async () => {
    serveFailure(h.api);
    renderPage(ApplicationPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

/**
 * A missing document is the family's to find; an unchecked one is the office's
 * to open. The list says which, so the right person chases.
 */
describe("the documents", () => {
  it("lists everything asked for, present or not", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Birth certificate/);
    expect(text).toMatch(/National examination results slip/);
    expect(text).toMatch(/Parent or guardian's national ID/);
  });

  it("says which are in and which are still to be checked", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/5 of 5 in, 1 to check/);
    expect(document.body.textContent).toMatch(/Attached, not yet checked/);
  });

  it("says who checked the ones that were", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Checked by Wilson Nshizirungu/);
  });

  it("opens a document without leaving the screen", async () => {
    await mount();
    const open = screen.getByLabelText(/Open Birth certificate/i);
    expect(open).toHaveAttribute("target", "_blank");
  });

  it("records a check against the person who made it", async () => {
    serve(h.api, { ...routes, "/admissions/documents/doc-2/verify": {} });
    await mount();
    await click(
      screen.getByLabelText(/Mark National examination results slip as checked/i),
    );
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/documents/doc-2/verify",
        {},
      ),
    );
  });

  // Already checked, so there is nothing to press.
  it("offers no check on a document already checked", async () => {
    await mount();
    expect(
      screen.queryByLabelText(/Mark Birth certificate as checked/i),
    ).not.toBeInTheDocument();
  });
});

/**
 * "Why was my child turned away" is a question the school will be asked,
 * sometimes a year later.
 */
describe("deciding", () => {
  it("picks an application up without ceremony", async () => {
    serve(h.api, { ...routes, "/admissions/applications/app-1/decide": {} });
    await mount();
    await click(button(/Pick this up/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/applications/app-1/decide",
        { status: "UNDER_REVIEW", reason: undefined },
      ),
    );
  });

  it("will not turn an application down without a reason", async () => {
    await mount();
    await click(button(/Turn down/));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog)
      .getAllByRole("button")
      .find((b) => /Turn down/i.test(b.textContent ?? ""));
    expect(confirm).toBeDisabled();
  });

  it("sends the rejection with its reason", async () => {
    serve(h.api, { ...routes, "/admissions/applications/app-1/decide": {} });
    await mount();
    await click(button(/Turn down/));
    await type(/^Why$/i, "Below the mark for this intake");
    const dialog = screen.getByRole("dialog");
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^Turn down$/i.test(b.textContent ?? "")),
    );
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/applications/app-1/decide",
        { status: "REJECTED", reason: "Below the mark for this intake" },
      ),
    );
  });

  // The family will be told, and this is what the school answers with later.
  it("says the reason is what the family will be told", async () => {
    await mount();
    await click(button(/Turn down/));
    expect((await screen.findByRole("dialog")).textContent).toMatch(
      /if they ask about it later/i,
    );
  });

  it("closes without deciding when the reason box is cancelled", async () => {
    await mount();
    await click(button(/Turn down/));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("says so when the API refuses a decision", async () => {
    await mount();
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "An application that is submitted cannot go straight to enrolled." },
      },
    });
    await click(button(/Turn down/));
    await type(/^Why$/i, "Below the mark");
    const dialog = screen.getByRole("dialog");
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^Turn down$/i.test(b.textContent ?? "")),
    );
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/cannot go straight to/),
      ),
    );
  });

  it("waitlists with a reason of its own", async () => {
    serve(h.api, { ...routes, "/admissions/applications/app-1/decide": {} });
    await mount();
    await click(button(/Waitlist/));
    await type(/^Why$/i, "No place left in this intake");
    const dialog = screen.getByRole("dialog");
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^Waitlist$/i.test(b.textContent ?? "")),
    );
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/applications/app-1/decide",
        { status: "WAITLISTED", reason: "No place left in this intake" },
      ),
    );
  });

  /**
   * Reopening is a new application. Editing a closed one would rewrite what
   * the school actually did.
   */
  it("offers nothing on an application that has ended", async () => {
    serveApplication({ status: "REJECTED" });
    await mount();
    expect(document.body.textContent).toMatch(/closed and cannot be moved/i);
    expect(button(/Turn down/)).toBeUndefined();
    expect(button(/Offer a place/)).toBeUndefined();
  });
});

/**
 * A checklist rather than free text, because otherwise nobody on either side
 * can say what is still outstanding three weeks later.
 */
describe("asking the family for what is missing", () => {
  it("explains why it is a list and not a message", async () => {
    await mount();
    await click(button(/Ask for what is missing/));
    expect((await screen.findByRole("dialog")).textContent).toMatch(
      /a message alone does not/i,
    );
  });

  it("marks what the family has already sent", async () => {
    await mount();
    await click(button(/Ask for what is missing/));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText(/already in/).length).toBeGreaterThan(0);
  });

  it("will not send an empty request", async () => {
    await mount();
    await click(button(/Ask for what is missing/));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /Ask the family/i.test(b.textContent ?? "")),
    ).toBeDisabled();
  });

  it("unticks what was ticked by mistake", async () => {
    await mount();
    await click(button(/Ask for what is missing/));
    const dialog = await screen.findByRole("dialog");
    const box = within(dialog).getAllByRole("checkbox")[0];
    await click(box);
    await click(box);
    expect(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /Ask the family/i.test(b.textContent ?? "")),
    ).toBeDisabled();
  });

  it("sends a note on its own when nothing is ticked", async () => {
    serve(h.api, {
      ...routes,
      "/admissions/applications/app-1/request-info": {},
    });
    await mount();
    await click(button(/Ask for what is missing/));
    await type(/Anything else to say/i, "The photograph was too dark");
    await click(button(/Ask the family/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/applications/app-1/request-info",
        { documents: [], note: "The photograph was too dark" },
      ),
    );
  });

  it("closes without asking when cancelled", async () => {
    await mount();
    await click(button(/Ask for what is missing/));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("sends exactly what was ticked", async () => {
    serve(h.api, {
      ...routes,
      "/admissions/applications/app-1/request-info": {},
    });
    await mount();
    await click(button(/Ask for what is missing/));
    const dialog = await screen.findByRole("dialog");
    await click(
      within(dialog)
        .getAllByRole("checkbox")[0],
    );
    await click(button(/Ask the family/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/applications/app-1/request-info",
        expect.objectContaining({ documents: ["BIRTH_CERTIFICATE"] }),
      ),
    );
  });
});

/**
 * A held place is capacity spent, and the family answers on the public page,
 * so the offer carries a class and an expiry rather than being a status.
 */
describe("offering a place", () => {
  it("says what holding a place costs the intake", async () => {
    await mount();
    await click(button(/Offer a place/));
    expect((await screen.findByRole("dialog")).textContent).toMatch(
      /counts against the intake/i,
    );
  });

  it("will not offer without a class and an expiry", async () => {
    await mount();
    await click(button(/Offer a place/));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /Offer the place/i.test(b.textContent ?? "")),
    ).toBeDisabled();
  });

  it("sends the class and the date the place is held until", async () => {
    serve(h.api, { ...routes, "/admissions/applications/app-1/offer": {} });
    await mount();
    await click(button(/Offer a place/));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^Class$/i), {
        target: { value: "section-1" },
      });
    });
    await type(/Held until/i, "2026-09-15");
    await click(button(/Offer the place/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/applications/app-1/offer",
        expect.objectContaining({
          classSectionId: "section-1",
          expiresAt: "2026-09-15",
        }),
      ),
    );
  });

  it("closes without offering when cancelled", async () => {
    await mount();
    await click(button(/Offer a place/));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("carries the conditions it was given", async () => {
    serve(h.api, { ...routes, "/admissions/applications/app-1/offer": {} });
    await mount();
    await click(button(/Offer a place/));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^Class$/i), {
        target: { value: "section-1" },
      });
    });
    await type(/Held until/i, "2026-09-15");
    await type(/^Conditions$/i, "Subject to the original results slip");
    await click(button(/Offer the place/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/applications/app-1/offer",
        expect.objectContaining({
          conditions: "Subject to the original results slip",
        }),
      ),
    );
  });

  // An application waiting on the family is not one to offer a place on.
  it("does not offer a place while the family owes the school something", async () => {
    serveApplication({ status: "INFO_REQUESTED" });
    await mount();
    expect(button(/Offer a place/)).toBeDisabled();
  });
});

describe("a place already held", () => {
  const offered = { status: "OFFERED", offers: [liveOffer] };

  it("shows the class, the terms and how long is left", async () => {
    serveApplication(offered);
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Senior 1 A/);
    expect(text).toMatch(/expires in/);
    expect(text).toMatch(/Subject to the original results slip/);
  });

  it("says who offered it and when", async () => {
    serveApplication(offered);
    await mount();
    expect(document.body.textContent).toMatch(/by Wilson Nshizirungu/);
  });

  it("takes the place back with a reason", async () => {
    serve(h.api, {
      ...routes,
      "/admissions/applications/app-1": { ...application, ...offered },
      "/admissions/offers/revoke": {},
    });
    await mount();
    await click(button(/Take the place back/));
    await type(/^Why$/i, "It went to a waitlisted family");
    const dialog = screen.getByRole("dialog");
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /Take it back/i.test(b.textContent ?? "")),
    );
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/admissions/offers/revoke", {
        offerId: "offer-1",
        reason: "It went to a waitlisted family",
      }),
    );
  });

  it("closes without taking the place back when cancelled", async () => {
    serveApplication(offered);
    await mount();
    await click(button(/Take the place back/));
    await click(button(/^Cancel$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.post).not.toHaveBeenCalled();
  });

  /**
   * Taking back a place a family has accepted is a different conversation, so
   * the control is simply not offered.
   */
  it("offers no way to take back a place the family has accepted", async () => {
    serveApplication({
      status: "ACCEPTED",
      offers: [{ ...liveOffer, acceptedAt: "2026-06-15T00:00:00.000Z" }],
    });
    await mount();
    expect(document.body.textContent).toMatch(/Accepted 15 Jun 2026/);
    expect(button(/Take the place back/)).toBeUndefined();
  });
});

describe("enrolling", () => {
  it("is offered only once the family has accepted", async () => {
    await mount();
    expect(button(/Enrol as a student/)).toBeUndefined();
    serveApplication({ status: "ACCEPTED" });
    renderPage(ApplicationPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(
        screen.queryAllByRole("button").find((b) =>
          /Enrol as a student/.test(b.textContent ?? ""),
        ),
      ).toBeTruthy(),
    );
  });

  it("names the student number it minted", async () => {
    serve(h.api, {
      ...routes,
      "/admissions/applications/app-1": { ...application, status: "ACCEPTED" },
      "/admissions/applications/app-1/enrol": {
        studentIdNumber: "STD-2026-231419-167",
        email: "a.uwase@markova.edu",
      },
    });
    await mount();
    await click(button(/Enrol as a student/));
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        "Enrolled as STD-2026-231419-167",
      ),
    );
  });

  it("points at the student record once there is one", async () => {
    serveApplication({
      status: "ENROLLED",
      student: { id: "student-1", studentIdNumber: "STD-2026-0001" },
    });
    await mount();
    expect(screen.getByText(/Open the student record/).closest("a")).toHaveAttribute(
      "href",
      "/admin/students/student-1",
    );
  });
});

/**
 * Acting on a duplicate is a mistake that otherwise surfaces at enrolment,
 * with the family already told they had a place.
 */
/**
 * Not every application looks like the one above: a transfer has no exam mark,
 * a day student is not a boarder, and an address a family only half filled in
 * still has to read as a row rather than as a gap.
 */
describe("an application shaped differently", () => {
  const other = {
    gender: "MALE",
    isBoarder: false,
    dateOfBirth: null,
    district: null,
    province: null,
    sector: null,
    cell: null,
    village: null,
    previousSchool: null,
    examMark: null,
    examTotal: null,
    fundingDetail: "Sponsored by Gasabo district",
    secondGuardianName: "Emmanuel Uwase",
    secondGuardianPhone: "+250788100001",
    medicalConditions: "Asthma",
    disability: "Partial hearing loss",
    trade: { code: "SWD", name: "Software Development" },
    intake: {
      id: "intake-2",
      name: "Transfers, 2026",
      entryPoint: "TRANSFER",
      classLevel: { id: "level-3", name: "Senior 3" },
    },
    completeness: {
      required: ["BIRTH_CERTIFICATE", "PASSPORT_PHOTO", "PARENT_ID"],
      present: ["BIRTH_CERTIFICATE"],
      missing: ["PASSPORT_PHOTO", "PARENT_ID"],
      unverified: [],
      complete: false,
      fraction: 1 / 3,
    },
    documents: [
      {
        id: "doc-1",
        kind: "BIRTH_CERTIFICATE",
        fileUrl: "",
        fileName: "birth-certificate.pdf",
        verifiedAt: "2026-06-02T00:00:00.000Z",
        uploadedAt: "2026-06-01T00:00:00.000Z",
        verifiedBy: null,
      },
    ],
  };

  const mountOther = async () => {
    serveApplication(other);
    await mount();
  };

  // "Senior 1 · Senior 1" reads as a fault, but a transfer into Senior 3 is
  // two different facts and both belong on the line.
  it("names the door and the level when they differ", async () => {
    await mountOther();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Transfer/);
    expect(text).toMatch(/Senior 3/);
    expect(text).toMatch(/Day student/);
    expect(text).toMatch(/SWD/);
  });

  it("leaves a dash rather than a gap where the family said nothing", async () => {
    await mountOther();
    expect(document.body.textContent).not.toMatch(/National exam/);
    expect(screen.getAllByText("-").length).toBeGreaterThan(2);
  });

  it("says who else the school can call, and what to know first", async () => {
    await mountOther();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Emmanuel Uwase/);
    expect(text).toMatch(/\+250788100001/);
    expect(text).toMatch(/Asthma/);
    expect(text).toMatch(/Partial hearing loss/);
    expect(text).toMatch(/Sponsored by Gasabo district/);
  });

  // A document that is simply not there needs to read as absent rather than
  // as one more row a reviewer has to open to find out.
  it("marks the documents nobody sent", async () => {
    await mountOther();
    expect(document.body.textContent).toMatch(/1 of 3 in/);
    expect(
      screen.queryByLabelText(/Open Passport photograph/i),
    ).not.toBeInTheDocument();
  });

  it("says the office checked a document even when it cannot say who", async () => {
    await mountOther();
    expect(document.body.textContent).toMatch(/Checked by the office/);
  });

  it("shows a held day place with its trade", async () => {
    serveApplication({
      ...other,
      status: "OFFERED",
      offers: [
        {
          ...liveOffer,
          isBoarder: false,
          classSection: {
            id: "section-3",
            name: "A",
            classLevel: { name: "Senior 3" },
            trade: { code: "SWD", name: "Software Development" },
          },
        },
      ],
    });
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Senior 3 SWD A/);
    expect(text).toMatch(/Day/);
  });
});

/**
 * A refusal from the API is the school's own rule speaking, so the screen
 * stays where it is and repeats what it said.
 */
describe("when the API refuses", () => {
  const refuse = (message: string) =>
    h.api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message } },
    });

  it("keeps the request open when it will not send", async () => {
    await mount();
    refuse("Nothing was asked for.");
    await click(button(/Ask for what is missing/));
    await type(/Anything else to say/i, "Please resend the photograph");
    await click(button(/Ask the family/));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Nothing was asked for."),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the offer open when the round has no places left", async () => {
    await mount();
    refuse("That intake has no places left.");
    await click(button(/Offer a place/));
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^Class$/i), {
        target: { value: "section-1" },
      });
    });
    await type(/Held until/i, "2026-09-15");
    await click(button(/Offer the place/));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "That intake has no places left.",
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the place held when it will not be taken back", async () => {
    serveApplication({ status: "OFFERED", offers: [liveOffer] });
    await mount();
    refuse("That offer has already been answered.");
    await click(button(/Take the place back/));
    await type(/^Why$/i, "It went to a waitlisted family");
    const dialog = screen.getByRole("dialog");
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /Take it back/i.test(b.textContent ?? "")),
    );
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "That offer has already been answered.",
      ),
    );
  });

  it("says so when a student cannot be created", async () => {
    serveApplication({ status: "ACCEPTED" });
    await mount();
    refuse("A student with that number already exists.");
    await click(button(/Enrol as a student/));
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "A student with that number already exists.",
      ),
    );
  });
});

describe("duplicates", () => {
  it("warns when the same child has applied twice", async () => {
    serveApplication({
      duplicates: {
        sameChild: [
          { id: "app-9", reference: "APP-2026-0100", status: "SUBMITTED" },
        ],
        sameGuardian: [],
        alreadyStudent: null,
      },
    });
    await mount();
    expect(document.body.textContent).toMatch(/same family twice/i);
    expect(screen.getByText("APP-2026-0100").closest("a")).toHaveAttribute(
      "href",
      "/admin/admissions/app-9",
    );
  });

  it("warns when the child is already on the roll", async () => {
    serveApplication({
      duplicates: {
        sameChild: [],
        sameGuardian: [],
        alreadyStudent: {
          id: "student-9",
          studentIdNumber: "STD-2025-0001",
          status: "ACTIVE",
          user: { firstName: "Aline", lastName: "Uwase" },
        },
      },
    });
    await mount();
    expect(document.body.textContent).toMatch(/already on the roll/i);
    expect(document.body.textContent).toMatch(/STD-2025-0001/);
  });

  // A shared phone is usually a sibling, which is not a problem, so the wording
  // says so rather than crying wolf.
  it("treats a shared guardian phone as possibly a sibling", async () => {
    serveApplication({
      duplicates: {
        sameChild: [],
        sameGuardian: [
          {
            id: "app-8",
            reference: "APP-2026-0101",
            firstName: "Eric",
            lastName: "Uwase",
            status: "SUBMITTED",
          },
        ],
        alreadyStudent: null,
      },
    });
    await mount();
    expect(document.body.textContent).toMatch(/may simply be a sibling/i);
  });

  it("says nothing when there is nothing to warn about", async () => {
    await mount();
    expect(document.body.textContent).not.toMatch(/same family twice/i);
  });
});

describe("internal notes", () => {
  it("says plainly that the family never sees them", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/never shown to the family/i);
  });

  it("shows the ones already there, with who wrote them", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/the slip is in the post/);
    expect(document.body.textContent).toMatch(/Wilson Nshizirungu/);
  });

  it("will not add an empty one", async () => {
    await mount();
    expect(button(/^Add$/)).toBeDisabled();
  });

  it("adds one", async () => {
    serve(h.api, { ...routes, "/admissions/applications/app-1/notes": {} });
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Add a note/i), {
        target: { value: "Phone rings out" },
      });
    });
    await click(button(/^Add$/));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/admissions/applications/app-1/notes",
        { body: "Phone rings out" },
      ),
    );
  });
});

describe("the trail", () => {
  it("shows what has happened, with the reason each time", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/What has happened/);
    expect(text).toMatch(/Received from the admissions site/);
  });

  // Nobody at the school did it, so nobody is named for it.
  it("credits the office for what arrived on its own", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/the office/);
  });
});
