import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHook } from "@testing-library/react";

import {
  assertMutation,
  assertQuery,
  calledUrls,
  resolveAll,
  runMutation,
  runQuery,
  type MutationCase,
  type QueryCase,
} from "@/test/hooks";
import { Providers } from "@/test/harness";

/**
 * A disabled query never settles, so it cannot be waited on. Rendering it and
 * checking nothing was requested is the whole assertion.
 */
function renderDisabled(hook: () => unknown) {
  renderHook(hook, { wrapper: Providers });
}

const h = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  auth: { user: { id: "user-1", role: "PARENT" } as Record<string, unknown> | null },
}));

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector?: (s: unknown) => unknown) =>
    selector ? selector(h.auth) : h.auth,
}));

import * as activities from "./use-activities";
import * as clinic from "./use-clinic";
import * as messaging from "./use-messaging";
import { useMyChildren } from "./use-children";

const api = h.api;

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.auth.user = { id: "user-1", role: "PARENT" };
});

/**
 * The school-life hooks: activities, the clinic, and the messaging additions.
 *
 * Each one is a query that reads one endpoint or a mutation that writes one.
 * The table checks the endpoint each hook claims, because a hook pointed at
 * the wrong url still passes every page test written against a stub.
 */

const queries: QueryCase[] = [
  { name: "useActivities", hook: () => activities.useActivities({ kind: "TRIP" }), url: "/activities" },
  { name: "useUpcomingActivities", hook: () => activities.useUpcomingActivities(3), url: "/activities/upcoming" },
  { name: "useActivity", hook: () => activities.useActivity("act-1"), url: "/activities/act-1" },
  { name: "useStudentActivities", hook: () => activities.useStudentActivities("student-1"), url: "/activities/student/student-1" },
  { name: "useConsentSummary", hook: () => activities.useConsentSummary("act-1"), url: "/activities/act-1/consent" },
  { name: "useClinicVisits", hook: () => clinic.useClinicVisits({ inSickBay: "true" }), url: "/clinic/visits" },
  { name: "useClinicVisit", hook: () => clinic.useClinicVisit("visit-1"), url: "/clinic/visits/visit-1" },
  { name: "useClinicSummary", hook: () => clinic.useClinicSummary(7), url: "/clinic/summary" },
  { name: "useEmergencyCard", hook: () => clinic.useEmergencyCard("student-1"), url: "/clinic/student/student-1" },
  { name: "useStudentVisits", hook: () => clinic.useStudentVisits("student-1"), url: "/clinic/student/student-1/visits" },
  { name: "useStudentMedication", hook: () => clinic.useStudentMedication("student-1"), url: "/clinic/student/student-1/medication" },
  { name: "useParticipants", hook: () => messaging.useParticipants("conv-1"), url: "/messaging/conversations/conv-1/participants" },
];

const mutations: MutationCase[] = [
  { name: "useCreateActivity", hook: () => activities.useCreateActivity(), method: "post", url: "/activities" },
  { name: "useUpdateActivity", hook: () => activities.useUpdateActivity(), method: "put", url: "/activities/id-1" },
  { name: "useCancelActivity", hook: () => activities.useCancelActivity(), arg: { id: "act-1", reason: "Rain" }, method: "post", url: "/activities/act-1/cancel" },
  { name: "useDeleteActivity", hook: () => activities.useDeleteActivity(), arg: "act-1", method: "delete", url: "/activities/act-1" },
  { name: "useAddParticipant", hook: () => activities.useAddParticipant(), arg: { activityId: "act-1", studentId: "student-1" }, method: "post", url: "/activities/act-1/participants" },
  { name: "useAddClassToActivity", hook: () => activities.useAddClassToActivity(), arg: { activityId: "act-1", classSectionId: "section-1" }, method: "post", url: "/activities/act-1/participants/class" },
  { name: "useRemoveParticipant", hook: () => activities.useRemoveParticipant(), arg: { activityId: "act-1", studentId: "student-1" }, method: "delete", url: "/activities/act-1/participants/student-1" },
  { name: "useRecordConsent", hook: () => activities.useRecordConsent(), arg: { activityId: "act-1", studentId: "student-1", consent: "GIVEN" }, method: "post", url: "/activities/act-1/consent" },
  { name: "useActivityAttendance", hook: () => activities.useActivityAttendance(), arg: { activityId: "act-1", records: [] }, method: "post", url: "/activities/act-1/attendance" },
  { name: "useCreateVisit", hook: () => clinic.useCreateVisit(), method: "post", url: "/clinic/visits" },
  { name: "useUpdateVisit", hook: () => clinic.useUpdateVisit(), method: "put", url: "/clinic/visits/id-1" },
  { name: "useDischarge", hook: () => clinic.useDischarge(), arg: "visit-1", method: "post", url: "/clinic/visits/visit-1/discharge" },
  { name: "useMarkParentNotified", hook: () => clinic.useMarkParentNotified(), arg: "visit-1", method: "post", url: "/clinic/visits/visit-1/parent-notified" },
  { name: "useGiveMedicine", hook: () => clinic.useGiveMedicine(), method: "post", url: "/clinic/medication" },
  { name: "useSaveHealthRecord", hook: () => clinic.useSaveHealthRecord(), arg: { studentId: "student-1", allergyNotes: "Peanuts" }, method: "put", url: "/clinic/student/student-1" },
  { name: "useBroadcast", hook: () => messaging.useBroadcast(), method: "post", url: "/messaging/broadcast" },
  { name: "useAddParticipants", hook: () => messaging.useAddParticipants(), arg: { conversationId: "conv-1", userIds: ["u-1"] }, method: "post", url: "/messaging/conversations/conv-1/participants" },
  { name: "useRemoveMember", hook: () => messaging.useRemoveParticipant(), arg: { conversationId: "conv-1", userId: "u-1" }, method: "delete", url: "/messaging/conversations/conv-1/participants/u-1" },
  { name: "useRenameConversation", hook: () => messaging.useRenameConversation(), arg: { conversationId: "conv-1", name: "New" }, method: "put", url: "/messaging/conversations/conv-1/name" },
];

describe("school-life queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("school-life mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});

/**
 * The hooks whose behaviour is more than a url.
 */
describe("the ones that do something extra", () => {
  it("asks for nothing until it has an id to ask about", async () => {
    resolveAll(api, []);
    renderDisabled(() => activities.useActivity(undefined));
    expect(api.get).not.toHaveBeenCalled();
  });

  it("asks for no consent counts without an activity", async () => {
    resolveAll(api, {});
    renderDisabled(() => activities.useConsentSummary(undefined));
    expect(api.get).not.toHaveBeenCalled();
  });

  it("asks for no emergency card without a student", async () => {
    resolveAll(api, {});
    renderDisabled(() => clinic.useEmergencyCard(undefined));
    expect(api.get).not.toHaveBeenCalled();
  });

  // Adding a whole class says how many landed, because "done" tells a person
  // nothing about whether the right class was picked.
  it("says how many a class sign-up added", async () => {
    resolveAll(api, { added: 32 });
    await runMutation(() => activities.useAddClassToActivity(), {
      activityId: "act-1",
      classSectionId: "section-1",
    });
    expect(h.toast.success).toHaveBeenCalledWith("32 added to the list");
  });

  it("says how many the register covered", async () => {
    resolveAll(api, { marked: 18 });
    await runMutation(() => activities.useActivityAttendance(), {
      activityId: "act-1",
      records: [],
    });
    expect(h.toast.success).toHaveBeenCalledWith("Register taken for 18");
  });

  it("words a consent answer for the answer that was given", async () => {
    resolveAll(api, { id: "p-1" });
    await runMutation(() => activities.useRecordConsent(), {
      activityId: "act-1",
      studentId: "student-1",
      consent: "GIVEN",
    });
    expect(h.toast.success).toHaveBeenCalledWith("Permission given");

    h.toast.success.mockReset();
    await runMutation(() => activities.useRecordConsent(), {
      activityId: "act-1",
      studentId: "student-1",
      consent: "REFUSED",
    });
    expect(h.toast.success).toHaveBeenCalledWith("Recorded as refused");
  });

  // A cancelled trip is a thing that happened, and the message says so rather
  // than reporting a deletion.
  it("says a cancellation is visible to the families concerned", async () => {
    resolveAll(api, {});
    await runMutation(() => activities.useCancelActivity(), {
      id: "act-1",
      reason: "The bus broke down",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      "Called off. Everyone concerned can see why.",
    );
  });

  it("says how many an announcement reached", async () => {
    resolveAll(api, { recipients: 143 });
    await runMutation(() => messaging.useBroadcast(), { audience: "ALL_PARENTS" });
    expect(h.toast.success).toHaveBeenCalledWith("Sent to 143 people");
  });

  // Nobody should find out they addressed four hundred families by doing it,
  // so the preview must not fire on a half-described audience.
  it("previews an audience only once one is given", async () => {
    resolveAll(api, { count: 12 });
    renderDisabled(() => messaging.usePreviewAudience(null));
    expect(api.post).not.toHaveBeenCalled();

    const ok = await runQuery(() =>
      messaging.usePreviewAudience({ audience: "ALL_PARENTS" }),
    );
    expect(ok.current.data).toEqual({ count: 12 });
    expect(calledUrls(api).join(" ")).toContain("/messaging/broadcast/preview");
  });

  it("uploads an attachment as form data", async () => {
    resolveAll(api, { fileUrl: "/uploads/attachments/a.pdf", fileName: "a.pdf" });
    await runMutation(
      () => messaging.useUploadAttachment(),
      new File(["x"], "a.pdf", { type: "application/pdf" }),
    );
    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe("/messaging/attachments");
    expect(body).toBeInstanceOf(FormData);
    expect(config.headers["Content-Type"]).toBe("multipart/form-data");
  });

  it("says why an upload was refused", async () => {
    api.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "That kind of file cannot be sent" },
      },
    });
    await runMutation(
      () => messaging.useUploadAttachment(),
      new File(["x"], "a.svg", { type: "image/svg+xml" }),
    );
    expect(h.toast.error).toHaveBeenCalledWith("That kind of file cannot be sent");
  });
});

/**
 * The parent's children, which every parent page begins by working out.
 */
describe("useMyChildren", () => {
  const link = (id: string, first: string) => ({
    student: {
      id,
      studentIdNumber: `STD-2026-${id}`,
      classSection: { name: "A" },
      user: { firstName: first, lastName: "Niyonkuru" },
    },
  });

  it("reads the link off the signed-in user's record", async () => {
    resolveAll(api, { parentStudents: [link("student-1", "Divine")] });
    const result = await runQuery(() => useMyChildren());
    expect(api.get).toHaveBeenCalledWith("/users/user-1");
    expect(result.current.data).toEqual([
      {
        id: "student-1",
        name: "Divine Niyonkuru",
        studentIdNumber: "STD-2026-student-1",
        className: "A",
      },
    ]);
  });

  it("asks for nothing when nobody is signed in", async () => {
    h.auth.user = null;
    resolveAll(api, {});
    renderDisabled(() => useMyChildren());
    expect(api.get).not.toHaveBeenCalled();
  });

  it("gives an empty list rather than throwing when there are no links", async () => {
    resolveAll(api, {});
    const result = await runQuery(() => useMyChildren());
    expect(result.current.data).toEqual([]);
  });

  // A half-populated link would otherwise crash every parent page on
  // `ps.student.user.firstName`.
  it("skips a link with no student attached", async () => {
    resolveAll(api, {
      parentStudents: [{ student: null }, link("student-2", "Keza")],
    });
    const result = await runQuery(() => useMyChildren());
    expect(result.current.data).toHaveLength(1);
  });
});
