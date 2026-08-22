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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/settings",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders, signIn } from "@/test/harness";
import { serve } from "@/test/page";
import { useBrandStore } from "@/stores/brand-store";

import { BrandingTab } from "./branding-tab";

/**
 * The school's own identity: colour, logo, stamp and signature.
 *
 * The stamp and signature end up printed on report cards, so an upload that
 * fails silently would be found only when a term's cards come out blank. Both
 * outcomes have to be said out loud.
 */

const config = {
  map: {
    primary_color: "#1B4F72",
    logo_url: "/uploads/branding/logo.png",
  },
};

const routes = {
  "/school-config": config,
  "/school-config/bulk": { ok: true },
  "/school-config/upload/logo": { url: "/uploads/branding/logo.png" },
  "/school-config/upload/stamp": { url: "/uploads/branding/stamp.png" },
  "/school-config/upload/signature": { url: "/uploads/branding/signature.png" },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  signIn("ADMIN");
  renderWithProviders(<BrandingTab />);
  await waitFor(() => expect(screen.getByLabelText(/^color$/i)).toBeInTheDocument());
}

/** The hidden file input beside one asset's Upload or Replace label. */
function fileInputFor(type: RegExp) {
  const label = screen
    .getAllByText(type)
    .map((el) => el.closest("div"))
    .find(Boolean);
  return label?.querySelector<HTMLInputElement>('input[type="file"]') ?? null;
}

async function upload(input: HTMLInputElement | null, name = "logo.png") {
  expect(input).toBeTruthy();
  const file = new File(["image-bytes"], name, { type: "image/png" });
  await act(async () => {
    fireEvent.change(input!, { target: { files: [file] } });
  });
}

describe("the school colour", () => {
  it("opens on the colour the school already uses", async () => {
    await mount();
    expect((screen.getByLabelText(/^color$/i) as HTMLInputElement).value).toBe("#1b4f72");
  });

  it("falls back to the house colour when none is set", async () => {
    serve(h.api, { ...routes, "/school-config": { map: {} } });
    signIn("ADMIN");
    renderWithProviders(<BrandingTab />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^color$/i) as HTMLInputElement).value).toBe("#1b4f72"),
    );
  });

  it("saves the colour that was picked", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^color$/i), { target: { value: "#0f6b3c" } });
    });

    h.api.post.mockClear();
    h.api.put.mockClear();
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/^color$/i).closest("form")!);
    });

    await waitFor(() => {
      const calls = [...h.api.post.mock.calls, ...h.api.put.mock.calls];
      expect(calls.length).toBeGreaterThan(0);
      expect(JSON.stringify(calls[0])).toMatch(/0f6b3c/i);
    });
  });

  // The shell repaints only once the save landed, so a failed save does not
  // leave the app wearing a colour the server never accepted.
  it("repaints the app only after the save lands", async () => {
    await mount();
    useBrandStore.setState({ primaryColor: "#1B4F72" });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^color$/i), { target: { value: "#0f6b3c" } });
    });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/^color$/i).closest("form")!);
    });

    await waitFor(() =>
      expect(useBrandStore.getState().primaryColor.toLowerCase()).toBe("#0f6b3c"),
    );
  });

  it("leaves the app's colour alone when the save is refused", async () => {
    await mount();
    useBrandStore.setState({ primaryColor: "#1B4F72" });
    h.api.post.mockRejectedValue({ response: { status: 500 } });
    h.api.put.mockRejectedValue({ response: { status: 500 } });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^color$/i), { target: { value: "#0f6b3c" } });
    });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/^color$/i).closest("form")!);
    });

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(useBrandStore.getState().primaryColor.toLowerCase()).toBe("#1b4f72");
  });
});

describe("the school's assets", () => {
  it("offers all three", async () => {
    await mount();
    expect(screen.getByText("logo")).toBeInTheDocument();
    expect(screen.getByText("stamp")).toBeInTheDocument();
    expect(screen.getByText("signature")).toBeInTheDocument();
  });

  // "Replace" where one exists, "Upload" where none does, so the admin can see
  // at a glance what the school is missing.
  // Waits for the config, since both labels depend on what the school has
  // already uploaded rather than on the tab rendering.
  it("says Replace where an asset exists and Upload where it does not", async () => {
    await mount();
    await waitFor(() => expect(screen.getByText("Replace")).toBeInTheDocument());
    expect(screen.getAllByText("Upload")).toHaveLength(2);
  });

  it("shows the logo the school already has", async () => {
    await mount();
    const img = await waitFor(() => screen.getByAltText(/current logo/i));
    expect((img as HTMLImageElement).getAttribute("src")).toMatch(/logo\.png/);
  });

  it("uploads to the endpoint for that asset", async () => {
    await mount();
    h.api.post.mockClear();
    await upload(fileInputFor(/^stamp$/), "stamp.png");

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/school-config/upload/stamp"),
      );
      expect(call).toBeTruthy();
      expect(call![1]).toBeInstanceOf(FormData);
    });
  });

  it("sends it as multipart, which is what the endpoint takes", async () => {
    await mount();
    h.api.post.mockClear();
    await upload(fileInputFor(/^logo$/));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/school-config/upload/"),
      );
      expect((call![2] as any)?.headers?.["Content-Type"]).toBe("multipart/form-data");
    });
  });

  it("says so once the asset is in", async () => {
    await mount();
    await upload(fileInputFor(/^logo$/));

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
  });

  // A stamp that silently failed to upload is found when a term's report cards
  // come out unstamped.
  it("says so when the upload fails", async () => {
    await mount();
    h.api.post.mockRejectedValue({ response: { status: 413 } });
    h.toast.error.mockClear();
    await upload(fileInputFor(/^signature$/), "signature.png");

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/signature/i)),
    );
  });

  it("uploads nothing when the picker is dismissed", async () => {
    await mount();
    h.api.post.mockClear();
    const input = fileInputFor(/^logo$/);
    await act(async () => {
      fireEvent.change(input!, { target: { files: [] } });
    });

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });
});
