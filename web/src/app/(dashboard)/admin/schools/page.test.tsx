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
  usePathname: () => "/admin/schools",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import PlatformSchoolsPage, { suggestSlug } from "./page";

const schools = [
  {
    id: "school-1",
    name: "Markova Academy",
    slug: "markova",
    isActive: true,
    createdAt: "2026-01-05T08:00:00.000Z",
    people: 48,
    students: 540,
  },
  {
    id: "school-2",
    name: "G.S. Umucyo",
    slug: "umucyo",
    isActive: false,
    createdAt: "2026-02-10T08:00:00.000Z",
    people: 12,
    students: 130,
  },
];

const owner = { platformRole: "OWNER" as const };

const takenOn = {
  school: { id: "school-3", name: "G.S. Nyamirambo", slug: "gs-nyamirambo" },
  principal: {
    id: "user-9",
    name: "Chantal Mukamana",
    email: null,
    phone: "+250788123456",
  },
  tempPassword: "Kw7#mqPz2r",
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  serve(h.api, { "/schools": schools });
});

const fillPrincipal = () => {
  fireEvent.change(screen.getByLabelText(/school name/i), {
    target: { value: "G.S. Nyamirambo" },
  });
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: "Chantal" },
  });
  fireEvent.change(screen.getByLabelText(/last name/i), {
    target: { value: "Mukamana" },
  });
  fireEvent.change(screen.getByLabelText(/phone/i), {
    target: { value: "+250788123456" },
  });
};

/** The platform's own page: the owner takes schools on (#18). */
describe("the schools page", () => {
  it("refuses an admin who is not the platform owner", async () => {
    renderPage(PlatformSchoolsPage);
    expect(
      await screen.findByText(/only the owner of markova/i),
    ).toBeInTheDocument();
    // It never even asks: the refusal is the page, not an error from the API.
    expect(h.api.get).not.toHaveBeenCalled();
  });

  it("lists every school with its people", async () => {
    renderPage(PlatformSchoolsPage, { user: owner });
    expect(await screen.findByText("Markova Academy")).toBeInTheDocument();
    expect(screen.getByText("G.S. Umucyo")).toBeInTheDocument();
    expect(screen.getByText("540")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("suggests the short name from the school's name", () => {
    expect(suggestSlug("G.S. Nyamirambo")).toBe("g-s-nyamirambo");
    expect(suggestSlug("  École  Belge ")).toBe("cole-belge");
  });

  it("takes a school on and shows the one-time password", async () => {
    serve(h.api, { "/schools": schools });
    h.api.post.mockResolvedValue({ data: takenOn });
    renderPage(PlatformSchoolsPage, { user: owner });
    await screen.findByText("Markova Academy");

    fireEvent.click(screen.getByRole("button", { name: /take a school on/i }));
    fillPrincipal();
    // The slug followed the name without being typed.
    expect(screen.getByLabelText(/short name/i)).toHaveValue("g-s-nyamirambo");
    fireEvent.click(screen.getByRole("button", { name: /take it on/i }));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/schools", {
        name: "G.S. Nyamirambo",
        slug: "g-s-nyamirambo",
        admin: {
          firstName: "Chantal",
          lastName: "Mukamana",
          email: undefined,
          phone: "+250788123456",
        },
      }),
    );
    expect(await screen.findByText("Kw7#mqPz2r")).toBeInTheDocument();
    expect(screen.getByText(/shown this once/i)).toBeInTheDocument();
  });

  it("says when the principal keeps the password they already have", async () => {
    h.api.post.mockResolvedValue({
      data: { ...takenOn, tempPassword: null },
    });
    renderPage(PlatformSchoolsPage, { user: owner });
    await screen.findByText("Markova Academy");

    fireEvent.click(screen.getByRole("button", { name: /take a school on/i }));
    fillPrincipal();
    fireEvent.click(screen.getByRole("button", { name: /take it on/i }));

    expect(
      await screen.findByText(/their own password carries over/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/temporary password/i)).not.toBeInTheDocument();
  });
  it("says so when no school has been taken on yet", async () => {
    serve(h.api, { "/schools": [] });
    renderPage(PlatformSchoolsPage, { user: owner });
    expect(
      await screen.findByText(/No schools yet\. Take the first one on\./),
    ).toBeInTheDocument();
  });

  it("keeps a short name the owner typed, and takes a principal by email alone", async () => {
    h.api.post.mockResolvedValue({ data: takenOn });
    renderPage(PlatformSchoolsPage, { user: owner });
    await screen.findByText("Markova Academy");

    fireEvent.click(screen.getByRole("button", { name: /take a school on/i }));
    fireEvent.change(screen.getByLabelText(/short name/i), {
      target: { value: "nyamirambo" },
    });
    fillPrincipal();
    // Typed by hand, so the name no longer rewrites it.
    expect(screen.getByLabelText(/short name/i)).toHaveValue("nyamirambo");
    fireEvent.change(screen.getByLabelText(/phone/i), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "c.mukamana@markova.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: /take it on/i }));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/schools",
        expect.objectContaining({
          slug: "nyamirambo",
          admin: expect.objectContaining({
            email: "c.mukamana@markova.edu",
            phone: undefined,
          }),
        }),
      ),
    );
  });
});
