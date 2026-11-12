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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/exams",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import ExamsPage from "./page";

const exam = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  classSectionId: "c1",
  subjectId: "sub-math",
  termId: "t1",
  examDate: "2026-11-10T00:00:00.000Z",
  startTime: "08:00",
  endTime: "10:00",
  room: "Hall A",
  syllabus: "Chapters 1 to 5",
  subject: { name: "Mathematics" },
  ...over,
});

const routes = (exams: unknown[]) => ({
  "/academic/years": [{ id: "y1", terms: [{ id: "t1", name: "Term 3" }] }],
  "/academic/sections": [{ id: "c1", name: "A", classLevel: { name: "Senior 4" } }],
  "/academic/subjects": [
    { id: "sub-math", name: "Mathematics" },
    { id: "sub-phy", name: "Physics" },
  ],
  "/academic/exams": exams,
});

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes([exam()]));
});

const pick = async () => {
  renderPage(ExamsPage, { role: "HEAD_TEACHER" });
  await screen.findByRole("option", { name: "Senior 4 A" });
  await screen.findByRole("option", { name: "Term 3" });
  fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c1" } });
  fireEvent.change(screen.getByLabelText("Term"), { target: { value: "t1" } });
};

/** The exam timetable: by day, with clashes marked. */
describe("the exam timetable", () => {
  it("asks for a class and a term before showing anything", async () => {
    renderPage(ExamsPage, { role: "HEAD_TEACHER" });
    expect(
      await screen.findByText("Pick a class and a term to see its exam timetable."),
    ).toBeInTheDocument();
    expect(h.api.get).not.toHaveBeenCalledWith("/academic/exams", expect.anything());
  });

  it("shows each paper with its time, room and what it covers", async () => {
    await pick();
    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("08:00 to 10:00")).toBeInTheDocument();
    expect(screen.getByText("Hall A")).toBeInTheDocument();
    expect(screen.getByText("Chapters 1 to 5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Arrangements for Mathematics" })).toHaveAttribute(
      "href",
      "/admin/exams/e1/arrangements",
    );
  });

  it("puts the papers of one day in time order, days in date order", async () => {
    serve(
      h.api,
      routes([
        exam({ id: "late", startTime: "13:00", endTime: "15:00", subject: { name: "Physics" } }),
        exam({ id: "next", examDate: "2026-11-11T00:00:00.000Z", subject: { name: "English" } }),
        exam({ id: "early" }),
      ]),
    );
    await pick();
    await screen.findByText("Physics");
    const order = screen.getAllByText(/^(Mathematics|Physics|English)$/).map((n) => n.textContent);
    expect(order).toEqual(["Mathematics", "Physics", "English"]);
  });

  it("marks two papers that overlap", async () => {
    serve(
      h.api,
      routes([
        exam(),
        exam({ id: "e2", startTime: "09:00", endTime: "11:00", subject: { name: "Physics" }, room: null, syllabus: null }),
      ]),
    );
    await pick();
    expect(await screen.findByText("Two papers overlap for this class. They are marked below.")).toBeInTheDocument();
    expect(screen.getAllByText("Overlaps")).toHaveLength(2);
  });

  it("says so when nothing is timetabled", async () => {
    serve(h.api, routes([]));
    await pick();
    expect(
      await screen.findByText("No exams have been timetabled for this class yet."),
    ).toBeInTheDocument();
  });

  it("names a paper whose subject has gone", async () => {
    serve(h.api, routes([exam({ subject: undefined })]));
    await pick();
    expect(await screen.findByText("A subject")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit this exam" })).toBeInTheDocument();
  });
});

describe("changing the timetable", () => {
  it("adds a paper for the class and term chosen", async () => {
    await pick();
    await screen.findByText("Mathematics");
    fireEvent.click(screen.getByRole("button", { name: /Add an exam/ }));
    const dialog = await screen.findByRole("dialog", { name: "Add an exam" });
    fireEvent.change(within(dialog).getByLabelText("Subject"), { target: { value: "sub-phy" } });
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2026-11-12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add it" }));
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/academic/exams", {
        classSectionId: "c1",
        termId: "t1",
        subjectId: "sub-phy",
        examDate: "2026-11-12",
        startTime: "08:00",
        endTime: "10:00",
        room: undefined,
        syllabus: undefined,
      }),
    );
    expect(h.toast.success).toHaveBeenCalledWith("Exam added to the timetable");
  });

  it("edits a paper in place", async () => {
    await pick();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit this exam" });
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-11-10");
    fireEvent.change(within(dialog).getByLabelText(/Room/), { target: { value: "Hall B" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith(
        "/academic/exams/e1",
        expect.objectContaining({ room: "Hall B", syllabus: "Chapters 1 to 5" }),
      ),
    );
    expect(h.toast.success).toHaveBeenCalledWith("Exam updated");
  });

  it("removes a paper", async () => {
    await pick();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Mathematics" }));
    await waitFor(() => expect(h.api.delete).toHaveBeenCalledWith("/academic/exams/e1"));
    expect(h.toast.success).toHaveBeenCalledWith("Exam removed from the timetable");
  });

  it("closes the form without saving", async () => {
    await pick();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit this exam" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Add an exam/ }));
    await screen.findByRole("dialog", { name: "Add an exam" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.put).not.toHaveBeenCalled();
  });

  it.each([
    ["post", "Add an exam", "Add it", "Could not add that exam"],
    ["delete", null, null, "Could not remove that exam"],
    ["put", "Edit Mathematics", "Save", "Could not update that exam"],
  ] as const)("says why a %s failed", async (method, open, submit, message) => {
    await pick();
    await screen.findByText("Mathematics");
    h.api[method].mockRejectedValue({ response: { data: { message: "" } } });
    if (method === "delete") {
      fireEvent.click(screen.getByRole("button", { name: "Remove Mathematics" }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(open!) }));
      const dialog = await screen.findByRole("dialog");
      if (method === "post") {
        fireEvent.change(within(dialog).getByLabelText("Subject"), { target: { value: "sub-phy" } });
        fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2026-11-12" } });
      }
      fireEvent.click(within(dialog).getByRole("button", { name: submit! }));
    }
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(message));
  });
});
