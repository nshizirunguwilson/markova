import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertMutation,
  assertQuery,
  resolveAll,
  runMutation,
  type MutationCase,
  type QueryCase,
} from "@/test/hooks";

const h = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));

import * as admissions from "./use-admissions";

const api = h.api;

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

const queries: QueryCase[] = [
  {
    name: "useIntakes",
    hook: () => admissions.useIntakes(),
    url: "/admissions/intakes",
  },
  {
    name: "useApplicationQueue",
    hook: () => admissions.useApplicationQueue({ bucket: "TO_DECIDE" }),
    url: "/admissions/applications",
  },
  {
    name: "useApplication",
    hook: () => admissions.useApplication("app-1"),
    url: "/admissions/applications/app-1",
  },
  {
    name: "useOpenIntakes",
    hook: () => admissions.useOpenIntakes(),
    url: "/admissions/public/intakes",
  },
];

const mutations: MutationCase[] = [
  {
    name: "useSaveIntake",
    hook: () => admissions.useSaveIntake(),
    arg: { name: "Senior 1 2026" },
    method: "put",
    url: "/admissions/intakes",
  },
  {
    name: "useDecide",
    hook: () => admissions.useDecide(),
    arg: { id: "app-1", status: "UNDER_REVIEW", said: "Picked up" },
    method: "post",
    url: "/admissions/applications/app-1/decide",
  },
  {
    name: "useRequestInfo",
    hook: () => admissions.useRequestInfo(),
    arg: { id: "app-1", documents: ["PASSPORT_PHOTO"] },
    method: "post",
    url: "/admissions/applications/app-1/request-info",
  },
  {
    name: "useMakeOffer",
    hook: () => admissions.useMakeOffer(),
    arg: { id: "app-1", classSectionId: "sec-1", expiresAt: "2099-01-01" },
    method: "post",
    url: "/admissions/applications/app-1/offer",
  },
  {
    name: "useRevokeOffer",
    hook: () => admissions.useRevokeOffer(),
    arg: { offerId: "offer-1", reason: "gone" },
    method: "post",
    url: "/admissions/offers/revoke",
  },
  {
    name: "useExpireOffers",
    hook: () => admissions.useExpireOffers(),
    arg: undefined,
    method: "post",
    url: "/admissions/offers/expire",
  },
  {
    name: "useEnrol",
    hook: () => admissions.useEnrol(),
    arg: "app-1",
    method: "post",
    url: "/admissions/applications/app-1/enrol",
  },
  {
    name: "useVerifyDocument",
    hook: () => admissions.useVerifyDocument(),
    arg: "doc-1",
    method: "post",
    url: "/admissions/documents/doc-1/verify",
  },
  {
    name: "useAddNote",
    hook: () => admissions.useAddNote(),
    arg: { id: "app-1", body: "Spoke to the mother" },
    method: "post",
    url: "/admissions/applications/app-1/notes",
  },
  {
    name: "useCheckStatus",
    hook: () => admissions.useCheckStatus(),
    arg: { reference: "APP-2026-0417", dateOfBirth: "2013-04-02" },
    method: "post",
    url: "/admissions/public/status",
  },
  {
    name: "useAnswerOffer",
    hook: () => admissions.useAnswerOffer(),
    arg: { reference: "APP-2026-0417", dateOfBirth: "2013-04-02", accept: true },
    method: "post",
    url: "/admissions/public/offer/answer",
  },
  {
    name: "useSubmitApplication",
    hook: () => admissions.useSubmitApplication(),
    arg: { firstName: "Aline" },
    method: "post",
    url: "/admissions/public/applications",
  },
];

describe("use-admissions queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-admissions mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});

/**
 * What the office is told afterwards.
 *
 * A reviewer working at speed needs to see that the thing they meant happened,
 * so each line names the outcome rather than saying "saved".
 */
describe("what the desk is told", () => {
  it("names where an application went", async () => {
    resolveAll(api, {});
    await runMutation(() => admissions.useDecide(), {
      id: "app-1",
      status: "REJECTED",
      reason: "Below the mark",
      said: "Turned down",
    });
    expect(h.toast.success).toHaveBeenCalledWith("Turned down");
  });

  it("counts the documents it asked the family for", async () => {
    resolveAll(api, {});
    await runMutation(() => admissions.useRequestInfo(), {
      id: "app-1",
      documents: ["PASSPORT_PHOTO", "PARENT_ID"],
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      "Asked the family for 2 documents",
    );
  });

  it("says one document rather than 1 documents", async () => {
    resolveAll(api, {});
    await runMutation(() => admissions.useRequestInfo(), {
      id: "app-1",
      documents: ["PASSPORT_PHOTO"],
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      "Asked the family for 1 document",
    );
  });

  it("copes with a request that is only a note", async () => {
    resolveAll(api, {});
    await runMutation(() => admissions.useRequestInfo(), {
      id: "app-1",
      documents: [],
      note: "The photograph was too dark",
    });
    expect(h.toast.success).toHaveBeenCalledWith("Asked the family for more");
  });

  // A held place is capacity spent, and the line says so rather than just
  // confirming the write.
  it("says an offered place is held until its expiry", async () => {
    resolveAll(api, {});
    await runMutation(() => admissions.useMakeOffer(), {
      id: "app-1",
      classSectionId: "sec-1",
      expiresAt: "2099-01-01",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/held until the expiry/i),
    );
  });

  it("says a withdrawn place puts the application back in the pile", async () => {
    resolveAll(api, {});
    await runMutation(() => admissions.useRevokeOffer(), {
      offerId: "offer-1",
      reason: "gone",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/in the pile again/i),
    );
  });

  /**
   * The office reads the student number out to the family on the spot, so the
   * line carries it rather than saying "enrolled".
   */
  it("names the student number it minted", async () => {
    resolveAll(api, {
      studentIdNumber: "STD-2026-231419-167",
      email: "a.uwase@markova.edu",
    });
    await runMutation(() => admissions.useEnrol(), "app-1");
    expect(h.toast.success).toHaveBeenCalledWith(
      "Enrolled as STD-2026-231419-167",
    );
  });

  it("counts the places an expiry sweep released", async () => {
    resolveAll(api, { expired: 3 });
    await runMutation(() => admissions.useExpireOffers(), undefined);
    expect(h.toast.success).toHaveBeenCalledWith("3 places released.");
  });

  it("says one place rather than 1 places", async () => {
    resolveAll(api, { expired: 1 });
    await runMutation(() => admissions.useExpireOffers(), undefined);
    expect(h.toast.success).toHaveBeenCalledWith("1 place released.");
  });

  it("says so plainly when nothing had run out", async () => {
    resolveAll(api, { expired: 0 });
    await runMutation(() => admissions.useExpireOffers(), undefined);
    expect(h.toast.success).toHaveBeenCalledWith("No offers had run out.");
  });

  it("confirms a saved round, a checked document and a note", async () => {
    for (const [hook, arg, line] of [
      [() => admissions.useSaveIntake(), { name: "x" }, "Intake saved"],
      [() => admissions.useVerifyDocument(), "doc-1", "Checked"],
      [
        () => admissions.useAddNote(),
        { id: "app-1", body: "note" },
        "Note added",
      ],
    ] as const) {
      h.toast.success.mockClear();
      resolveAll(api, {});
      await runMutation(hook as () => unknown, arg);
      expect(h.toast.success).toHaveBeenCalledWith(line);
    }
  });
});

/**
 * What a family is told. Their two answers say different things, and neither
 * of them is "saved".
 */
describe("what the family is told", () => {
  it("says the school will be in touch when they accept", async () => {
    resolveAll(api, {});
    await runMutation(() => admissions.useAnswerOffer(), {
      reference: "APP-2026-0417",
      dateOfBirth: "2013-04-02",
      accept: true,
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/be in touch about enrolment/i),
    );
  });

  it("thanks them for saying so when they decline", async () => {
    resolveAll(api, {});
    await runMutation(() => admissions.useAnswerOffer(), {
      reference: "APP-2026-0417",
      dateOfBirth: "2013-04-02",
      accept: false,
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/letting the school know/i),
    );
  });

  /**
   * Looking up an application that does not match says only that nothing
   * matched, and the same for a wrong reference and a wrong date of birth.
   */
  it("says only that nothing matched when a lookup fails", async () => {
    api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: {} },
    });
    await runMutation(() => admissions.useCheckStatus(), {
      reference: "APP-2026-9999",
      dateOfBirth: "2013-04-02",
    });
    expect(h.toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/No application matches/i),
    );
  });
});

/**
 * A query that cannot answer yet does not ask. Firing without an id asks the
 * API for `/admissions/applications/undefined`.
 */
describe("what is not asked for", () => {
  it("does not read an application without an id", async () => {
    resolveAll(api, {});
    const { renderHook } = await import("@testing-library/react");
    const { Providers } = await import("@/test/harness");
    renderHook(() => admissions.useApplication(undefined), {
      wrapper: Providers,
    });
    expect(api.get).not.toHaveBeenCalled();
  });
});
