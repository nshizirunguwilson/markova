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
  usePathname: () => "/admin/audit",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import AuditPage from "./page";

const entry = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  action: "DELETE",
  entityType: "support-plan",
  entityId: "s1",
  newValue: '{"reason":"moved school"}',
  oldValue: null,
  ipAddress: null,
  createdAt: "2026-10-12T08:30:00.000Z",
  user: { firstName: "Speciose", lastName: "Mukarugwiza", role: "HEAD_TEACHER", email: null },
  ...over,
});

const trail = (entries: unknown[], meta: Record<string, number> = {}) => ({
  data: entries,
  meta: { page: 1, limit: 25, total: entries.length, pages: 1, ...meta },
});

let lastParams: Record<string, unknown> = {};
const routes = (answer: unknown) => ({
  "/audit/filters": { entityTypes: ["support-plan", "users"], actions: ["POST", "DELETE", "VIEW"] },
  "/audit": answer,
});

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  serve(h.api, routes(trail([entry()])));
  const plain = h.api.get.getMockImplementation()!;
  h.api.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === "/audit") lastParams = config?.params ?? {};
    return plain(url, config);
  });
});

/** Who changed what, for the principal. */
describe("the audit trail", () => {
  it("says who did what, to what, in words", async () => {
    renderPage(AuditPage, { role: "ADMIN" });
    expect(await screen.findByText("Speciose Mukarugwiza")).toBeInTheDocument();
    expect(screen.getByText("Deleted", { selector: "td *" })).toBeInTheDocument();
    expect(screen.getByText("Support plan", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("1 change")).toBeInTheDocument();
  });

  it("shows what was sent only when asked", async () => {
    renderPage(AuditPage, { role: "ADMIN" });
    fireEvent.click(await screen.findByRole("button", { name: "Show" }));
    expect(screen.getByText('{"reason":"moved school"}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText('{"reason":"moved school"}')).toBeNull();
  });

  it("copes with a deleted account, a withheld body, nothing sent, and an unknown verb", async () => {
    serve(
      h.api,
      routes(
        trail([
          entry({ id: "a1", user: null, newValue: "[unreadable]" }),
          entry({ id: "a2", action: "VIEW", entityType: null, newValue: null }),
        ]),
      ),
    );
    renderPage(AuditPage, { role: "ADMIN" });
    expect(await screen.findByText("A deleted account")).toBeInTheDocument();
    expect(screen.getByText("Withheld")).toBeInTheDocument();
    expect(screen.getByText("VIEW", { selector: "td *" })).toBeInTheDocument();
    expect(screen.getByText("Something")).toBeInTheDocument();
    expect(screen.getByText("2 changes")).toBeInTheDocument();
  });

  it("says so when nothing has changed yet", async () => {
    serve(h.api, routes(trail([])));
    renderPage(AuditPage, { role: "ADMIN" });
    expect(await screen.findByText("Nothing has been changed yet.")).toBeInTheDocument();
  });
});

describe("narrowing it down", () => {
  it("filters by kind, action and dates, back to page one, and clears", async () => {
    renderPage(AuditPage, { role: "ADMIN" });
    await screen.findByText("Speciose Mukarugwiza");
    await screen.findByRole("option", { name: "Support plan" });
    fireEvent.change(screen.getByLabelText("Kind of record"), { target: { value: "support-plan" } });
    fireEvent.change(screen.getByLabelText("What happened"), { target: { value: "DELETE" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-12" } });
    await waitFor(() =>
      expect(lastParams).toMatchObject({
        entityType: "support-plan",
        action: "DELETE",
        from: "2026-10-01",
        to: "2026-10-12",
        page: 1,
      }),
    );
    expect(screen.getByRole("option", { name: "VIEW" })).toBeInTheDocument();

    serve(h.api, routes(trail([])));
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "" } });
    expect(await screen.findByText("Nothing matches those filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    await waitFor(() => expect(screen.getByLabelText("Kind of record")).toHaveValue(""));
  });

  it("pages through a long trail", async () => {
    serve(h.api, routes(trail([entry()], { total: 60, pages: 3, page: 2 })));
    const plain = h.api.get.getMockImplementation()!;
    h.api.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === "/audit") lastParams = config?.params ?? {};
      return plain(url, config);
    });
    renderPage(AuditPage, { role: "ADMIN" });
    expect(await screen.findByText("2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastParams.page).toBe(2));
    await screen.findByText("2 of 3");
    fireEvent.click(await screen.findByRole("button", { name: "Previous" }));
    await waitFor(() => expect(lastParams.page).toBe(1));
  });
});
