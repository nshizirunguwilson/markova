import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    exportData: vi.fn(),
  };
});
vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/export", () => ({ exportData: h.exportData }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/photo-consent",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { fireEvent, screen, within } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import PhotoConsentPage from "./page";

const row = (n: number, over: Record<string, unknown> = {}) => ({
  studentId: `s${n}`,
  userId: `u${n}`,
  name: `Student ${n}`,
  studentIdNumber: `STD-2025-${String(n).padStart(4, "0")}`,
  class: "Senior 1 A",
  hasPhoto: true,
  forId: "YES",
  inApp: "YES",
  publicity: "YES",
  ...over,
});

const students = [
  row(1, { name: "Keza Habimana" }),
  row(2, { name: "Eric Mugisha", publicity: "NO", inApp: "NO" }),
  row(3, { name: "Aline Uwase", publicity: "NOT_ASKED", hasPhoto: false }),
  row(4, { name: "Divine Iradukunda", forId: "NO", publicity: "NO" }),
];

const register = (list = students) => ({
  counts: { students: list.length, notAsked: 1, mayPublish: 1, notInApp: 1, notOnCard: 1 },
  students: list,
});

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  h.exportData.mockReset();
  serve(h.api, {
    "/photo-consent/register": register(),
    "/students/s1/photo-consent": {
      forId: "YES",
      inApp: "YES",
      publicity: "YES",
      answeredBy: "FAMILY",
      mayAnswer: true,
      history: [],
    },
  });
});

const show = (view: string) =>
  fireEvent.change(screen.getByLabelText("Show"), { target: { value: view } });

/** What every family agreed to for the photo (B6). */
describe("the photos page", () => {
  it("counts who may appear, who was never asked, and each No", async () => {
    renderPage(PhotoConsentPage, { role: "ADMIN" });
    expect(await screen.findByText("May appear in publicity", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Not asked yet", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("No to the app", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("No to cards", { selector: "p" })).toBeInTheDocument();
  });

  it("starts with who may appear in publicity: Yes only", async () => {
    renderPage(PhotoConsentPage, { role: "ADMIN" });
    const list = await screen.findByRole("list", { name: "Photo answers" });
    expect(list).toHaveTextContent("Keza Habimana");
    expect(list).not.toHaveTextContent("Aline Uwase");
    expect(within(list).getByText("Publicity: Yes")).toBeInTheDocument();
  });

  it.each([
    ["not-publish", ["Eric Mugisha", "Aline Uwase", "Divine Iradukunda"], ["Keza Habimana"]],
    ["not-asked", ["Aline Uwase"], ["Keza Habimana"]],
    ["not-app", ["Eric Mugisha"], ["Aline Uwase"]],
    ["not-card", ["Divine Iradukunda"], ["Eric Mugisha"]],
    ["all", ["Keza Habimana", "Divine Iradukunda"], []],
  ])("shows %s", async (view, shown, hidden) => {
    renderPage(PhotoConsentPage, { role: "ADMIN" });
    await screen.findByRole("list", { name: "Photo answers" });
    show(view);
    const list = screen.getByRole("list", { name: "Photo answers" });
    for (const n of shown) expect(list).toHaveTextContent(n);
    for (const n of hidden) expect(list).not.toHaveTextContent(n);
  });

  it("says when a student has no photo on file", async () => {
    renderPage(PhotoConsentPage, { role: "ADMIN" });
    await screen.findByRole("list", { name: "Photo answers" });
    show("not-asked");
    expect(screen.getByText(/no photo on file/)).toBeInTheDocument();
  });

  it("finds a student by name or number", async () => {
    renderPage(PhotoConsentPage, { role: "ADMIN" });
    await screen.findByRole("list", { name: "Photo answers" });
    show("all");
    fireEvent.change(screen.getByLabelText("Find a student"), { target: { value: "STD-2025-0002" } });
    const list = screen.getByRole("list", { name: "Photo answers" });
    expect(list).toHaveTextContent("Eric Mugisha");
    expect(list).not.toHaveTextContent("Keza Habimana");
    fireEvent.change(screen.getByLabelText("Find a student"), { target: { value: "nobody" } });
    expect(screen.getByText("Nobody here.")).toBeInTheDocument();
  });

  it("exports the list on show, answers in words", async () => {
    renderPage(PhotoConsentPage, { role: "ADMIN" });
    await screen.findByRole("list", { name: "Photo answers" });
    show("not-publish");
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(await screen.findByText(/csv/i));
    expect(h.exportData).toHaveBeenCalledWith(
      "csv",
      expect.objectContaining({
        filename: "photo-consent-not-publish",
        title: "Photos: Must not appear in publicity",
        data: expect.arrayContaining([
          expect.objectContaining({ name: "Aline Uwase", _publicity: "Not asked yet", _forId: "Yes" }),
          expect.objectContaining({ name: "Eric Mugisha", _inApp: "No" }),
        ]),
      }),
    );
  });

  it("opens one student's answers for the office to copy a form in", async () => {
    renderPage(PhotoConsentPage, { role: "ADMIN" });
    fireEvent.click(await screen.findByText("Keza Habimana"));
    const dialog = await screen.findByRole("dialog", { name: "Keza Habimana" });
    expect(await within(dialog).findByRole("button", { name: "Copy in a signed form" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("shows a hundred at a time", async () => {
    serve(h.api, {
      "/photo-consent/register": register(Array.from({ length: 150 }, (_, i) => row(i + 1))),
    });
    renderPage(PhotoConsentPage, { role: "ADMIN" });
    const list = await screen.findByRole("list", { name: "Photo answers" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(100);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(150);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
});
